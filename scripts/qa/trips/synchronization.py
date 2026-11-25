"""Two-account synchronization latency, with a simulated Phoenix transport."""
import argparse,base64,json,re,statistics,tempfile,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:3106');parser.add_argument('--output',type=Path,default=Path(tempfile.gettempdir())/'nagi-trip-qa');parser.add_argument('--legacy',action='store_true');args=parser.parse_args();ROOT=args.url
PATH='/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc'
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
def auth(sub):
 now=int(time.time());token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':sub,'aud':'authenticated','role':'authenticated','iat':now,'exp':now+86400})+'.c2lnbmF0dXJl'
 return 'base64-'+enc({'access_token':token,'refresh_token':'fixture-refresh','expires_at':now+86400,'token_type':'bearer','expires_in':86400})
def config(v):
 tmp=args.output/'config.tmp';tmp.write_text(json.dumps(v), encoding='utf-8');tmp.replace(args.output/'config.json')
with sync_playwright() as p:
 browser=p.chromium.launch();contexts=[];pages=[];errors=[]
 for sub in ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']:
  c=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');c.add_cookies([{'name':'nagi-auth','value':auth(sub),'url':ROOT}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(ROOT+PATH,wait_until='domcontentloaded');page.get_by_role('tab',name='Calendrier',exact=True).click();expect(page.locator('[data-calendar-item-id]').first).to_be_visible();contexts.append(c);pages.append(page)
 a,b=pages;data=json.loads((args.output/'state.json').read_text(encoding='utf-8'));id=next(i for i in data['items'] if i['entry_id']==data['entries'][4])['id'];rows=[];config({'delay':500})
 try:
  for index,(name,hex) in enumerate(([('Bleu Nagi','#73A6DF'),('Vert','#69AA91'),('Orange','#D9A16C'),('Violet','#A28BC9')]*6)[:21]):
   b.evaluate("""({id,hex})=>{window.__remote=0;const e=document.querySelector(`[data-calendar-item-id="${id}"]`);const observer=new MutationObserver(()=>{if(e.style.getPropertyValue('--trip-calendar-color')===hex){window.__remote=Date.now();observer.disconnect()}});observer.observe(e,{attributes:true,attributeFilter:['style']})}""",{'id':id,'hex':hex})
   a.locator(f'[data-calendar-item-id="{id}"]').click(button='right',position={'x':30,'y':10});a.evaluate("document.addEventListener('pointerup',()=>window.__start=Date.now(),{capture:true,once:true})");a.get_by_role('menuitemradio',name=name,exact=True).click();expect(b.locator(f'[data-calendar-item-id="{id}"]')).to_have_attribute('style',re.compile(hex));b.wait_for_function('window.__remote>0')
   if args.legacy:expect(a.locator('.trip-save-status')).to_contain_text('Modifications enregistrées')
   else:expect(a.locator('.trip-save-status')).to_have_attribute('data-save-state','saved')
   remote=b.evaluate('window.__remote');commit=json.loads((args.output/'commit.json').read_text(encoding='utf-8'))['at']
   if index:rows.append({'interactionToRemoteMs':remote-a.evaluate('window.__start'),'commitToRemoteMs':remote-commit})
  result={'samples':rows,'transport':'Local Phoenix shim, actual application SSE/RPC/RLS, two fake Discord accounts','injectedRpcLatencyMs':500,'summary':{key:{'median':statistics.median(sorted(row[key] for row in rows)),'p95':sorted(row[key] for row in rows)[18]} for key in rows[0]}}
  assert not errors,errors;(args.output/'synchronization.json').write_text(json.dumps(result,indent=2), encoding='utf-8');print(json.dumps(result['summary'],indent=2))
 finally:
  config({})
  for c in contexts:c.close()
  browser.close()
