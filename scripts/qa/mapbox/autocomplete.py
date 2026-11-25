"""Real Mapbox autocomplete regression on the isolated production fixture."""
import argparse
import base64
import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3122')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-mapbox-autocomplete-qa'))
args = parser.parse_args()
root = args.url
trip_path = '/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc'

def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')

now = int(time.time())
token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({
    'sub': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aud': 'authenticated',
    'role': 'authenticated', 'iat': now, 'exp': now + 86400,
}) + '.c2lnbmF0dXJl'
cookie = 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh',
                           'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})
errors, observations = [], []

def search_response(response, query=None):
    if not response.url.endswith('/external') or response.request.method != 'POST':
        return False
    data = response.request.post_data_json
    return data.get('operation') == 'search' and data.get('kind') == 'forward' and (query is None or data.get('query') == query)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': cookie, 'url': root}])
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(root + trip_path, wait_until='domcontentloaded')
        page.get_by_role('button', name='Explorer le catalogue', exact=True).click()
        search = page.get_by_label('Rechercher un lieu', exact=True)
        for index, query in enumerate(['Senso-Ji', 'Senso-ji', 'Sensō-ji']):
            with page.expect_response(lambda response: search_response(response, query), timeout=15000) as pending:
                search.fill(query)
                if index == 0:
                    page.get_by_role('tab', name='Mapbox', exact=True).click()
            response = pending.value
            assert response.ok, response.status
            data = response.json()
            assert len(data['places']) <= 6
            temple = next(place for place in data['places'] if re.fullmatch('Sensō-ji Temple', place['title'], re.I))
            point = temple['coordinates']
            assert 35.70 < point['latitude'] < 35.73 and 139.78 < point['longitude'] < 139.81
            expect(page.locator('[data-external-place-card] strong').first).to_have_text(re.compile('^Sensō-ji Temple$', re.I))
            expect(page.locator('.trip-mapbox-search')).to_have_attribute('aria-busy', 'false')
            assert page.locator('[data-external-place-card]').count() <= 6
            observations.append({'query': query, 'templeInAsakusa': True, 'count': len(data['places']), 'withoutEnter': True})
            print(json.dumps(observations[-1]), flush=True)
        with page.expect_response(lambda response: search_response(response, 'Tokyo'), timeout=15000) as pending:
            search.fill('Tokyo')
            search.press('Enter')
        data = pending.value.json()
        assert 0 < len(data['places']) <= 6
        expect(page.locator('.trip-mapbox-search')).to_have_attribute('aria-busy', 'false')
        assert page.locator('[data-external-place-card]').count() <= 6
        observations.append({'query': 'Tokyo', 'count': len(data['places'])})
        assert not errors, errors
        args.output.mkdir(parents=True, exist_ok=True)
        report = {'observations': observations, 'browserErrors': errors, 'passed': True,
                  'scope': 'Real Mapbox, production routes/UI, isolated SQL and synthetic identity; no remote travel writes'}
        (args.output / 'autocomplete.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    finally:
        context.close()
        browser.close()
