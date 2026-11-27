"""Shared day navigation: production Next/React, local SQL/SSE, synthetic Directions."""
import argparse
import base64
import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3157')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-days414-30'))
args = parser.parse_args()
ROOT = args.url
TRIP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PATH = '/app/444444444444444444/trips/' + TRIP


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def auth():
    now = int(time.time())
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aud': 'authenticated', 'role': 'authenticated', 'iat': now, 'exp': now + 86400}) + '.c2lnbmF0dXJl'
    return 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})


def state():
    return json.loads((args.output / 'state.json').read_text())


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 800}, timezone_id='Pacific/Auckland', reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': auth(), 'url': ROOT}])
    context.route('https://api.mapbox.com/styles/**', lambda route: route.fulfill(status=200, content_type='image/png', body=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=')))
    page = context.new_page()
    errors, writes, routes, passed = [], [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.post_data_json) if request.url.endswith('/mutations') and request.method == 'POST' else routes.append(request.post_data_json) if request.url.endswith('/directions') and request.method == 'POST' else None)
    days = sorted([day for day in state()['days'] if day['trip_id'] == TRIP], key=lambda day: day['date'])
    items = [item for item in state()['items'] if item['trip_id'] == TRIP]
    timezone = next(trip['timezone'] for trip in state()['trips'] if trip['id'] == TRIP)
    nav = page.get_by_role('navigation', name='Journées du voyage')

    def log(message):
        passed.append(message)
        print(message, flush=True)

    def day(index):
        return nav.locator(f'[data-day-nav-id="{days[index]["id"]}"]')

    def selected(id):
        expect(nav.locator('[aria-current="true"]')).to_have_count(1)
        expect(nav.locator('[aria-current="true"]')).to_have_attribute('data-day-nav-id', id)

    def within(locator, port):
        row, frame = locator.bounding_box(), port.bounding_box()
        assert row and frame
        return row['y'] >= frame['y'] - 1 and row['y'] + row['height'] <= frame['y'] + frame['height'] + 1

    try:
        page.goto(ROOT + PATH)
        expect(nav).to_be_visible()
        expect(day(0)).to_be_visible()
        expect(nav.locator('[data-day-kind="day"]')).to_have_count(len(days))
        selected('all')
        expect(nav.locator('[data-day-kind="all"] .trip-day-count')).to_have_text(str(len(items)))
        expect(nav.locator('[data-day-kind="pending"] .trip-day-count')).to_have_text(str(sum(item['trip_day_id'] is None for item in items)))
        for i, data in enumerate(days):
            expect(day(i).locator('.trip-day-count')).to_have_text(str(sum(item['trip_day_id'] == data['id'] for item in items)))
            expect(day(i)).to_be_enabled()
            expect(day(i).locator('time')).to_have_attribute('datetime', data['date'][:10])
            expect(day(i).locator('.trip-day-custom-title')).to_have_count(1 if data['title'] else 0)
        expect(day(0).locator('time')).to_have_text('22 déc.')
        expect(nav.locator('.trip-timezone')).to_have_text(timezone)
        expect(nav.locator('.trip-timezone')).to_have_attribute('title', 'Horaires affichés dans le fuseau du voyage : ' + timezone)
        if len(days) > 10:
            expect(day(10).locator('time')).to_have_text('1 janv.')
        if days[1:2] and days[1]['title']:
            title = day(1).locator('.trip-day-custom-title')
            assert title.evaluate('(node)=>node.scrollWidth > node.clientWidth')
            assert days[1]['title'] in day(1).get_attribute('title')
            assert day(1).bounding_box()['height'] > day(0).bounding_box()['height']
        log(f'{len(days)} days: main-step counts, empty days enabled, optional titles, timezone and dates stable in an Auckland browser')

        day(0).click()
        selected(days[0]['id'])
        page.get_by_role('tab', name='Calendrier', exact=True).click()
        expect(page.locator('.trip-calendar')).to_be_visible()
        selected(days[0]['id'])
        page.get_by_role('tab', name='Carte', exact=True).click()
        expect(page.locator('.trip-leaflet-map')).to_be_visible()
        expect(page.locator('.trip-day-route').first).to_be_visible(timeout=15000)
        selected(days[0]['id'])
        assert len(routes) == 1
        page.evaluate('window.__testMap = document.querySelector(".leaflet-map-pane")')
        day(0).focus()
        day(0).press('ArrowDown')
        expect(day(1) if len(days) > 1 else nav.locator('[data-day-kind="pending"]')).to_be_focused()
        selected(days[0]['id'])
        page.locator('.trip-days-top').hover()
        page.wait_for_timeout(300)
        assert len(routes) == 1, 'Focus and hover must not request a route'
        nav.locator('[data-day-kind="all"]').click()
        selected('all')
        expect(page.locator('.trip-day-route')).to_have_count(0)
        nav.locator('[data-day-kind="pending"]').click()
        selected('pending')
        expect(page.locator('.trip-day-route')).to_have_count(0)
        assert page.evaluate('window.__testMap === document.querySelector(".leaflet-map-pane")')
        assert not writes
        log('One shared selection across all views; real daily route retained; global/pending navigation, focus and hover do not recreate the map or add route calls')

        page.get_by_role('tab', name='Itinéraire', exact=True).click()
        before = state()
        nav.get_by_role('button', name='Ajouter une journée', exact=True).click()
        expect(page.get_by_role('dialog', name='Ajouter une journée')).to_be_visible()
        expect(page.get_by_label('Titre (facultatif)', exact=True)).to_be_visible()
        expect(page.get_by_label('Date (facultative)', exact=True)).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert state() == before and not writes
        log('The + opens the existing day editor without creating a day or changing dates')

        page.set_viewport_size({'width': 1440, 'height': 600})
        day(0).click()
        listing = nav.locator('.trip-day-links')
        assert within(nav.locator('[data-day-kind="all"]'), nav)
        assert within(nav.locator('[data-day-kind="pending"]'), nav)
        assert within(nav.locator('.trip-timezone'), nav)
        assert nav.evaluate('(node)=>node.scrollHeight <= node.clientHeight + 1')
        expect(nav.locator('.trip-timezone')).to_be_in_viewport()
        expect(nav.locator('[data-day-kind="pending"]')).to_be_in_viewport()
        assert nav.bounding_box()['y'] + nav.bounding_box()['height'] <= 601
        if len(days) == 30:
            listing.evaluate('(node)=>node.scrollTop=node.scrollHeight')
            before_scroll = listing.evaluate('(node)=>node.scrollTop')
            assert before_scroll > 0
            page.get_by_role('tab', name='Calendrier', exact=True).click()
            expect(page.locator('.trip-calendar')).to_be_visible()
            assert listing.evaluate('(node)=>node.scrollTop') == before_scroll, 'Changing view must not reset the day list'
            page.locator('[data-calendar-mode="overview"]').click()
            page.locator('.trip-calendar-day-open').last.click()
            selected(days[-1]['id'])
            assert within(day(-1), listing)
            day(-1).press('Home')
            expect(nav.locator('[data-day-kind="all"]')).to_be_focused()
            selected(days[-1]['id'])
            page.get_by_role('button', name='Masquer les journées', exact=True).click()
            page.locator('[data-calendar-period="previous"]').click()
            page.get_by_role('button', name='Afficher les journées', exact=True).click()
            selected(days[-2]['id'])
            assert within(day(-2), listing)
        page.screenshot(path=str(args.output / 'desktop-short.png'))
        log('Short desktop: fixed header and footer, one day-list scroll; view switches preserve manual scrolling and external selection reveals the active day')

        page.set_viewport_size({'width': 390, 'height': 844})
        expect(nav).to_have_count(1)
        plus = nav.get_by_role('button', name='Ajouter une journée', exact=True)
        expect(plus).to_be_in_viewport()
        strip = nav.locator('.trip-days-scroll')
        strip.evaluate('(node)=>node.scrollLeft=0')
        day(0).focus()
        day(0).press('ArrowRight')
        next_day = day(1) if len(days) > 1 else nav.locator('[data-day-kind="pending"]')
        expect(next_day).to_be_focused()
        next_day.press('Enter')
        selected(days[1]['id'] if len(days) > 1 else 'pending')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert nav.evaluate('(node)=>node.scrollWidth <= node.clientWidth + 1')
        plus_box = plus.bounding_box()
        strip.evaluate('(node)=>node.scrollLeft=node.scrollWidth')
        assert plus.bounding_box() == plus_box
        expect(nav.locator('[data-day-kind="pending"]')).to_be_in_viewport()
        expect(nav.locator('.trip-timezone')).to_be_in_viewport()
        nav.locator('[data-day-kind="pending"]').click()
        selected('pending')
        plus.click()
        expect(page.get_by_role('dialog', name='Ajouter une journée')).to_be_visible()
        page.keyboard.press('Escape')
        page.screenshot(path=str(args.output / 'mobile.png'))
        log('Mobile: one horizontal navigation, keyboard focus/select, pending and timezone reachable, add button stays visible, no page overflow')
        assert not errors, errors
        (args.output / 'day-navigation-report.json').write_text(json.dumps({'days': len(days), 'timezone': timezone, 'passed': passed, 'browserErrors': errors}, ensure_ascii=False, indent=2))
    finally:
        browser.close()
