"""Country imports: real Next actions, PostgreSQL/RLS and browser; fake accounts."""
import argparse
import base64
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3157')
parser.add_argument('--output', type=Path, default=Path('/tmp/nagi-country-import-qa'))
args = parser.parse_args()
ROOT = args.url


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def auth(sub):
    now = int(time.time())
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': sub, 'aud': 'authenticated', 'role': 'authenticated', 'iat': now, 'exp': now + 86400}) + '.c2lnbmF0dXJl'
    return 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh', 'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})


def countries():
    return json.loads((args.output / 'state.json').read_text(encoding='utf-8'))['countries']


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': auth('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'url': ROOT}])
    page = context.new_page()
    errors, passed = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ROOT + '/admin/countries')
    expect(page.get_by_role('button', name='Importer un JSON', exact=True)).to_be_visible()
    original = next(country for country in countries() if country['iso_code'] == 'JP')

    def log(message):
        passed.append(message)
        print(message, flush=True)

    def open_import():
        page.get_by_role('button', name='Importer un JSON', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()

    def upload(value):
        content = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        page.get_by_role('dialog').locator('input[type=file]').set_input_files({'name': 'pays.json', 'mimeType': 'application/json', 'buffer': content.encode('utf-8')})

    open_import()
    expect(page.get_by_role('button', name='Importer en brouillon', exact=True)).to_be_disabled()
    upload('{name: "France"}')
    expect(page.get_by_role('dialog')).to_contain_text('JSON valide')
    expect(page.get_by_role('button', name='Importer en brouillon', exact=True)).to_be_disabled()
    assert len(countries()) == 1
    upload([{'displayOrder': 2, 'name': 'France', 'iso': 'FR'}, {'displayOrder': -1, 'name': 'Erreur', 'iso': 'DE'}])
    expect(page.get_by_role('dialog')).to_contain_text('Pays 2')
    expect(page.get_by_role('button', name='Importer en brouillon', exact=True)).to_be_disabled()
    log('Malformed JSON and an invalid later row are rejected before any database write')

    source = [{'displayOrder': 4, 'name': ' Côte d’Ivoire ', 'iso': 'ci'}, {'displayOrder': 2, 'name': 'France', 'iso': 'fr'}, {'displayOrder': 0, 'name': 'Nouveau Japon', 'iso': 'JP'}]
    upload(source)
    expect(page.get_by_role('dialog')).to_contain_text('cote-d-ivoire')
    expect(page.get_by_role('dialog')).to_contain_text('CI')
    assert len(countries()) == 1, 'Preview must not import automatically'
    page.screenshot(path=str(args.output / 'country-import-desktop.png'))
    page.get_by_role('button', name='Importer en brouillon', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('2 pays importés en brouillon', timeout=15000)
    expect(page.get_by_role('dialog')).to_contain_text('1 pays déjà présent, ignoré')
    records = {country['iso_code']: country for country in countries()}
    assert records['JP'] == original
    for iso, order, slug in [('FR', 2, 'france'), ('CI', 4, 'cote-d-ivoire')]:
        assert records[iso]['sort_order'] == order and records[iso]['slug'] == slug
        assert records[iso]['description'] is None and records[iso]['cover_image_url'] is None
        assert records[iso]['is_published'] is False
    page.get_by_role('dialog').get_by_role('button', name='Fermer', exact=True).last.click()
    expect(page.get_by_role('link', name='France FR', exact=True)).to_be_visible(timeout=10000)
    log('A real atomic import creates normalized drafts and refreshes the list, preserving the existing published country')

    open_import()
    upload(source)
    page.get_by_role('button', name='Importer en brouillon', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('0 pays importés en brouillon', timeout=15000)
    expect(page.get_by_role('dialog')).to_contain_text('3 pays déjà présents, ignorés')
    assert len(countries()) == 3
    page.get_by_role('dialog').get_by_role('button', name='Fermer', exact=True).last.click()
    log('Reimporting the same file is idempotent and changes no existing countries')

    open_import()
    upload([{'displayOrder': 3, 'name': 'Italie', 'iso': 'IT'}, {'displayOrder': 5, 'name': 'Japon', 'iso': 'DE'}])
    page.get_by_role('button', name='Importer en brouillon', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('Aucun pays de ce fichier n’a été ajouté', timeout=15000)
    assert not any(country['iso_code'] in ['IT', 'DE'] for country in countries())
    log('A generated-address collision rolls back the entire batch, including its otherwise valid first row')

    # The same dialog supports a single record and short mobile viewports.
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 800})
        upload({'displayOrder': 3, 'name': 'Italie', 'iso': 'it'})
        expect(page.get_by_role('dialog')).to_contain_text('italie')
        bounds = page.get_by_role('dialog').bounding_box()
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width
        assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= 800
        page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(args.output / f'country-import-{width}.png'))
    page.get_by_role('button', name='Importer en brouillon', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('1 pays importé en brouillon', timeout=15000)
    assert next(country for country in countries() if country['iso_code'] == 'IT')['is_published'] is False
    log('Single-country JSON import and the 390/320px mobile dialog work')

    outsider = browser.new_context()
    outsider.add_cookies([{'name': 'nagi-auth', 'value': auth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'url': ROOT}])
    outsider_page = outsider.new_page()
    outsider_page.goto(ROOT + '/admin/countries')
    expect(outsider_page).not_to_have_url(ROOT + '/admin/countries')
    expect(outsider_page.get_by_role('button', name='Importer un JSON', exact=True)).to_have_count(0)
    outsider.close()
    log('A non-admin account cannot access country imports')
    assert not errors, errors
    (args.output / 'country-import-report.json').write_text(json.dumps({'passed': passed, 'runtimeErrors': errors, 'countries': len(countries()), 'database': 'real local PostgreSQL/RLS; fake accounts, no production mutation'}, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
