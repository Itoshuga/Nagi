"""Native stop dragging against server.mjs: real UI, SQL, permissions and saves."""
import argparse
import base64
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3106')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-trip-qa'))
args = parser.parse_args()
trip = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def state():
    return json.loads((args.output / 'state.json').read_text(encoding='utf-8'))


now = int(time.time())
token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({
    'sub': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aud': 'authenticated',
    'role': 'authenticated', 'iat': now, 'exp': now + 86400,
}) + '.c2lnbmF0dXJl'
cookie = 'base64-' + encode({
    'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400,
    'token_type': 'bearer', 'expires_in': 86400,
})

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': cookie, 'url': args.url}])
    page = context.new_page()
    errors, writes, passed = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.post_data_json)
            if request.method == 'POST' and request.url.endswith('/mutations') else None)

    def log(text):
        passed.append(text)
        print(text, flush=True)

    def saved():
        expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved', timeout=20000)

    def begin(source):
        source.scroll_into_view_if_needed()
        box = source.bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 10, y, steps=3)
        expect(page.locator('.trip-drag-preview')).to_be_visible()

    def over(target):
        target.scroll_into_view_if_needed()
        box = target.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=12)

    try:
        page.goto(args.url + f'/app/444444444444444444/trips/{trip}', wait_until='domcontentloaded')
        expect(page.locator('.trip-itinerary')).to_be_visible()
        data = state()
        parent = next(item for item in data['items'] if item['trip_id'] == trip and item['entry_id'] == data['entries'][0])
        children = sorted([stop for stop in data['stops'] if stop['trip_item_id'] == parent['id']], key=lambda stop: stop['sort_order'])
        assert len(children) == 3
        moving, first = children[1], children[0]
        stops = page.locator(f'[data-stops-parent="{parent["id"]}"]')
        begin(stops.locator(f'[data-stop-id="{moving["id"]}"] .trip-stop-main'))
        over(stops.locator(f'[data-stop-id="{first["id"]}"] .trip-stop-main'))
        expect(stops.locator('.trip-drop-label')).to_have_text('Réordonner les arrêts')
        assert len(writes) == 0
        page.mouse.up()
        saved()
        reordered = sorted([stop for stop in state()['stops'] if stop['trip_item_id'] == parent['id']], key=lambda stop: stop['sort_order'])
        assert [stop['id'] for stop in reordered] == [moving['id'], first['id'], children[2]['id']]
        assert all(next(stop for stop in reordered if stop['id'] == old['id'])[key] == old[key]
                   for old in children for key in ['entry_id', 'notes', 'duration_minutes', 'trip_item_id'])
        log('Pointer reordering preserves stop identities, notes, included durations and parent links')

        begin(stops.locator(f'[data-stop-id="{moving["id"]}"] .trip-stop-main'))
        over(page.get_by_role('navigation', name='Journées du voyage').get_by_role('button', name='À organiser', exact=False))
        page.mouse.up()
        saved()
        detached = next(item for item in state()['items'] if item['id'] == moving['id'])
        assert detached['trip_day_id'] is None
        assert detached['start_time'][:5] == parent['start_time'][:5]
        assert detached['estimated_duration_minutes'] == moving['duration_minutes']
        assert detached['notes'] == moving['notes'] and detached['entry_id'] == moving['entry_id']
        assert not any(stop['id'] == moving['id'] for stop in state()['stops'])
        log('The explicit pending destination extracts a stop and retains its existing derived clock and data')

        source = page.locator(f'[data-activity-id="{moving["id"]}"] .trip-step-main')
        navigation = page.get_by_role('navigation', name='Journées du voyage')
        navigation.get_by_role('button', name='À organiser', exact=False).click()
        begin(source)
        day_index = next(index for index, day in enumerate(sorted(
            [day for day in data['days'] if day['trip_id'] == trip], key=lambda day: day['date']
        )) if day['id'] == parent['trip_day_id'])
        over(navigation.get_by_role('button', name=f'Jour {day_index + 1}', exact=False))
        page.mouse.up()
        saved()
        assert next(item for item in state()['items'] if item['id'] == moving['id'])['trip_day_id'] == parent['trip_day_id']
        navigation.get_by_role('button', name='Tout le voyage', exact=False).click()
        log('A pending visit can be moved back to its day through the existing navigation destination')

        begin(source)
        over(page.locator(f'[data-activity-id="{parent["id"]}"] .trip-step-main'))
        expect(page.locator('.trip-nesting-hint')).to_contain_text('Ajouter comme arrêt')
        page.mouse.up()
        saved()
        nested = next(stop for stop in state()['stops'] if stop['id'] == moving['id'])
        assert nested['trip_item_id'] == parent['id'] and nested['notes'] == moving['notes']
        assert nested['duration_minutes'] == moving['duration_minutes']
        assert not any(item['id'] == moving['id'] for item in state()['items'])
        page.reload(wait_until='domcontentloaded')
        expect(stops.locator('[data-stop-id]')).to_have_count(3)
        log('Nesting the visit again retains the same occurrence and persists after reload')

        # The existing menu provides an alternative to pointer dragging.
        stop_row = stops.locator(f'[data-stop-id="{moving["id"]}"]')
        stop_row.locator('.trip-step-menu').click()
        page.get_by_role('menuitem', name='Monter l’arrêt', exact=True).click()
        saved()
        expect(stops.locator('[data-stop-id]').nth(1)).to_have_attribute('data-stop-id', moving['id'])
        log('The existing move-up action remains available alongside dragging')
        assert not errors, errors
        assert len(writes) == 5
        page.screenshot(path=str(args.output / 'itinerary-native-stops.png'))
        (args.output / 'itinerary-results.json').write_text(json.dumps({
            'passed': passed, 'writes': len(writes), 'runtimeErrors': errors,
        }, indent=2, ensure_ascii=False), encoding='utf-8')
    finally:
        context.close()
        browser.close()
