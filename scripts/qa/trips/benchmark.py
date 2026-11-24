"""Isolated browser benchmark. Requires Python Playwright + Chromium; see README.md."""
import argparse, base64, json, statistics, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://localhost:3106')
parser.add_argument('--output',type=Path,default=Path(tempfile.gettempdir())/'nagi-trip-qa')
parser.add_argument('--legacy',action='store_true')
parser.add_argument('--samples',type=int,default=20)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
ROOT=args.url;PATH='/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc'
def state():return json.loads((args.output/'state.json').read_text(encoding='utf-8'))
def config(**value):
 tmp=args.output/'config.tmp';tmp.write_text(json.dumps(value), encoding='utf-8');tmp.replace(args.output/'config.json')
def encode(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
def auth(sub):
 now=int(time.time());token=encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':sub,'aud':'authenticated','role':'authenticated','iat':now,'exp':now+86400})+'.c2lnbmF0dXJl'
 return 'base64-'+encode({'access_token':token,'refresh_token':'fixture-refresh','expires_at':now+86400,'token_type':'bearer','expires_in':86400})
def saved(page):
 if args.legacy:expect(page.locator('.trip-save-status')).to_contain_text('Modifications enregistrées')
 else:expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state','saved')
def summarize(values):
 values=sorted(values);return {'median':round(statistics.median(values),2),'p95':round(values[max(0,int(len(values)*.95+.999)-1)],2)}

with sync_playwright() as p:
 browser=p.chromium.launch();context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 context.add_cookies([{'name':'nagi-auth','value':auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'url':ROOT}])
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 # Isolate write costs from periodic synchronization; collaboration has its own recipe.
 page.add_init_script("""window.EventSource=class{addEventListener(){}removeEventListener(){}close(){}};
 window.__wire=[];const original=window.fetch;window.fetch=async(...args)=>{const start=performance.now();const response=await original(...args);response.clone().text().then(text=>window.__wire.push({bytes:new TextEncoder().encode(text).length,ms:performance.now()-start}));return response};
 const interval=window.setInterval;window.setInterval=(fn,ms,...rest)=>ms===15000?0:interval(fn,ms,...rest);
 """)
 config(delay=500);page.goto(ROOT+PATH,wait_until='networkidle');page.get_by_role('tab',name='Calendrier',exact=True).click()
 tower=next(item for item in state()['items'] if item['entry_id']==state()['entries'][4])['id']
 event=page.locator(f'[data-calendar-item-id="{tower}"]');samples=[]
 try:
  for kind in ['color','schedule','reorder']:
   if kind=='reorder':page.get_by_role('tab',name='Itinéraire',exact=True).click()
   for n in range(args.samples+1):
    if kind=='color':
     event.click(button='right',position={'x':30,'y':10});current=next(item for item in state()['items'] if item['id']==tower)['calendar_color'];choice='Vert' if current!='#69AA91' else 'Violet'
    elif kind=='reorder':page.get_by_role('button',name='Options de l’arrêt Café de Shibuya',exact=True).click()
    before=len(json.loads((args.output/'requests.json').read_text(encoding='utf-8')));wire=page.evaluate('window.__wire.length')
    page.evaluate("""({id,kind,legacy})=>{
     window.__measure={start:performance.now()};document.addEventListener(kind==='schedule'?'keydown':'pointerup',()=>window.__measure.start=performance.now(),{once:true,capture:true});
     const status=document.querySelector('.trip-save-status');const done=new MutationObserver(()=>{if(legacy?status.textContent.includes('Modifications enregistrées'):status.dataset.saveState==='saved'){window.__measure.confirmed=performance.now()-window.__measure.start;done.disconnect()}});done.observe(status,{subtree:true,childList:true,characterData:true,attributes:true});
     const e=kind==='reorder'?document.querySelector('[data-stops-parent]'):document.querySelector(`[data-calendar-item-id="${id}"]`);const old=e.getAttribute('style'),order=[...e.querySelectorAll('[data-stop-id]')].map(e=>e.dataset.stopId).join();
     const visual=new MutationObserver(()=>{if(kind==='reorder'?[...e.querySelectorAll('[data-stop-id]')].map(e=>e.dataset.stopId).join()!==order:e.getAttribute('style')!==old){window.__measure.visual=performance.now()-window.__measure.start;visual.disconnect()}});visual.observe(e,{attributes:true,childList:true,subtree:true});
    }""",{'id':tower,'kind':kind,'legacy':args.legacy})
    if kind=='color':page.get_by_role('menuitemradio',name=choice,exact=True).click()
    elif kind=='schedule':event.locator('.trip-event-resize.is-end').press('ArrowDown' if n%2==0 else 'ArrowUp')
    else:page.get_by_role('menuitem',name='Monter l’arrêt' if n%2==0 else 'Descendre l’arrêt',exact=True).click()
    saved(page);page.wait_for_function('window.__measure.confirmed!==undefined && window.__measure.visual!==undefined');page.wait_for_timeout(30)
    timing=page.evaluate('window.__measure');calls=json.loads((args.output/'requests.json').read_text(encoding='utf-8'))[before:];browser_calls=page.evaluate('n=>window.__wire.slice(n)',wire)
    if n:samples.append({**timing,'kind':kind,'serverCalls':len(calls),'serverBytes':sum(call.get('bytes',0) for call in calls),'browserRequests':len(browser_calls),'browserBytes':sum(call['bytes'] for call in browser_calls),'fullPlanReads':sum(call['endpoint']=='/rest/v1/trips' for call in calls),'endpoints':[call['endpoint'] for call in calls]})
   print(kind,'measured',flush=True)
  result={'conditions':{'environment':'Next production build, local PGlite with real migrations/RPC/RLS, Chromium 1440x1000','injectedRpcLatencyMs':500,'collaborators':1,'sync':'disabled only during isolated write benchmark','samplesPerInteraction':args.samples,'warmupPerInteraction':1,'size':'4 dated days, 4 root activities, 3 included stops in the main trip; second trip has one event','volume':'decoded UTF-8 response bytes; excludes transport headers and compression'},'samples':samples,'summary':{}}
  for kind in ['color','schedule','reorder']:
   rows=[row for row in samples if row['kind']==kind];result['summary'][kind]={key:summarize([row[key] for row in rows]) for key in ['visual','confirmed','serverCalls','serverBytes','browserRequests','browserBytes','fullPlanReads']}
  assert not errors,errors
  (args.output/'benchmark.json').write_text(json.dumps(result,indent=2), encoding='utf-8');print(json.dumps(result['summary'],indent=2))
 finally:config();browser.close()
