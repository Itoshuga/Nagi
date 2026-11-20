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
 browser=p.chromium.launch();c=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');c.add_cookies([{'name':'nagi-auth','value':auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'url':ROOT}]);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));config(delay=2000);page.goto(ROOT+PATH,wait_until='domcontentloaded');expect(page.locator('.trip-itinerary')).to_be_visible();days=sorted([d for d in state()['days'] if d['trip_id']=='cccccccc-cccc-4ccc-8ccc-cccccccccccc'],key=lambda d:d['date']);results={}
 def watch(kind):
  page.evaluate("""kind=>{window.__measure={start:performance.now()};document.addEventListener('pointerup',()=>window.__measure.start=performance.now(),{capture:true,once:true});const get=()=>[...document.querySelectorAll(kind==='day'?'.trip-day-nav-item':'[data-activity-id]')].map(e=>e.textContent+e.getAttribute('data-activity-id')).join();const old=get();const observer=new MutationObserver(()=>{if(get()!==old){window.__measure.visual=performance.now()-window.__measure.start;observer.disconnect()}});observer.observe(document.querySelector('.trip-workspace'),{subtree:true,childList:true,characterData:true})}""",kind)
 try:
  page.get_by_role('button',name='Ajouter une étape',exact=True).first.click();picker=page.get_by_role('dialog',name='Ajouter une étape',exact=True);picker.get_by_role('combobox',name='Ajouter à',exact=True).select_option(days[0]['id']);picker.get_by_role('combobox',name='Rechercher un lieu',exact=True).fill('Nintendo');add=picker.get_by_role('button',name='Ajouter Nintendo TOKYO',exact=True);expect(add).to_be_visible();watch('item');add.click();page.wait_for_function('window.__measure.visual!==undefined');results['addVisualMs']=page.evaluate('window.__measure.visual');picker.get_by_role('button',name='Terminé',exact=True).click();expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state','saving')
  page.get_by_role('button',name='Ajouter une journée',exact=True).click();dialog=page.get_by_role('dialog',name='Ajouter une journée',exact=True);dialog.get_by_label('Titre (facultatif)',exact=True).fill('Journée optimiste');watch('day');dialog.get_by_role('button',name='Ajouter la journée',exact=True).click();page.wait_for_function('window.__measure.visual!==undefined');results['dayVisualMs']=page.evaluate('window.__measure.visual')
  page.get_by_role('button',name='Détails de Nintendo TOKYO',exact=True).click();panel=page.locator('.trip-context-panel');panel.get_by_role('button',name='Retirer du voyage',exact=True).click();dialog=page.get_by_role('dialog',name='Retirer cette étape ?',exact=True);watch('item');dialog.get_by_role('button',name='Retirer',exact=True).click();page.wait_for_function('window.__measure.visual!==undefined');results['removeVisualMs']=page.evaluate('window.__measure.visual');expect(page.get_by_role('button',name='Détails de Nintendo TOKYO',exact=True)).to_have_count(0);expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state','saved',timeout=20000)
  assert not any(i['entry_id']==state()['entries'][2] and i['trip_id']=='cccccccc-cccc-4ccc-8ccc-cccccccccccc' for i in state()['items']);assert len([d for d in state()['days'] if d['title']=='Journée optimiste'])==1;assert len(state()['stops'])==3
  for w,h,dark in [(390,844,False),(320,568,True)]:
   if dark:page.evaluate("document.documentElement.classList.add('dark')")
   page.set_viewport_size({'width':w,'height':h});page.get_by_role('tab',name='Calendrier',exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(args.output/f'final-{w}.png'))
  assert not errors,errors;results['browserErrors']=errors;(args.output/'crud.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
 finally:config();c.close();browser.close()
