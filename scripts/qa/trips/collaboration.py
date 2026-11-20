"""Browser integration scenarios against server.mjs; fake identities, real SQL/RLS."""
import argparse,base64,json,re,tempfile,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:3106');parser.add_argument('--output',type=Path,default=Path(tempfile.gettempdir())/'nagi-trip-qa');args=parser.parse_args()
ROOT=args.url;PATH='/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc'
def encode(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
def auth(sub):
 now=int(time.time());token=encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':sub,'aud':'authenticated','role':'authenticated','iat':now,'exp':now+86400})+'.c2lnbmF0dXJl'
 return 'base64-'+encode({'access_token':token,'refresh_token':'fixture-refresh','expires_at':now+86400,'token_type':'bearer','expires_in':86400})
def state():return json.loads((args.output/'state.json').read_text())
def config(**value):
 tmp=args.output/'config.tmp';tmp.write_text(json.dumps(value));tmp.replace(args.output/'config.json')

with sync_playwright() as p:
 browser=p.chromium.launch();errors=[];passed=[]
 def log(value):passed.append(value);print(value,flush=True)
 def context(sub):
  c=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');c.add_cookies([{'name':'nagi-auth','value':auth(sub),'url':ROOT}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(ROOT+PATH,wait_until='domcontentloaded');page.get_by_role('tab',name='Calendrier',exact=True).click();expect(page.locator('[data-calendar-item-id]').first).to_be_visible();return c,page
 def event(page,id):return page.locator(f'[data-calendar-item-id="{id}"]')
 def menu(page,id):event(page,id).click(button='right',position={'x':30,'y':10})
 def choose(page,name,id):menu(page,id);page.get_by_role('menuitemradio',name=name,exact=True).click()
 def saved(page):expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state','saved')
 config(delay=500);data=state();tower=next(i for i in data['items'] if i['entry_id']==data['entries'][4])['id'];parent=next(i for i in data['items'] if i['entry_id']==data['entries'][0])['id']
 ca,a=context('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');cb,b=context('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
 try:
  sync_samples=[]
  for name,hex in [('Bleu Nagi','#73A6DF'),('Vert','#69AA91'),('Orange','#D9A16C'),('Violet','#A28BC9')]*5:
   b.evaluate("""({id,hex})=>{window.__remote=0;const e=document.querySelector(`[data-calendar-item-id="${id}"]`);const observer=new MutationObserver(()=>{if(e.style.getPropertyValue('--trip-calendar-color')===hex){window.__remote=Date.now();observer.disconnect()}});observer.observe(e,{attributes:true,attributeFilter:['style']})}""",{'id':tower,'hex':hex})
   menu(a,tower);a.evaluate("document.addEventListener('pointerup',()=>window.__start=Date.now(),{capture:true,once:true})");a.get_by_role('menuitemradio',name=name,exact=True).click();expect(event(b,tower)).to_have_attribute('style',re.compile(hex));saved(a)
   sync_samples.append(b.evaluate('window.__remote')-a.evaluate('window.__start'))
  log('20 confirmed color changes propagated between two accounts')
  choose(a,'Vert',tower);expect(event(b,tower)).to_have_attribute('style',re.compile('#69AA91'));saved(a);log('cross-account color propagated through private SSE + authorized SQL journal')
  choose(a,'Violet',tower);event(b,tower).locator('.trip-event-resize.is-end').press('ArrowDown');expect(event(a,tower)).to_have_attribute('style',re.compile('42px'));expect(event(b,tower)).to_have_attribute('style',re.compile('#A28BC9'));saved(a);saved(b);log('simultaneous duration and color changes merged on both clients')
  menu(a,tower);menu(b,tower);a.get_by_role('menuitemradio',name='Vert',exact=True).dispatch_event('click');b.get_by_role('menuitemradio',name='Orange',exact=True).dispatch_event('click');expect(b.locator('.trip-workspace').get_by_role('alert')).to_contain_text('entre-temps');expect(event(b,tower)).to_have_attribute('style',re.compile('#69AA91'));expect(event(b,tower)).to_have_attribute('style',re.compile('42px'));b.get_by_role('button',name='Fermer le message').click();log('same-property conflict reported; unrelated duration retained')
  cb.set_offline(True);event(b,tower).locator('.trip-calendar-event-copy').click();panel=b.locator('.trip-context-panel');panel.get_by_label('Notes du voyage',exact=True).fill('Billets conservés pendant la coupure');panel.get_by_role('button',name='Enregistrer les notes',exact=True).click();expect(b.locator('.trip-save-status')).to_have_attribute('data-save-state','offline');choose(a,'Violet',tower);saved(a);cb.set_offline(False);saved(b);expect(event(b,tower)).to_have_attribute('style',re.compile('#A28BC9'));assert next(i for i in state()['items'] if i['id']==tower)['notes']=='Billets conservés pendant la coupure';panel.get_by_role('button',name='Fermer les détails').click();log('offline intent replayed after reconnection; missed remote changes preserved')
  config(delay=500,invalidIds=[tower]);event(b,tower).locator('.trip-event-resize.is-end').press('ArrowDown');choose(a,'Orange',parent);saved(a);expect(b.locator('.trip-workspace').get_by_role('alert')).to_be_visible();expect(event(b,tower)).to_have_attribute('style',re.compile('42px'));expect(event(b,parent)).to_have_attribute('style',re.compile('#D9A16C'));b.get_by_role('button',name='Fermer le message').click();config(delay=2000);log('definitive failure rolled back only its event; independent edit persisted')
  choose(a,'Vert',parent);expect(event(a,parent)).to_have_attribute('style',re.compile('#69AA91'));a.get_by_role('link',name='Tous les voyages',exact=True).click();a.get_by_role('link',name=re.compile('Tokyo, à notre rythme')).first.click();a.get_by_role('tab',name='Calendrier',exact=True).click();expect(event(a,parent)).to_have_attribute('style',re.compile('#69AA91'));saved(a);log('queued save survived internal navigation away and back')
  a.get_by_role('link',name='Tous les voyages',exact=True).click();a.get_by_role('link',name=re.compile('Autre voyage')).first.click();a.get_by_role('tab',name='Calendrier',exact=True).click();expect(a.locator('[data-calendar-item-id]')).to_have_count(1);expect(a.locator('h1')).to_have_text('Autre voyage');log('trip switching isolated the workspace and its queue')
  assert not errors,errors
  (args.output/'collaboration.json').write_text(json.dumps({'passed':passed,'syncInteractionToRemoteMs':sync_samples,'browserErrors':errors,'transport':'Phoenix transport shim only; production HTTP/SSE handlers and real PostgreSQL migration/RPC/RLS'},indent=2,ensure_ascii=False))
 finally:ca.close();cb.close();config();browser.close()
