"""Contextual catalogue additions: real Next/SQL/RLS/queue and two test accounts."""
import argparse
import base64
import json
import re
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3156')
parser.add_argument('--output', type=Path, default=Path(tempfile.gettempdir()) / 'nagi-catalog-qa')
args = parser.parse_args()
trip = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
path = '/app/444444444444444444/trips/' + trip

def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')

def auth(sub):
    now = int(time.time())
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': sub, 'aud': 'authenticated', 'role': 'authenticated', 'iat': now, 'exp': now + 86400}) + '.c2lnbmF0dXJl'
    return 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})

def state():
    return json.loads((args.output / 'state.json').read_text())

def items():
    return [item for item in state()['items'] if item['trip_id'] == trip]

with sync_playwright() as p:
    browser = p.chromium.launch()
    contexts = []
    errors = []
    def page_for(sub):
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        contexts.append(context)
        context.add_cookies([{'name': 'nagi-auth', 'value': auth(sub), 'url': args.url}])
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + path, wait_until='domcontentloaded')
        expect(page.locator('.trip-itinerary')).to_be_visible()
        return page
    a = page_for('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    b = page_for('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    days = sorted([day for day in state()['days'] if day['trip_id'] == trip], key=lambda day: day['date'])
    before = items()
    results = {}
    try:
        a.get_by_role('button', name='Ajouter une étape', exact=True).first.click()
        picker = a.locator('.trip-picker-panel')
        picker.get_by_role('combobox', name='Rechercher un lieu', exact=True).fill('Nintendo')
        add = picker.get_by_role('button', name='Ajouter Nintendo TOKYO', exact=True)
        expect(add).to_be_visible()
        target = picker.locator('.trip-picker-target select')
        target.select_option('')
        add.focus()
        a.keyboard.press('Enter')
        popup = a.locator('.trip-catalog-destination')
        expect(popup).to_be_visible()
        assert len(items()) == len(before)
        first = popup.locator('.trip-catalog-days button').first
        expect(first).to_be_focused()
        a.keyboard.press('ArrowDown')
        expect(popup.locator('.trip-catalog-days button').nth(1)).to_be_focused()
        a.keyboard.press('Enter')
        expect(popup).to_have_count(0)
        expect(picker).to_be_visible()
        expect(target).to_have_value('')
        expect(picker.get_by_role('combobox', name='Rechercher un lieu')).to_have_value('Nintendo')
        expect(a.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved')
        created = next(item for item in items() if item['id'] not in {old['id'] for old in before})
        assert created['trip_day_id'] == days[1]['id']
        b.locator('.trip-day-nav-item').filter(has_text=re.compile(r'Jour\s+2')).first.click()
        expect(b.locator(f'[data-activity-id="{created["id"]}"]')).to_be_visible(timeout=15000)
        results['keyboardAndTwoAccountSynchronization'] = True
        target.select_option(days[0]['id'])
        count = len(items())
        add.dblclick()
        expect(a.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved')
        assert len(items()) == count + 1
        expect(popup).to_have_count(0)
        assert len({item['id'] for item in items()}) == len(items())
        results['oneOccurrencePerDoubleClick'] = True
        target.select_option('')
        add.click()
        expect(popup).to_be_visible()
        a.keyboard.press('Escape')
        expect(popup).to_have_count(0)
        expect(add).to_be_focused()
        expect(picker).to_be_visible()
        add.click()
        expect(popup).to_be_visible()
        search = picker.get_by_role('combobox', name='Rechercher un lieu', exact=True)
        search.click()
        expect(popup).to_have_count(0)
        expect(search).to_be_focused()
        results['outsideClickKeepsSearchFocus'] = True
        add.click()
        popup.get_by_role('button', name='Garder dans « À organiser »', exact=True).click()
        expect(a.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved')
        assert len(items()) == count + 2
        assert any(item['entry_id'] == created['entry_id'] and item['trip_day_id'] is None for item in items())
        results['explicitUnplannedAndIndependentOccurrences'] = True
        for old in before:
            assert next(item for item in items() if item['id'] == old['id']) == old
        results['existingVisitsPreserved'] = True
        a.screenshot(path=str(args.output / 'catalog-final.png'))
        assert not errors, errors
        results['browserErrors'] = errors
        (args.output / 'catalog.json').write_text(json.dumps(results, indent=2))
        print(json.dumps(results, indent=2))
    finally:
        for context in contexts:
            context.close()
        browser.close()
