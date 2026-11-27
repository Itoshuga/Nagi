"""Daily map routes: real Next/React/Leaflet, SQL, ACL and SSE; synthetic Directions."""
import argparse
import base64
import json
import re
import time
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3157')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-map412-qa'))
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


def calls():
    file = args.output / 'directions.json'
    return json.loads(file.read_text(encoding='utf-8')) if file.exists() else []


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'url': ROOT}])
    context.route('https://api.mapbox.com/styles/**', lambda route: route.fulfill(status=200, content_type='image/png', body=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=')))
    page = context.new_page()
    errors, route_requests, passed = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: route_requests.append(request.post_data_json) if request.url.endswith('/directions') and request.method == 'POST' else None)
    days = sorted([day for day in state()['days'] if day['trip_id'] == TRIP], key=lambda day: day['date'])
    parent = next(item for item in state()['items'] if item['trip_id'] == TRIP and item['entry_id'] == state()['entries'][0])
    tower = next(item for item in state()['items'] if item['trip_id'] == TRIP and item['entry_id'] == state()['entries'][4])
    stop = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

    def log(text):
        passed.append(text)
        print(text, flush=True)

    def nav(label):
        page.locator('.trip-day-navigation').get_by_role('button', name=re.compile('^' + label)).click()

    def snapshot():
        return context.request.get(ROOT + PATH + '/sync?snapshot=1').json()['snapshot']

    def mutate(change):
        current = snapshot()
        expected = {'items': {}, 'stops': {}, 'days': {}}
        if change['operation'] == 'patch_item':
            item = next(row for row in current['items'] if row['id'] == change['data']['id'])
            expected['items'][item['id']] = {key: item[key] for key in change['data']['patch']}
        response = context.request.post(ROOT + PATH + '/mutations', headers={'Origin': ROOT}, data={'id': str(uuid.uuid4()), 'base': current['version'], 'expected': expected, 'change': change})
        assert response.ok, response.text()

    page.goto(ROOT + PATH)
    page.get_by_role('tab', name='Carte', exact=True).click()
    expect(page.locator('.trip-leaflet-map')).to_be_visible()
    nav('Tout le voyage')
    page.wait_for_timeout(650)
    assert len(calls()) == 0
    expect(page.locator('.trip-day-route')).to_have_count(0)
    expect(page.locator('[aria-label="Mode de transport"]')).to_have_count(0)
    expect(page.locator('.trip-map-missing')).to_contain_text('Position indisponible')
    assert page.locator('[data-map-visit]').count() == 5
    assert page.locator('.trip-map-missing button').count() == 2
    initial = snapshot()
    log('Global view: every occurrence and missing position kept, no route call or false total')

    nav('Jour 1')
    expect(page.locator('.trip-day-route').first).to_be_visible(timeout=12000)
    expect(page.locator('.trip-route-summary')).to_contain_text('Trajet partiel')
    expect(page.locator('.trip-route-summary')).to_contain_text('363 m')
    assert calls()[0]['profile'] == 'cycling'
    assert len(calls()[0]['points']) == 4, calls()
    assert len(route_requests) == 1
    assert snapshot() == initial, 'Displaying routes must not write trip data'
    page.evaluate("window.__mapNode=document.querySelector('.leaflet-map-pane')")
    page.screenshot(path=str(args.output / 'daily-desktop.png'))
    log('Day route: parent/stop order, common building collapsed, API metrics separated, no planner write')

    count = len(calls())
    item = page.locator(f'[data-map-visit="{stop}"]')
    item.locator('> button').click()
    expect(page.locator('.trip-context-panel')).to_contain_text('Pokémon Center SHIBUYA')
    expect(item.locator('> button')).to_have_attribute('aria-pressed', 'true')
    page.keyboard.press('Escape')
    page.wait_for_timeout(550)
    assert len(calls()) == count
    item.hover()
    expect(page.locator('.nagi-trip-marker.is-highlighted')).to_have_count(1)
    assert page.locator('.trip-day-route[stroke="#3977b9"]').count() > 0
    log('A stop opens its own details; hover highlights its shared pin and real associated leg without recomputing')

    page.locator('.leaflet-control-zoom-in').click()
    position = page.locator('.leaflet-map-pane').get_attribute('style')
    mutate({'operation': 'patch_item', 'data': {'id': parent['id'], 'patch': {'calendar_color': '#69AA91'}}})
    page.wait_for_timeout(1000)
    assert len(calls()) == count
    assert page.evaluate("window.__mapNode === document.querySelector('.leaflet-map-pane')")
    assert page.locator('.leaflet-map-pane').get_attribute('style') == position
    mutate({'operation': 'patch_item', 'data': {'id': parent['id'], 'patch': {'notes': 'Note modifiée sans recalcul'}}})
    page.wait_for_timeout(700)
    assert len(calls()) == count
    page.locator(f'[data-map-visit="{parent["id"]}"]').hover()
    expect(page.locator('.nagi-trip-marker.is-highlighted')).to_have_count(1)
    log('Realtime notes/color update and manual zoom preserve camera, grouped hover, map instance and current route')

    expect(page.locator('.trip-route-mode')).to_have_text('À vélo')
    expect(page.get_by_label('Mode de transport')).to_have_count(0)
    expect(page.locator('.trip-map-role')).to_have_count(0)
    assert all('profile' not in body and 'roles' not in body for body in route_requests)
    assert calls()[0]['points'] == [[139.698,35.661],[139.701,35.664],[139.702,35.665],[139.701,35.664]]
    log('Every located parent and stop is included automatically in one cycling route, with no mode selector or inclusion controls')

    nav('Jour 2')
    expect(page.locator('.trip-day-route')).to_have_count(0)
    expect(page.locator('.trip-route-summary')).to_contain_text('Aucun déplacement calculable')
    assert page.evaluate("window.__mapNode === document.querySelector('.leaflet-map-pane')")
    nav('À organiser')
    expect(page.locator('.trip-day-route')).to_have_count(0)
    count = len(calls())
    page.wait_for_timeout(600)
    assert len(calls()) == count
    nav('Jour 1')
    expect(page.locator('.trip-day-route').first).to_be_visible(timeout=10000)
    log('Day/pending/global changes clear old geometry immediately without remounting Leaflet')

    # This is the exact shared move operation used by itinerary and calendar.
    mutate({'operation': 'move_item', 'data': {'id': tower['id'], 'day': days[1]['id'], 'before': None}})
    expect(page.locator(f'[data-map-visit="{tower["id"]}"]')).to_have_count(0, timeout=12000)
    nav('Jour 2')
    expect(page.locator(f'[data-map-visit="{tower["id"]}"]')).to_be_visible()
    expect(page.locator('.trip-day-route')).to_have_count(0)
    assert len([item for item in snapshot()['items'] if item['id'] == tower['id']]) == 1
    log('A shared calendar/itinerary move propagates through SQL/SSE and appears in exactly one day')

    for width in [768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 900})
        # The common day navigation becomes a horizontal strip on mobile.
        nav('Jour 1')
        expect(page.locator('.trip-route-summary')).not_to_contain_text('Calcul du parcours', timeout=12000)
        expect(page.locator('.trip-route-mode')).to_be_visible()
        expect(page.locator('.trip-route-mode')).to_have_text('À vélo')
        expect(page.get_by_label('Mode de transport')).to_have_count(0)
        page.get_by_label('Recentrer la carte', exact=True).click()
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        expect(page.locator('.trip-leaflet-map')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        frame = page.locator('.trip-map-frame').bounding_box()
        panel = page.locator('.trip-map-place-list').bounding_box()
        assert frame['height'] > 200
        page.screenshot(path=str(args.output / f'daily-{width}.png'))
        if width < 768:
            assert panel['height'] < frame['height'] * .5
            for marker in page.locator('.nagi-trip-marker').all():
                box = marker.bounding_box()
                assert box['y'] + box['height'] < panel['y'] + 8, (box, panel)
    log('Tablet and 390/320px mobile retain a visible map, shared day control and fixed cycling label')

    page.set_viewport_size({'width': 1440, 'height': 1000})
    config = args.output / 'config.json'
    config.write_text(json.dumps({'directionsDelay': 900}), encoding='utf-8')
    nav('Tout le voyage')
    with page.expect_request(lambda request: request.url.endswith('/directions') and request.method == 'POST'):
        nav('Jour 1')
    nav('Jour 2')
    page.wait_for_timeout(1300)
    expect(page.locator('.trip-day-route')).to_have_count(0)
    log('An obsolete delayed response cannot redraw a previous day')
    config.write_text(json.dumps({'directionsNoRoute': True}), encoding='utf-8')
    nav('Jour 1')
    expect(page.locator('.trip-route-summary')).to_contain_text('Trajet indisponible', timeout=12000)
    expect(page.locator('.trip-day-route')).to_have_count(0)
    assert page.locator('.nagi-trip-marker').count() > 0
    config.write_text(json.dumps({'directionsQuota': True}), encoding='utf-8')
    nav('Tout le voyage')
    nav('Jour 1')
    expect(page.locator('.trip-route-summary')).to_contain_text('Limite de calcul atteinte', timeout=12000)
    count = len(calls())
    page.wait_for_timeout(1000)
    assert len(calls()) == count
    expect(page.locator('.trip-day-route')).to_have_count(0)
    config.write_text('{}', encoding='utf-8')
    log('NoRoute and quota retain all pins, draw no fake line and trigger no retry loop')

    # Actual HTTP guards + real SQL/RLS, not a mocked endpoint.
    body = route_requests[0]
    assert context.request.post(ROOT + PATH + '/directions', headers={'Origin': 'https://attacker.test'}, data=body).status == 403
    unknown = dict(body, day=str(uuid.uuid4()))
    assert context.request.post(ROOT + PATH + '/directions', headers={'Origin': ROOT}, data=unknown).status == 404
    outsider = browser.new_context()
    unauthorized = outsider.request.post(ROOT + PATH + '/directions', headers={'Origin': ROOT}, data=body, max_redirects=0)
    assert unauthorized.status == 401 or (unauthorized.status in [303, 307] and '/login' in unauthorized.headers.get('location', ''))
    outsider.close()
    log('Real endpoint rejects a cross-origin caller, nonexistent day and unauthenticated caller')
    assert all(call['profile'] == 'cycling' for call in calls()), calls()
    assert not errors, errors
    (args.output / 'map-report.json').write_text(json.dumps({'passed': passed, 'provider': 'synthetic fixture; no billed Directions call', 'runtimeErrors': errors, 'calls': len(calls())}, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
