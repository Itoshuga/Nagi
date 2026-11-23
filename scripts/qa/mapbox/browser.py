"""Explicit live-provider acceptance against the isolated production fixture; no real travel writes."""
import argparse, base64, json, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:3121');parser.add_argument('--output',type=Path,default=Path('/tmp/nagi-mapbox-live-qa'));args=parser.parse_args()
ROOT=args.url;PATH='/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc';passed=[];errors=[];responses=[]
def encode(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
def auth(sub):
 now=int(time.time());token=encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':sub,'aud':'authenticated','role':'authenticated','iat':now,'exp':now+86400})+'.c2lnbmF0dXJl'
 return 'base64-'+encode({'access_token':token,'refresh_token':'fixture-refresh','expires_at':now+86400,'token_type':'bearer','expires_in':86400})
def state():return json.loads((args.output/'state.json').read_text())
def log(value):passed.append(value);print(value,flush=True)
def wait_row(page, existing):
 for _ in range(250):
  values=[r for r in state()['items'] if r['source']=='mapbox' and r['id'] not in existing]
  if values:return values[-1]
  page.wait_for_timeout(100)
 raise AssertionError('No confirmed Mapbox occurrence')
with sync_playwright() as p:
 browser=p.chromium.launch();contexts=[]
 def account(sub):
  c=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce');contexts.append(c);c.add_cookies([{'name':'nagi-auth','value':auth(sub),'url':ROOT}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:responses.append({'kind':'tileFailure','error':r.failure}) if '/styles/v1/mapbox/' in r.url else None);page.on('response',lambda r:responses.append({'kind':'tile','status':r.status}) if '/styles/v1/mapbox/' in r.url else None);day=next(d['id'] for d in state()['days'] if d['trip_id']=='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and d['day_number']==2);page.goto(ROOT+PATH+'?jour='+day,wait_until='domcontentloaded');return c,page
 try:
  existing={r['id'] for r in state()['items'] if r['source']=='mapbox'}
  ca,a=account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');a.get_by_role('button',name='Explorer le catalogue',exact=True).click();search=a.get_by_label('Rechercher un lieu',exact=True);search.fill('Pokémon Center SHIBUYA');a.get_by_role('tab',name='Mapbox',exact=True).click();search.press('Enter');cards=a.locator('[data-external-place-card]').filter(has_text=re.compile('Pokémon Center Shibuya',re.I));expect(cards.first).to_be_visible(timeout=15000)
  log('Real Search Box forward returned the requested Japanese establishment in native Nagi cards')
  target=a.locator('.trip-timeline-end').first;target.scroll_into_view_if_needed();card=cards.first;card.scroll_into_view_if_needed();s=card.bounding_box();t=target.bounding_box();a.mouse.move(s['x']+s['width']/2,s['y']+s['height']/2);a.mouse.down();a.wait_for_timeout(240);a.mouse.move(s['x']+s['width']/2+10,s['y']+s['height']/2);a.wait_for_timeout(180);a.mouse.move(t['x']+t['width']/2,t['y']+t['height']/2,steps=12);a.mouse.up();row=wait_row(a, existing);identifier=row['id'];expect(a.locator('.trip-save-status')).to_have_attribute('data-save-state','saved',timeout=15000)
  assert row['entry_id'] is None and row['external_place_id'] and row['external_query']=='Pokémon Center SHIBUYA'
  assert all(row.get(k) is None for k in ['custom_title','custom_location','custom_latitude','custom_longitude'])
  log('Direct drag saved an independent verified reference through production mutation routes and real SQL/RLS, without provider content')
  a.reload(wait_until='domcontentloaded');activity=a.locator(f'[data-activity-id="{identifier}"]');activity.scroll_into_view_if_needed();expect(activity.locator('.trip-step-copy strong')).to_contain_text(re.compile('Pokémon Center Shibuya',re.I),timeout=15000)
  log('A full browser reload re-resolved the saved Japanese reference by exact ID')
  cb,b=account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');remote=b.locator(f'[data-activity-id="{identifier}"]');remote.scroll_into_view_if_needed();expect(remote.locator('.trip-step-copy strong')).to_contain_text(re.compile('Pokémon Center Shibuya',re.I),timeout=15000)
  activity.locator('.trip-step-main').click();panel=a.locator('.trip-context-panel');expect(panel.locator('.trip-external-details h3')).to_contain_text(re.compile('Pokémon Center Shibuya',re.I),timeout=15000);panel.get_by_label('Notes du voyage',exact=True).fill('Notre rendez-vous de démonstration');panel.get_by_role('button',name='Enregistrer les notes',exact=True).click();expect(a.locator('.trip-save-status')).to_have_attribute('data-save-state','saved',timeout=15000);expect(remote).to_contain_text('Notre rendez-vous de démonstration',timeout=15000)
  log('A second authorized member resolved the same reference and received the confirmed user note through the private journal')
  assert next(r for r in state()['items'] if r['id']==identifier)['notes']=='Notre rendez-vous de démonstration'
  panel.get_by_role('button',name='Fermer les détails',exact=True).click();a.get_by_role('tab',name='Carte',exact=True).click();expect(a.locator('.trip-leaflet-map')).to_be_visible(timeout=15000);expect(a.locator('.nagi-trip-marker').last).to_be_visible(timeout=15000);expect(a.locator('.trip-map-place-list')).to_contain_text(re.compile('Pokémon Center Shibuya',re.I),timeout=15000);expect(a.locator('.trip-mapbox-logo')).to_be_visible();a.wait_for_timeout(1500)
  log('The real Mapbox point appeared on the preserved Leaflet map with its native label and attribution')
  assert not errors,errors
  report={'passed':passed,'browserErrors':errors,'tileResponses':responses,'referenceId':row['external_place_id'],'providerCalls':sum(1 for r in json.loads((args.output/'requests.json').read_text()) if r['endpoint'].startswith(('/search/searchbox/','/places/v1/'))),'scope':'real Mapbox; synthetic Discord identities and isolated PostgreSQL; no remote travel writes'}
  (args.output/'live-browser.json').write_text(json.dumps(report,indent=2))
 finally:
  print(json.dumps({'tileResponses':len(responses),'browserErrors':errors}),flush=True)
  for c in contexts:c.close()
  browser.close()
