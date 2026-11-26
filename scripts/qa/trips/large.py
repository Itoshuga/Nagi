"""Frame timing + rapid independent writes on the optional 500-item fixture."""
import argparse,base64,json,re,tempfile,time,statistics
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:3108');parser.add_argument('--output',type=Path,default=Path(tempfile.gettempdir())/'nagi-trip-large');args=parser.parse_args();ROOT=args.url
PATH='/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc'
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
now=int(time.time());token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aud':'authenticated','role':'authenticated','iat':now,'exp':now+86400})+'.c2lnbmF0dXJl';auth='base64-'+enc({'access_token':token,'refresh_token':'fixture-refresh','expires_at':now+86400,'token_type':'bearer','expires_in':86400})
def config(v):
 tmp=args.output/'config.tmp';tmp.write_text(json.dumps(v), encoding='utf-8');tmp.replace(args.output/'config.json')
with sync_playwright() as p:
 browser=p.chromium.launch();c=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');c.add_cookies([{'name':'nagi-auth','value':auth,'url':ROOT}]);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));config({'delay':2000});page.goto(ROOT+PATH,wait_until='domcontentloaded');page.get_by_role('tab',name='Calendrier',exact=True).click();page.get_by_role('button',name='Semaine',exact=True).click();expect(page.locator('.trip-calendar-event').first).to_be_visible()
 rows=json.loads((args.output/'state.json').read_text(encoding='utf-8'))['items'];main=[r for r in rows if r['trip_id']=='cccccccc-cccc-4ccc-8ccc-cccccccccccc'];assert len(main)==500,len(main)
 page.wait_for_timeout(500);page.evaluate("window.frames=[];window.recording=true;let last=performance.now();function tick(t){if(window.recording){window.frames.push(t-last);last=t;requestAnimationFrame(tick)}}requestAnimationFrame(tick)")
 # Ten independent activity colors can be queued while the first save still waits.
 ids=page.locator('[data-calendar-item-id]').evaluate_all('els=>els.map(e=>e.dataset.calendarItemId)').copy()[:10];start=time.perf_counter()
 for id in ids:
  event=page.locator(f'[data-calendar-item-id="{id}"]');event.scroll_into_view_if_needed();event.click(button='right',position={'x':8,'y':10});page.get_by_role('menuitemradio',name='Violet',exact=True).click();expect(event).to_have_attribute('style',re.compile('#A28BC9'));expect(event).not_to_have_class(re.compile('disabled'))
 elapsed=(time.perf_counter()-start)*1000;expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state','saving');expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state','saved',timeout=20000)
 # Real whole-block drag and cancellation, including a time preview.
 event=page.locator(f'[data-calendar-item-id="{ids[0]}"]');event.scroll_into_view_if_needed();r=event.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+8,y+8);expect(page.locator('.trip-calendar-drag-card')).to_be_visible();page.mouse.move(x+30,y+70,steps=60);page.keyboard.press('Escape');page.mouse.up();page.wait_for_timeout(200);page.evaluate('window.recording=false');frames=sorted(page.evaluate('window.frames').copy());result={'items':500,'datedDays':14,'renderedCalendarEvents':page.locator('[data-calendar-item-id]').count(),'queuedTenInteractionsMs':round(elapsed,2),'injectedRpcLatencyMs':2000,'frameSamples':len(frames),'frameMedianMs':round(statistics.median(frames),2),'frameP95Ms':round(frames[max(0,int(len(frames)*.95)-1)],2),'framesOver50ms':sum(f>50 for f in frames),'maxFrameMs':round(max(frames),2),'browserErrors':errors};assert not errors,errors;(args.output/'large.json').write_text(json.dumps(result,indent=2), encoding='utf-8');print(json.dumps(result,indent=2));config({});c.close();browser.close()
