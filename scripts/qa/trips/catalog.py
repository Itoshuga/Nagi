"""Direct catalogue composition: production UI + real local SQL/RLS, no live data."""
import argparse, base64, json, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3106')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-catalog-qa'))
args = parser.parse_args()
ROOT = args.url
TRIP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PATH = f'/app/444444444444444444/trips/{TRIP}'

def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')

def auth(sub):
    now = int(time.time())
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': sub, 'aud': 'authenticated', 'role': 'authenticated', 'iat': now, 'exp': now + 86400}) + '.c2lnbmF0dXJl'
    return 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})

def state():
    return json.loads((args.output / 'state.json').read_text(encoding='utf-8'))

def config(**value):
    temp = args.output / 'config.tmp'
    temp.write_text(json.dumps(value), encoding='utf-8')
    temp.replace(args.output / 'config.json')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'url': ROOT}])
    page = context.new_page()
    errors = []
    writes = []
    searches = []
    passed = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.post_data_json) if request.url.endswith('/mutations') and request.method == 'POST' else searches.append(request.url) if '/places?' in request.url else None)
    config(delay=1500)
    remote_context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    remote_context.add_cookies([{'name': 'nagi-auth', 'value': auth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'url': ROOT}])
    remote = remote_context.new_page()
    remote.goto(ROOT + PATH, wait_until='domcontentloaded')
    expect(remote.locator('.trip-itinerary')).to_be_visible()

    def log(text):
        passed.append(text)
        print(text, flush=True)

    def saved():
        expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved', timeout=20000)

    def begin():
        card = page.locator('[data-catalog-entry="0000000c-1111-4111-8111-111111111111"] .trip-picker-preview')
        expect(card).to_be_visible()
        box = card.bounding_box()
        x = box['x'] + box['width'] / 2
        y = box['y'] + box['height'] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x - 10, y, steps=3)
        expect(page.locator('.trip-drag-preview')).to_be_visible()
        page.wait_for_timeout(100)
        preview = page.locator('.trip-drag-preview').bounding_box()
        assert abs(preview['x'] + preview['width'] / 2 - (x - 10)) < 2
        assert abs(preview['y'] + preview['height'] / 2 - y) < 2

    def drop(target):
        begin()
        box = target.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=12)
        page.wait_for_timeout(100)
        page.mouse.up()
        page.wait_for_timeout(100)
    try:
        page.goto(ROOT + PATH, wait_until='domcontentloaded')
        expect(page.locator('.trip-itinerary')).to_be_visible()
        days = sorted([d for d in state()['days'] if d['trip_id'] == TRIP], key=lambda d: d['date'])
        tower = next((i for i in state()['items'] if i['trip_id'] == TRIP and i['entry_id'].startswith('0000000e')))['id']
        page.get_by_role('button', name='Ajouter une étape', exact=True).first.click()
        panel = page.locator('.trip-picker-panel')
        panel.get_by_role('combobox', name='Rechercher un lieu', exact=True).fill('Nintendo')
        expect(page.locator('[data-catalog-entry]')).to_have_count(1)
        expect(panel.locator('.trip-picker-add')).to_have_count(1)
        expect(page.locator('.trip-place-dialog')).to_have_count(0)
        expect(page.locator('.trip-primary-add .lucide-compass')).to_have_count(1)
        expect(page.locator('.trip-toolbar-actions [aria-label="Explorer le catalogue"]')).to_have_count(0)
        expect(panel.get_by_label('Ajouter à', exact=True)).to_have_count(1)
        panel.get_by_role('button', name='Filtrer le catalogue', exact=True).click()
        duration = page.get_by_label('Durée par défaut des nouvelles visites', exact=True)
        duration.fill('45')
        assert page.evaluate("localStorage.getItem('nagi:catalog-default-duration')") == '45'
        duration.fill('30')
        duration.press('Escape')
        panel.get_by_role('button', name='Ajouter au voyage · Nintendo TOKYO', exact=True).click()
        menu = page.locator('.trip-catalog-destination')
        expect(menu).to_be_visible()
        assert menu.evaluate('(node)=>parseFloat(getComputedStyle(node).paddingLeft)') >= 16
        assert 'Manrope' in menu.evaluate('(node)=>getComputedStyle(node).fontFamily')
        page.screenshot(path=str(args.output / 'catalog-menu-desktop.png'))
        menu.get_by_label('Destination de la visite', exact=True).press('Escape')
        expect(menu).to_have_count(0)
        search_count = len(searches)
        original = len(state()['items'])
        begin()
        target = page.locator(f'[data-activity-id="{tower}"]').locator('xpath=../preceding-sibling::div')
        box = target.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=12)
        page.wait_for_timeout(100)
        assert len(writes) == 0
        expect(page.get_by_text('Déposer ici', exact=True)).to_be_visible()
        page.mouse.up()
        expect(page.locator('[data-activity-id]')).to_have_count(4)
        first = page.locator('[data-activity-id]').evaluate_all('(nodes)=>nodes.map(n=>({id:n.dataset.activityId,title:n.querySelector(".trip-step-main").textContent}))')
        assert next((i for i, r in enumerate(first) if 'Nintendo' in r['title'])) < next((i for i, r in enumerate(first) if r['id'] == tower))
        log('Precise optimistic insertion before a timed step, no clock invented and no write while dragging')
        nav = page.get_by_role('navigation', name='Journées du voyage')
        day3 = nav.get_by_role('button', name='Jour 3', exact=False)
        drop(day3)
        drop(day3)
        assert nav.get_by_role('button', name='Tout le voyage', exact=False).get_attribute('aria-current') == 'date'
        log('Repeated sidebar drops create independent visits without changing the selected day')
        page.locator('.trip-workspace-canvas').evaluate('(node)=>node.scrollTop=430')
        begin()
        target = page.locator(f'[data-stops-parent="{tower}"] .trip-catalog-stop-target')
        expect(target).to_be_visible()
        box = target.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=12)
        page.wait_for_timeout(150)
        expect(target).to_have_class(re.compile('is-over'))
        page.mouse.up()
        expect(page.locator(f'[data-stops-parent="{tower}"] [data-stop-id]')).to_have_count(1)
        log('Explicit stop destination creates a child without extending its parent')
        drop(nav.get_by_role('button', name='À organiser', exact=False))
        saved()
        assert len(searches) == search_count
        expect(page.locator('.trip-catalog-hint')).to_have_count(0)
        log('Pending collection remains optional; catalogue results and search stay intact after every drop')
        before = len(writes)
        begin()
        page.mouse.move(600, 130, steps=8)
        page.mouse.up()
        page.wait_for_timeout(150)
        assert len(writes) == before
        begin()
        page.keyboard.press('Escape')
        page.mouse.up()
        assert len(writes) == before
        log('Invalid drops and Escape create no visit')
        page.wait_for_timeout(150)
        nav.get_by_role('button', name='Jour 4', exact=False).click()
        panel.get_by_role('combobox', name='Rechercher un lieu', exact=True).fill('Nintendo')
        expect(page.locator('[data-catalog-entry]')).to_have_count(1)
        drop(page.locator('.trip-timeline-end'))
        expect(page.locator('[data-activity-id]')).to_have_count(1)
        saved()
        log('An empty itinerary day accepts a direct unscheduled visit')
        nav.get_by_role('button', name='Tout le voyage', exact=False).click()
        panel.get_by_role('combobox', name='Rechercher un lieu', exact=True).fill('Nintendo')
        expect(page.locator('[data-catalog-entry]')).to_have_count(1)
        page.get_by_role('tab', name='Calendrier', exact=True).click()
        expect(page.locator('.trip-calendar-column').first).to_be_visible()
        begin()
        scroll = page.locator('.trip-calendar-scroll')
        scrollbox = scroll.bounding_box()
        prior_scroll = scroll.evaluate('(node)=>node.scrollTop')
        page.mouse.move(scrollbox['x'] + scrollbox['width'] / 2, scrollbox['y'] + scrollbox['height'] - 3, steps=10)
        page.wait_for_timeout(400)
        assert scroll.evaluate('(node)=>node.scrollTop') > prior_scroll
        page.keyboard.press('Escape')
        page.mouse.up()
        log('Calendar edge auto-scroll advances smoothly during catalogue drag')
        scroll.evaluate('(node)=>node.scrollTop=12*56')
        begin()
        column = page.locator(f'''[data-calendar-day="{days[1]['id']}"]''')
        box = column.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 870 * 56 / 60, steps=15)
        expect(page.locator('.trip-calendar-drop-preview')).to_contain_text('14:30 – 15:00')
        page.screenshot(path=str(args.output / 'calendar-preview.png'))
        page.mouse.up()
        saved()
        created = [i for i in state()['items'] if i['entry_id'].startswith('0000000c') and i['trip_day_id'] == days[1]['id']]
        assert len(created) == 1 and created[0]['start_time'] == '14:30:00' and (created[0]['estimated_duration_minutes'] == 30)
        expect(remote.locator(f'''[data-activity-id="{created[0]['id']}"]''')).to_be_visible()
        log('Calendar preview and persisted drop agree exactly at 14:30; visit propagates to the second account')
        page.get_by_role('button', name='Jour', exact=True).click()
        expect(page.locator('.trip-calendar-column')).to_have_count(1)
        page.locator('.trip-calendar-scroll').evaluate('(node)=>node.scrollTop=12*56')
        begin()
        column = page.locator('.trip-calendar-column')
        box = column.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 795 * 56 / 60, steps=15)
        expect(page.locator('.trip-calendar-drop-preview')).to_contain_text('13:15 – 13:45')
        page.mouse.up()
        saved()
        visit = next((i for i in state()['items'] if i['entry_id'].startswith('0000000c') and i['start_time'] == '13:15:00'))
        count = len(state()['items'])
        event = page.locator(f'''[data-calendar-item-id="{visit['id']}"] .trip-calendar-event-copy''')
        box = event.bounding_box()
        x = box['x'] + box['width'] / 2
        y = box['y'] + box['height'] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 8, y, steps=3)
        page.mouse.move(x, y + 56, steps=10)
        expect(page.locator('.trip-calendar-drag-time')).to_contain_text('14:15')
        page.mouse.up()
        saved()
        assert len(state()['items']) == count
        assert next((i for i in state()['items'] if i['id'] == visit['id']))['start_time'] == '14:15:00'
        log('Day view creates at 13:15; dragging that event moves its existing identity to 14:15')
        page.get_by_role('button', name='Séjour', exact=True).click()
        drop(page.locator('.trip-calendar-day-card').last)
        saved()
        log('Overview without a grid accepts an unscheduled visit on the selected drop day')
        page.set_viewport_size({'width': 390, 'height': 844})
        action = panel.get_by_role('button', name='Ajouter au voyage · Nintendo TOKYO', exact=True)
        action.focus()
        action.press('Shift+F10')
        destination = page.get_by_role('combobox', name='Destination de la visite', exact=True)
        expect(destination).to_be_visible()
        menu = page.locator('.trip-catalog-destination')
        expect(menu).to_be_in_viewport(ratio=1)
        bounds = menu.bounding_box()
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 390
        assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= 844
        page.screenshot(path=str(args.output / 'catalog-menu-mobile.png'))
        destination.select_option(days[0]['id'])
        page.get_by_label('Horaire de la visite', exact=True).fill('18:15')
        page.get_by_role('button', name='Ajouter au voyage', exact=True).click()
        saved()
        assert any((i['entry_id'].startswith('0000000c') and i['start_time'] == '18:15:00' for i in state()['items']))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(args.output / 'mobile-catalog.png'))
        log('Mobile and keyboard destination/time alternative works without horizontal overflow')
        assert len(state()['items']) == original + 9

        # Phase 4.9: direct additions use the same optimistic queue and SQL journal.
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.get_by_role('tab', name='Itinéraire', exact=True).click()
        panel.get_by_role('button', name='Fermer le catalogue', exact=True).click()
        nav.get_by_role('button', name='Jour 3', exact=False).click()
        page.locator('.trip-add-step').click()
        expect(panel.get_by_label('Ajouter à', exact=True)).to_have_value(days[2]['id'])
        expect(panel.get_by_role('combobox', name='Rechercher un lieu')).to_be_focused()
        panel.get_by_role('combobox', name='Rechercher un lieu').fill('Nintendo')
        expect(panel.locator('[data-catalog-entry]')).to_have_count(1)
        panel.get_by_role('button', name='Filtrer le catalogue').click()
        page.get_by_label('Catégorie', exact=True).select_option(label='Tourisme')
        page.keyboard.press('Escape')
        expect(panel.locator('[data-catalog-entry]')).to_have_count(1)
        prior_items = {i['id']: i for i in state()['items']}
        searches_before = len(searches)
        writes_before = len(writes)
        count_before = page.locator('[data-activity-id]').count()
        page.evaluate("""()=>{window.__quickAddedMs=null;let start;document.addEventListener('pointerup',()=>start=performance.now(),{capture:true,once:true});const prior=new Set([...document.querySelectorAll('[data-activity-id]')].map(n=>n.dataset.activityId));const observer=new MutationObserver(()=>{if([...document.querySelectorAll('[data-activity-id]')].some(n=>!prior.has(n.dataset.activityId))){window.__quickAddedMs=performance.now()-start;observer.disconnect()}});observer.observe(document.querySelector('.trip-workspace-canvas'),{subtree:true,childList:true})}""")
        quick = panel.get_by_role('button', name='Ajouter Nintendo TOKYO', exact=True)
        quick.click()
        expect(page.locator('[data-activity-id]')).to_have_count(count_before + 1)
        expect(quick).to_have_attribute('data-added', 'true')
        expect(page.locator('.trip-step.is-added')).to_have_count(1)
        expect(page.locator('.trip-place-dialog,.trip-catalog-destination')).to_have_count(0)
        quick_ms = page.evaluate('window.__quickAddedMs')
        assert quick_ms is not None and quick_ms < 1000, quick_ms
        saved()
        first_quick = next(i for i in state()['items'] if i['id'] not in prior_items)
        assert first_quick['trip_day_id'] == days[2]['id']
        assert first_quick['start_time'] is None and first_quick['estimated_duration_minutes'] is None
        assert first_quick['notes'] == ''
        assert len(writes) == writes_before + 1
        expect(remote.locator(f'[data-activity-id="{first_quick["id"]}"]')).to_be_visible()
        quick.click()
        expect(page.locator('[data-activity-id]')).to_have_count(count_before + 2)
        saved()
        assert len(writes) == writes_before + 2
        assert len(searches) == searches_before
        expect(panel.get_by_role('combobox', name='Rechercher un lieu')).to_have_value('Nintendo')
        expect(panel.get_by_role('button', name='Filtrer le catalogue')).to_have_attribute('data-active','true')
        assert all(next(i for i in state()['items'] if i['id'] == key) == value for key,value in prior_items.items())
        log(f'Day-context quick clicks create repeated independent visits in {quick_ms:.1f} ms before a 1500 ms save; query, filters and previous visits remain intact')

        nav.get_by_role('button', name='Tout le voyage', exact=False).click()
        expect(panel.get_by_role('combobox', name='Rechercher un lieu')).to_have_value('Nintendo')
        expect(panel.get_by_label('Ajouter à', exact=True)).to_have_value('')
        page.locator('.trip-day-timeline').nth(2).get_by_role('button',name='Ajouter une étape',exact=True).click()
        expect(panel.get_by_label('Ajouter à', exact=True)).to_have_value(days[2]['id'])
        expect(nav.get_by_role('button', name='Tout le voyage', exact=False)).to_have_attribute('aria-current','date')
        panel.get_by_label('Ajouter à', exact=True).select_option(days[3]['id'])
        expect(panel.locator('[data-catalog-entry]')).to_have_count(1)
        count_before = len(state()['items'])
        panel.get_by_role('combobox', name='Rechercher un lieu').press('Enter')
        saved()
        assert len(state()['items']) == count_before + 1
        expect(page.locator('.trip-catalog-destination')).to_have_count(0)
        expect(panel).to_be_visible()
        assert any(i['id'] not in prior_items and i['trip_day_id']==days[3]['id'] and i['start_time'] is None for i in state()['items'])
        page.screenshot(path=str(args.output / 'quick-add-desktop.png'))
        log('A day-local button in the full itinerary sets the target; the inline day selector and Enter add immediately without a modal')

        # A nested stop uses the same panel and never changes its parent duration.
        panel.get_by_role('button', name='Fermer le catalogue', exact=True).click()
        parent_duration = next(i for i in state()['items'] if i['id']==tower)['estimated_duration_minutes']
        tower_step = page.locator(f'[data-activity-id="{tower}"]')
        tower_step.get_by_role('button',name='Options de Tokyo Tower',exact=True).click()
        page.get_by_role('menuitem',name='Ajouter un arrêt',exact=True).click()
        expect(panel).to_be_visible()
        expect(panel.get_by_label('Ajouter à',exact=True)).to_have_count(0)
        panel.get_by_role('combobox',name='Rechercher un lieu').fill('Nintendo')
        count_before = len(state()['stops'])
        panel.get_by_role('button',name='Ajouter Nintendo TOKYO',exact=True).click()
        saved()
        assert len(state()['stops']) == count_before + 1
        assert next(i for i in state()['items'] if i['id']==tower)['estimated_duration_minutes'] == parent_duration
        log('Adding a nested stop reuses the panel and preserves the parent schedule')

        # The mobile quick action works without a drag or the optional destination popover.
        panel.get_by_role('button', name='Fermer le catalogue', exact=True).click()
        page.set_viewport_size({'width': 320, 'height': 740})
        trigger = page.locator('.trip-primary-add')
        expect(trigger.locator('span')).to_be_visible()
        trigger.focus()
        trigger.press('Enter')
        expect(panel.get_by_role('combobox',name='Rechercher un lieu')).to_be_focused()
        panel.get_by_role('combobox',name='Rechercher un lieu').fill('Nintendo')
        panel.get_by_label('Ajouter à',exact=True).select_option(days[0]['id'])
        count_before = len(state()['items'])
        panel.get_by_role('button',name='Ajouter Nintendo TOKYO',exact=True).click()
        saved()
        assert len(state()['items']) == count_before + 1
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        expect(panel.get_by_role('button',name='Ajouter Nintendo TOKYO',exact=True)).to_be_focused()
        page.screenshot(path=str(args.output / 'quick-add-mobile.png'))
        page.keyboard.press('Escape')
        expect(panel).to_have_count(0)
        expect(trigger).to_be_focused()
        expect(trigger).to_have_attribute('aria-expanded','false')
        log('A visible Compass label, keyboard focus and direct quick addition work at 320 px; Escape restores the trigger')

        page.goto(ROOT + PATH + '?mode=read', wait_until='domcontentloaded')
        page.get_by_role('button', name='Explorer le catalogue', exact=True).click()
        expect(page.locator('[data-catalog-entry]').first).to_be_visible()
        expect(page.locator('.trip-catalog-draggable')).to_have_count(0)
        expect(page.locator('.trip-catalog-action')).to_have_count(0)
        expect(page.locator('.trip-picker-add')).to_have_count(0)
        log('Consultation mode exposes catalogue preview only, with no creation controls')
        assert not errors, errors
        visits = [i for i in state()['items'] if i['entry_id'].startswith('0000000c')]
        assert len(set((i['id'] for i in visits))) == len(visits)
        (args.output / 'catalog-results.json').write_text(json.dumps({'passed': passed, 'browserErrors': errors, 'writes': len(writes), 'catalogueSearches': len(searches), 'newVisits': len(visits), 'quickAddVisualMs':quick_ms}, indent=2, ensure_ascii=False), encoding='utf-8')
    finally:
        if errors:
            print('Browser errors:', errors)
        page.screenshot(path=str(args.output / 'catalog-final.png'))
        config()
        context.close()
        remote_context.close()
        browser.close()
