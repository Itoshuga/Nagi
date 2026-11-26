"""Universal calendar drag regression: real React, HTTP/SSE, SQL and RLS; fake identities."""
import argparse
import base64
import json
import re
import time
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3158')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-calendar-drag'))
args = parser.parse_args()
ROOT = args.url
TRIP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PATH = '/app/444444444444444444/trips/' + TRIP


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def auth(sub):
    now = int(time.time())
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': sub, 'aud': 'authenticated', 'role': 'authenticated', 'iat': now, 'exp': now + 86400}) + '.c2lnbmF0dXJl'
    return 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})


def state():
    return json.loads((args.output / 'state.json').read_text(encoding='utf-8'))


def row(identifier):
    return next(item for item in state()['items'] if item['id'] == identifier)


def config(**value):
    temporary = args.output / 'config.tmp'
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(args.output / 'config.json')


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce', timezone_id='America/Los_Angeles')
    context.add_cookies([{'name': 'nagi-auth', 'value': auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'url': ROOT}])
    page = context.new_page()
    errors, writes, passed = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: print('Browser console:', message.text, flush=True) if message.type == 'error' else None)
    page.on('request', lambda request: writes.append(request.post_data_json) if request.url.endswith('/mutations') and request.method == 'POST' else None)
    days = sorted([day for day in state()['days'] if day['trip_id'] == TRIP], key=lambda day: day['date'])
    parent = next(item for item in state()['items'] if item['trip_id'] == TRIP and item['entry_id'] == state()['entries'][0])

    def snapshot():
        return context.request.get(ROOT + PATH + '/sync?snapshot=1').json()['snapshot']

    def seed(title, start=None, duration=None, day=0):
        identifier = str(uuid.uuid4())
        response = context.request.post(ROOT + PATH + '/mutations', headers={'Origin': ROOT}, data={
            'id': str(uuid.uuid4()), 'base': snapshot()['version'], 'expected': {'items': {}, 'stops': {}, 'days': {}},
            'change': {'operation': 'add_place', 'data': {'id': identifier, 'place': {'source': 'custom', 'title': title}, 'day': days[day]['id'], 'before': None, 'start_time': start, 'duration': duration, 'color': '#A28BC9', 'notes': 'Notes à conserver'}},
        })
        assert response.ok, response.text()
        return identifier

    free = seed('Une pause sans durée')
    known = seed('Une visite de 90 minutes', duration=90)
    odd = seed('Un rendez-vous précis', start='09:07', duration=45)
    other = seed('Autre visite libre', duration=20, day=3)
    touch_free = seed('Déplacement tactile', duration=45)
    total = len(state()['items'])

    def log(text):
        passed.append(text)
        print(text, flush=True)

    def event(identifier):
        return page.locator(f'[data-calendar-item-id="{identifier}"]')

    def saved():
        expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved', timeout=20000)
        page.wait_for_timeout(70)

    def begin(identifier):
        source = row(identifier)
        if source['start_time'] and page.locator('.trip-calendar-scroll').count():
            hour, minute = map(int, source['start_time'][:5].split(':'))
            page.locator('.trip-calendar-scroll').evaluate('(node,value)=>node.scrollTop=value', max(0, (hour * 60 + minute) * 56 / 60 - 50))
        card = event(identifier)
        copy = card.locator('.trip-calendar-event-copy,.trip-calendar-compact-copy')
        copy.scroll_into_view_if_needed()
        box, outer = copy.bounding_box(), card.bounding_box()
        x, y = box['x'] + min(30, box['width'] / 2), box['y'] + min(12, box['height'] / 2)
        grab = y - outer['y'] if card.get_attribute('class').find('trip-calendar-compact-event') < 0 else 0
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 8, y, steps=3)
        expect(page.locator('.trip-calendar-drag-card')).to_be_visible()
        return grab

    def timed(identifier, day, minute, label=None, rejected=False, optimistic=False):
        scroll = page.locator('.trip-calendar-scroll')
        scroll.evaluate('(node,value)=>node.scrollTop=value', max(0, minute / 60 * 56 - 180))
        grab = begin(identifier)
        scroll.evaluate('(node,value)=>node.scrollTop=value', max(0, minute / 60 * 56 - 180))
        column = page.locator(f'.trip-calendar-column[data-calendar-day="{days[day]["id"]}"]')
        box = column.bounding_box()
        before = len(writes)
        debug_before = {'scroll': scroll.evaluate('(node)=>node.scrollTop'), 'column': box, 'grab': grab}
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + minute * 56 / 60 + grab, steps=12)
        # Follow the displayed clock if entering the grid crossed a scroll edge.
        box = column.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + minute * 56 / 60 + grab, steps=2)
        if label:
            try:
                expect(page.locator('.trip-calendar-drop-preview')).to_contain_text(label)
            except Exception:
                print('Calendar target diagnostics', json.dumps({'before': debug_before, 'errors': errors, 'after': page.evaluate("()=>({scroll:document.querySelector('.trip-calendar-scroll')?.scrollTop,preview:document.querySelector('.trip-calendar-drop-preview')?.outerHTML})")}), flush=True)
                raise
        assert len(writes) == before
        page.mouse.up()
        if optimistic:
            expect(event(identifier)).to_have_attribute('data-save-state', 'saving')
            assert row(identifier)['start_time'] is None
        if rejected:
            expect(event(identifier)).to_have_attribute('data-save-state', 'error', timeout=20000)
        else:
            saved()
        expect(page.locator('.trip-detail-content')).to_have_count(0)

    def untimed(identifier, day, before=None):
        begin(identifier)
        target = event(before) if before else page.locator(f'.trip-calendar-unscheduled > [data-calendar-day="{days[day]["id"]}"]')
        box = target.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + (box['height'] / 2 if before else 3), steps=12)
        expect(page.locator('.trip-calendar-unscheduled .is-calendar-day-over')).to_be_visible()
        page.mouse.up()
        saved()

    try:
        page.goto(ROOT + PATH, wait_until='domcontentloaded')
        page.get_by_role('tab', name='Calendrier', exact=True).click()
        expect(page.locator('.trip-calendar-column')).to_have_count(4)
        page.screenshot(path=str(args.output / 'calendar-universal-initial.png'))
        config(delay=1200)
        timed(free, 0, 600, '10:00', optimistic=True)
        config()
        assert row(free)['start_time'] == '10:00:00' and row(free)['estimated_duration_minutes'] is None and row(free)['end_time'] is None
        assert len(state()['items']) == total and row(free)['notes'] == 'Notes à conserver'
        log('An untimed event becomes 10:00 without a saved display duration, duplicate or accidental detail click')
        timed(known, 1, 855, '14:15 – 15:45')
        assert row(known)['trip_day_id'] == days[1]['id'] and row(known)['estimated_duration_minutes'] == 90 and row(known)['calendar_color'] == '#A28BC9'
        log('Scheduling in another day preserves the known duration, color and exact preview')
        untimed(known, 2)
        assert row(known)['start_time'] is None and row(known)['end_time'] is None and row(known)['estimated_duration_minutes'] == 90
        untimed(known, 3)
        assert row(known)['trip_day_id'] == days[3]['id'] and row(known)['start_time'] is None
        untimed(known, 3, other)
        assert row(known)['sort_order'] < row(other)['sort_order']
        page.reload(wait_until='domcontentloaded')
        expect(page.locator(f'.trip-calendar-unscheduled > [data-calendar-day="{days[3]["id"]}"] [data-calendar-item-id]').first).to_have_attribute('data-calendar-item-id', known)
        log('Timed to untimed, between untimed days, and manual untimed order all survive reload')
        timed(odd, 1, 547, '09:07 – 09:52')
        assert row(odd)['start_time'] == '09:07:00'
        timed(odd, 1, 607, '10:00 – 10:45')
        assert row(odd)['start_time'] == '10:00:00'
        log('Horizontal moves retain an existing 09:07 clock; deliberate time moves snap to fifteen minutes')
        children = [stop for stop in state()['stops'] if stop['trip_item_id'] == parent['id']]
        timed(parent['id'], 1, 900, '15:00 – 17:00')
        untimed(parent['id'], 2)
        assert row(parent['id'])['start_time'] is None and row(parent['id'])['estimated_duration_minutes'] == 120
        assert [stop for stop in state()['stops'] if stop['trip_item_id'] == parent['id']] == children
        log('Moving a parent through both zones leaves all child identities, durations, notes and links untouched')
        before = len(writes)
        begin(known)
        page.mouse.move(700, 120, steps=8)
        page.mouse.up()
        begin(known)
        page.keyboard.press('Escape')
        page.mouse.up()
        assert len(writes) == before
        log('Invalid drops and Escape produce no writes')
        scroll = page.locator('.trip-calendar-scroll')
        scroll.evaluate('(node)=>node.scrollTop=8*56')
        begin(known)
        bounds = scroll.bounding_box()
        initial = scroll.evaluate('(node)=>node.scrollTop')
        page.mouse.move(bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] - 3, steps=10)
        page.wait_for_timeout(450)
        assert scroll.evaluate('(node)=>node.scrollTop') > initial
        page.keyboard.press('Escape')
        page.mouse.up()
        assert len(writes) == before
        log('An untimed source auto-scrolls the actual calendar grid without persisting previews')
        page.wait_for_timeout(100)
        page.get_by_role('button', name='Séjour', exact=True).click()
        expect(page.get_by_role('button', name='Séjour', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.trip-calendar-compact-event')).to_have_count(len([item for item in state()['items'] if item['trip_id'] == TRIP and item['trip_day_id']]))
        begin(known)
        target = page.locator(f'.trip-calendar-day-card[data-calendar-day="{days[0]["id"]}"]').bounding_box()
        page.mouse.move(target['x'] + 12, target['y'] + 12, steps=12)
        page.mouse.up()
        saved()
        assert row(known)['trip_day_id'] == days[0]['id'] and row(known)['start_time'] is None
        page.screenshot(path=str(args.output / 'calendar-universal-overview.png'))
        log('The stay view exposes every occurrence and preserves scheduling state while changing days')
        begin(known)
        mode_button = page.get_by_role('button', name='Jour', exact=True).bounding_box()
        page.mouse.move(mode_button['x'] + mode_button['width'] / 2, mode_button['y'] + mode_button['height'] / 2, steps=10)
        page.wait_for_timeout(950)
        expect(page.locator('.trip-calendar-column')).to_have_count(1)
        box = page.locator('.trip-calendar-column').bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 600 * 56 / 60, steps=12)
        page.mouse.up()
        saved()
        assert row(known)['start_time'] == '10:00:00'
        untimed(known, 0)
        log('Holding over the day-view control carries a stay occurrence directly into a timed grid')
        page.get_by_role('button', name='Séjour', exact=True).click()
        page.locator('.trip-calendar-day-open').nth(1).click()
        expect(page.locator('.trip-calendar-column')).to_have_count(1)
        begin(odd)
        arrow = page.get_by_role('button', name='Période précédente', exact=True).bounding_box()
        page.mouse.move(arrow['x'] + arrow['width'] / 2, arrow['y'] + arrow['height'] / 2, steps=10)
        page.wait_for_timeout(950)
        expect(page.locator('.trip-calendar-column')).to_have_attribute('data-calendar-day', days[0]['id'])
        column = page.locator('.trip-calendar-column').bounding_box()
        page.mouse.move(column['x'] + column['width'] / 2, column['y'] + 600 * 56 / 60 + 12, steps=12)
        page.mouse.up()
        saved()
        assert row(odd)['trip_day_id'] == days[0]['id']
        log('A deliberate hover changes the visible period during a drag, keeping the occurrence available')
        config(invalidIds=[known])
        timed(known, 0, 660, rejected=True)
        assert row(known)['start_time'] is None
        expect(page.locator('.trip-workspace').get_by_role('alert')).to_be_visible()
        config()
        page.get_by_role('button', name='Fermer le message', exact=True).click()
        log('A rejected calendar move rolls back its occurrence and exposes the existing error feedback')
        page.get_by_role('tab', name='Itinéraire', exact=True).click()
        expect(page.locator(f'[data-activity-id="{odd}"] .trip-step-time')).to_contain_text('10:00')
        page.reload(wait_until='domcontentloaded')
        expect(page.locator(f'[data-activity-id="{odd}"]')).to_be_visible()
        log('The itinerary and reload use the same local travel date despite a different browser timezone')
        page.get_by_role('tab', name='Calendrier', exact=True).click()
        page.get_by_role('button', name='Semaine', exact=True).click()
        remote_context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        remote_context.add_cookies([{'name': 'nagi-auth', 'value': auth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'url': ROOT}])
        remote = remote_context.new_page()
        remote.goto(ROOT + PATH, wait_until='domcontentloaded')
        remote.get_by_role('tab', name='Calendrier', exact=True).click()
        page.locator('.trip-calendar-scroll').evaluate('(node)=>node.scrollTop=10*56')
        begin(known)
        prior = row(known)
        remote_snapshot = remote_context.request.get(ROOT + PATH + '/sync?snapshot=1').json()['snapshot']
        response = remote_context.request.post(ROOT + PATH + '/mutations', headers={'Origin': ROOT}, data={
            'id': str(uuid.uuid4()), 'base': remote_snapshot['version'],
            'expected': {'items': {known: {'notes': prior['notes'], 'calendar_color': prior['calendar_color']}}, 'stops': {}, 'days': {}},
            'change': {'operation': 'patch_item', 'data': {'id': known, 'patch': {'notes': 'Note du second compte', 'calendar_color': '#69AA91'}}},
        })
        assert response.ok, response.text()
        expect(remote.locator(f'[data-calendar-item-id="{known}"]')).to_have_attribute('style', re.compile('#69AA91'))
        expect(event(known)).to_have_attribute('style', re.compile('#A28BC9'))
        box = page.locator(f'.trip-calendar-column[data-calendar-day="{days[0]["id"]}"]').bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 780 * 56 / 60, steps=12)
        page.mouse.up()
        saved()
        assert row(known)['start_time'] == '13:00:00' and row(known)['notes'] == 'Note du second compte' and row(known)['calendar_color'] == '#69AA91'
        expect(remote.locator(f'[data-calendar-item-id="{known}"] .trip-calendar-event-time')).to_contain_text('13:00')
        log('A second account receives the move; its concurrent note and color survive while the local drag view remains stable')
        begin(known)
        prior = row(known)
        remote_snapshot = remote_context.request.get(ROOT + PATH + '/sync?snapshot=1').json()['snapshot']
        response = remote_context.request.post(ROOT + PATH + '/mutations', headers={'Origin': ROOT}, data={
            'id': str(uuid.uuid4()), 'base': remote_snapshot['version'],
            'expected': {'items': {known: {'end_time': prior['end_time'], 'estimated_duration_minutes': prior['estimated_duration_minutes']}}, 'stops': {}, 'days': {}},
            'change': {'operation': 'patch_item', 'data': {'id': known, 'patch': {'end_time': '13:45', 'estimated_duration_minutes': 45}}},
        })
        assert response.ok, response.text()
        box = page.locator(f'.trip-calendar-column[data-calendar-day="{days[0]["id"]}"]').bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 840 * 56 / 60 + 12, steps=12)
        page.mouse.up()
        expect(event(known)).to_have_attribute('data-save-state', 'error', timeout=20000)
        assert row(known)['start_time'] == '13:00:00' and row(known)['estimated_duration_minutes'] == 45
        page.get_by_role('button', name='Fermer le message', exact=True).click()
        log('A concurrent duration edit is protected by the calendar guards instead of being silently overwritten')
        page.locator('.trip-calendar-scroll').evaluate('(node)=>node.scrollTop=13*56-50')
        handle = event(known).get_by_role('button', name='Déplacer Une visite de 90 minutes', exact=True)
        handle.focus()
        handle.press('Space')
        expect(page.locator('.trip-calendar-drag-card')).to_be_visible()
        handle.press('ArrowDown')
        expect(page.locator('.trip-calendar-drop-preview')).to_contain_text('13:15')
        handle.press('Space')
        saved()
        assert row(known)['start_time'] == '13:15:00' and row(known)['estimated_duration_minutes'] == 45
        log('Keyboard pickup, a fifteen-minute move and drop preserve the current occurrence duration')
        remote_context.close()

        touch_context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, reduced_motion='reduce')
        touch_context.add_cookies([{'name': 'nagi-auth', 'value': auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'url': ROOT}])
        phone = touch_context.new_page()
        phone.on('pageerror', lambda error: errors.append(str(error)))
        phone.goto(ROOT + PATH, wait_until='domcontentloaded')
        phone.get_by_role('tab', name='Calendrier', exact=True).click()
        expect(phone.locator('.trip-calendar-column')).to_have_count(1)
        phone.locator('.trip-calendar-scroll').evaluate('(node)=>node.scrollTop=9*56')
        touch_card = phone.locator(f'[data-calendar-item-id="{touch_free}"] .trip-calendar-compact-copy')
        touch_card.scroll_into_view_if_needed()
        bounds = touch_card.bounding_box()
        x, y = bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2
        cdp = touch_context.new_cdp_session(phone)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        phone.wait_for_timeout(310)
        expect(phone.locator('.trip-calendar-drag-card')).to_be_visible()
        column = phone.locator('.trip-calendar-column').bounding_box()
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': column['x'] + column['width'] / 2, 'y': column['y'] + 600 * 56 / 60}]})
        expect(phone.locator('.trip-calendar-drop-preview')).to_contain_text('10:00 – 10:45')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        expect(phone.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved', timeout=20000)
        assert row(touch_free)['start_time'] == '10:00:00' and row(touch_free)['estimated_duration_minutes'] == 45
        assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
        phone.screenshot(path=str(args.output / 'calendar-touch-390.png'))
        log('A real emulated long press moves an untimed mobile event onto 10:00 without changing its duration')
        touch_context.close()

        page.goto(ROOT + PATH + '?mode=read', wait_until='domcontentloaded')
        page.get_by_role('tab', name='Calendrier', exact=True).click()
        expect(page.locator('.trip-calendar-drag-handle')).to_have_count(0)
        expect(page.locator('.trip-event-resize')).to_have_count(0)
        log('Consultation mode exposes no drag or resize handles')
        assert len(state()['items']) == total
        assert not errors, errors
        (args.output / 'calendar-drag.json').write_text(json.dumps({'passed': passed, 'writes': len(writes), 'runtimeErrors': errors, 'touchVisit': touch_free}, indent=2, ensure_ascii=False), encoding='utf-8')
    finally:
        config()
        page.screenshot(path=str(args.output / 'calendar-drag-final.png'))
        context.close()
        browser.close()
