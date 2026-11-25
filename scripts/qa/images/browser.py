"""Real Next routes + resolver + embedded PostgreSQL; synthetic identity/providers."""
import argparse
import base64
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3131')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()

def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')

now = int(time.time())
token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aud': 'authenticated', 'role': 'authenticated', 'iat': now, 'exp': now + 86400}) + '.c2lnbmF0dXJl'
cookie = 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})
responses, errors = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.add_cookies([{'name': 'nagi-auth', 'value': cookie, 'url': args.url}])
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    def response(result):
        if result.url.endswith('/images'):
            try:
                body = result.json()
                responses.append({'status': result.status, 'phase': body.get('status'), 'confidence': body.get('confidence'), 'reasons': body.get('reasons'), 'error': body.get('error')})
            except Exception:
                responses.append({'status': result.status, 'invalid_json': True})
    page.on('response', response)
    page.route('https://thumb.wikimedia.org/**', lambda route: route.fulfill(content_type='image/png', body=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=')))
    try:
        page.goto(args.url + '/app/444444444444444444/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc', wait_until='domcontentloaded')
        expect(page.get_by_role('button', name='Détails de Shibuya PARCO', exact=True)).to_be_visible(timeout=60000)
        photo = page.get_by_role('button', name='Détails de Shibuya PARCO', exact=True).locator('img')
        expect(photo).to_be_visible(timeout=12000)
        assert photo.evaluate('(image) => image.complete && image.naturalWidth > 0')
        page.get_by_role('button', name='Explorer le catalogue', exact=True).click()
        page.get_by_role('tab', name='Mapbox', exact=True).click()
        page.get_by_label('Rechercher un lieu', exact=True).fill('Shibuya PARCO')
        expect(page.locator('[data-external-place-card] img')).to_be_visible(timeout=25000)
        assert not errors, errors
        print(json.dumps({'passed': True, 'responses': responses}))
    finally:
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / 'browser-report.json').write_text(json.dumps({'responses': responses, 'errors': errors}, indent=2), encoding='utf-8')
        print(json.dumps({'responses': responses, 'errors': errors}))
        browser.close()
