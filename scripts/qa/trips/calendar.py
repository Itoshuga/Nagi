"""Calendar UI regression against server.mjs (isolated PGlite, real HTTP/RPC/RLS)."""
import argparse
import base64
import json
import re
import tempfile
import time
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3118')
parser.add_argument('--output', type=Path, default=Path(tempfile.gettempdir()) / 'nagi-calendar48-qa')
args = parser.parse_args()
ROOT = args.url
TRIP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PATH = '/app/444444444444444444/trips/' + TRIP
passed, errors = [], []


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def auth():
    now = int(time.time())
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({
        'sub': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aud': 'authenticated',
        'role': 'authenticated', 'iat': now, 'exp': now + 86400,
    }) + '.c2lnbmF0dXJl'
    return 'base64-' + encode({'access_token': token, 'refresh_token': 'fixture-refresh',
                             'expires_at': now + 86400, 'token_type': 'bearer', 'expires_in': 86400})


def state():
    return json.loads((args.output / 'state.json').read_text(encoding='utf-8'))


def config(**value):
    temporary = args.output / 'config.tmp'
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(args.output / 'config.json')


def log(value):
    passed.append(value)
    print(value, flush=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'nagi-auth', 'value': auth(), 'url': ROOT}])
    # Freeze only the constructor for the visible trip clock. Date.now remains
    # real so authentication/session expiry and network timers keep working.
    context.add_init_script("""const NativeDate=Date;window.Date=class extends NativeDate {
      constructor(...args){if(args.length)super(...args);else super('2028-12-22T00:37:00Z')}
    };""")
    config()
    plan = context.request.get(ROOT + PATH + '/sync?snapshot=1').json()['snapshot']
    days = plan['days']
    parent = next(i['id'] for i in plan['items'] if len(i['stops']) == 3)

    def seed(title, start, duration, color=None):
        nonlocal_plan = context.request.get(ROOT + PATH + '/sync?snapshot=1').json()['snapshot']
        identifier = str(uuid.uuid4())
        response = context.request.post(ROOT + PATH + '/mutations', headers={'Origin': ROOT}, data={
            'id': str(uuid.uuid4()), 'base': nonlocal_plan['version'],
            'expected': {'items': {}, 'stops': {}, 'days': {}},
            'change': {'operation': 'add_place', 'data': {
                'id': identifier, 'place': {'source': 'custom', 'title': title},
                'day': days[0]['id'], 'before': None, 'start_time': start,
                'duration': duration, 'color': color, 'notes': '',
            }},
        })
        assert response.ok, response.text()
        return identifier

    overlap = seed('Promenade dans les petites rues de Shibuya et visite des boutiques', '09:30', 45, '#D9A16C')
    medium = seed('Déjeuner à Shibuya', '12:00', 60, '#69AA91')
    seed('Pause libre', None, None)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))

    def event(identifier):
        return page.locator(f'[data-calendar-item-id="{identifier}"]')

    def saved():
        expect(page.locator('.trip-save-status')).to_have_attribute('data-save-state', 'saved', timeout=20000)

    def menu(identifier):
        event(identifier).locator('.trip-calendar-event-copy').click(button='right', position={'x': 30, 'y': 10})

    def align():
        assert page.evaluate("""()=>{
          const headers=[...document.querySelectorAll('.trip-calendar-grid-header>button')];
          const columns=[...document.querySelectorAll('.trip-calendar-column')];
          return headers.every((h,i)=>{
            const a=h.getBoundingClientRect(),b=columns[i].getBoundingClientRect();
            return Math.abs(a.x-b.x)<1&&Math.abs(a.width-b.width)<1;
          });
        }"""), 'day headers and columns must align'

    try:
        page.goto(ROOT + PATH, wait_until='domcontentloaded')
        page.get_by_role('tab', name='Calendrier', exact=True).click()
        expect(page.locator('.trip-calendar-column')).to_have_count(4)
        expect(page.locator('.trip-calendar-unscheduled')).to_contain_text('Pause libre')
        expect(page.locator('.trip-calendar-now')).to_have_count(1)
        expect(page.locator('.trip-calendar-grid-header [aria-current="date"]')).to_have_count(1)
        line_top = page.locator('.trip-calendar-now').evaluate('e=>parseFloat(e.style.top)')
        assert abs(line_top - (9 * 60 + 37) * 56 / 60) < .1
        align()
        page.locator('.trip-calendar-scroll').evaluate('e=>e.scrollTop=8*56')
        assert page.evaluate("""()=>{
          const label=[...document.querySelectorAll('.trip-calendar-axis span')].find(e=>e.textContent==='09:00').getBoundingClientRect();
          const column=document.querySelector('.trip-calendar-column').getBoundingClientRect();
          return Math.abs(label.y+label.height/2-(column.y+9*56))<1;
        }""")
        log('Four-day week: exact grid/hour alignment, sticky headers and Asia/Tokyo current-time marker')
        expect(event(parent)).to_have_class(re.compile('has-conflict'))
        expect(event(overlap)).to_have_class(re.compile('has-conflict'))
        assert abs(event(parent).bounding_box()['height'] - 112) < 1
        expect(event(parent).locator('.trip-calendar-event-meta')).to_contain_text('3 arrêts')
        expect(event(medium).locator('.trip-calendar-event-time')).to_contain_text('12:00 – 13:00')
        expect(event(medium).locator('.trip-calendar-event-meta')).to_have_count(0)
        short = next(i['id'] for i in state()['items'] if i['trip_id'] == TRIP and i['estimated_duration_minutes'] == 15)
        expect(event(short).locator('strong')).to_have_text('Café de Shibuya')
        expect(event(short).locator('.trip-calendar-event-time')).to_have_count(0)
        expect(event(short).locator('.trip-calendar-event-meta')).to_have_count(0)
        log('Short, medium, long and overlapping activities preserve exact geometry and included stops')
        page.screenshot(path=str(args.output / 'calendar-week.png'))
        page.locator('.trip-calendar-scroll').evaluate('e=>e.scrollTop=15*56')
        assert page.evaluate("""()=>Math.abs(document.querySelector('.trip-calendar-head').getBoundingClientRect().top-
          document.querySelector('.trip-calendar-scroll').getBoundingClientRect().top-1)<1""")
        page.locator('.trip-calendar-scroll').evaluate('e=>e.scrollTop=8*56')
        event(parent).locator('.trip-calendar-event-copy').click(position={'x': 20, 'y': 12})
        expect(event(parent)).to_have_class(re.compile('is-selected'))
        expect(page.locator('.trip-detail-content')).to_be_visible()
        page.get_by_role('button', name='Fermer les détails', exact=True).click()
        menu(parent)
        page.get_by_role('menuitem', name='Modifier l’étape', exact=True).click()
        expect(page.locator('.trip-detail-content')).to_be_visible()
        expect(page.locator('.trip-context-panel')).to_be_focused()
        page.get_by_role('button', name='Fermer les détails', exact=True).click()
        menu(overlap)
        page.get_by_role('menuitem', name='Supprimer l’étape', exact=True).click()
        dialog = page.get_by_role('dialog', name='Retirer cette étape ?', exact=True)
        expect(dialog).to_be_visible()
        dialog.get_by_role('button', name='Annuler', exact=True).click()
        expect(event(overlap)).to_be_visible()
        log('Selection, left click, contextual editing and confirmed deletion remain accessible')
        config(delay=1200)
        menu(medium)
        page.get_by_role('menuitemradio', name='Violet', exact=True).click()
        expect(event(medium)).to_have_attribute('data-save-state', 'saving')
        expect(event(medium)).to_have_attribute('style', re.compile('#A28BC9'))
        saved()
        expect(event(medium)).not_to_have_attribute('data-save-state', 'saving')
        menu(medium)
        page.get_by_role('menuitem', name='Couleurs personnalisées', exact=True).hover()
        page.get_by_role('menuitem', name='Ajouter une couleur personnalisée', exact=True).click()
        palette = page.get_by_role('dialog', name='Ajouter une couleur personnalisée', exact=True)
        palette.get_by_label('Couleur HEX', exact=True).fill('#DFA673')
        palette.get_by_role('button', name=re.compile('Ajouter')).click()
        saved()
        expect(event(medium)).to_have_attribute('style', re.compile('#DFA673'))
        assert any(c['hex_color'] == '#DFA673' for c in state()['palette'])
        log('Preset and custom colors save optimistically with a local saving indicator')
        before = next(i for i in state()['items'] if i['id'] == medium)['estimated_duration_minutes']
        event(medium).locator('.trip-event-resize.is-end').press('ArrowDown')
        expect(event(medium)).to_have_attribute('data-save-state', 'saving')
        saved()
        assert next(i for i in state()['items'] if i['id'] == medium)['estimated_duration_minutes'] == before + 15
        page.locator('.trip-calendar-scroll').evaluate('e=>e.scrollTop=10*56')
        box = event(medium).bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] - 2)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] + 12, steps=8)
        expect(page.locator('.trip-calendar-resize-time')).to_be_visible()
        page.mouse.up()
        saved()
        before_move = next(i for i in state()['items'] if i['id'] == medium).copy()

        def begin_drag():
            box = event(medium).bounding_box()
            page.mouse.move(box['x'] + 30, box['y'] + 12)
            page.mouse.down()
            page.mouse.move(box['x'] + 38, box['y'] + 12, steps=3)
            page.mouse.move(box['x'] + 38, box['y'] + 68, steps=8)
            expect(page.locator('.trip-calendar-drag-preview')).to_be_visible()
            expect(page.locator('.trip-calendar-drag-time')).to_be_visible()

        begin_drag()
        page.keyboard.press('Escape')
        page.mouse.up()
        expect(page.locator('.trip-calendar-drag-preview')).to_have_count(0)
        assert next(i for i in state()['items'] if i['id'] == medium)['start_time'] == before_move['start_time']
        begin_drag()
        page.mouse.up()
        saved()
        after_move = next(i for i in state()['items'] if i['id'] == medium)
        assert after_move['start_time'] != before_move['start_time']
        assert after_move['estimated_duration_minutes'] == before_move['estimated_duration_minutes']
        log('Pointer/keyboard resizing, dimension-preserving dragging and Escape cancellation persist correctly')
        config(invalidIds=[medium])
        event(medium).locator('.trip-event-resize.is-end').press('ArrowDown')
        expect(event(medium)).to_have_attribute('data-save-state', 'error')
        assert event(medium).locator('.trip-calendar-event-state').evaluate('e=>getComputedStyle(e).backgroundColor') != 'rgba(0, 0, 0, 0)'
        assert next(i for i in state()['items'] if i['id'] == medium)['estimated_duration_minutes'] == after_move['estimated_duration_minutes']
        menu(parent)
        page.get_by_role('menuitemradio', name='Vert', exact=True).click()
        expect(event(parent)).to_have_attribute('style', re.compile('#69AA91'))
        expect(event(parent)).not_to_have_attribute('data-save-state', 'saving')
        page.get_by_role('button', name='Fermer le message', exact=True).click()
        config()
        log('A rejected save marks and rolls back only its event; unrelated changes survive')
        menu(overlap)
        page.get_by_role('menuitem', name='Supprimer l’étape', exact=True).click()
        page.get_by_role('dialog', name='Retirer cette étape ?', exact=True).get_by_role('button', name='Retirer', exact=True).click()
        expect(event(overlap)).to_have_count(0)
        saved()
        expect(page.locator('.trip-calendar-scroll')).to_be_focused()
        page.get_by_role('button', name='Jour', exact=True).click()
        page.get_by_role('button', name='Période suivante', exact=True).click()
        expect(page.locator('.trip-calendar-column')).to_have_count(1)
        expect(page.locator('[data-calendar-item-id]')).to_have_count(0)
        expect(page.locator('.trip-calendar-now')).to_have_count(0)
        assert page.locator('.trip-calendar-unscheduled').bounding_box()['height'] <= 12
        page.get_by_role('button', name='Période précédente', exact=True).click()
        expect(page.locator('.trip-calendar-now')).to_have_count(1)
        align()
        page.screenshot(path=str(args.output / 'calendar-day.png'))
        page.get_by_role('button', name='Séjour', exact=True).click()
        expect(page.locator('.trip-calendar-day-card')).to_have_count(4)
        page.screenshot(path=str(args.output / 'calendar-overview.png'))
        page.locator('.trip-calendar-day-card').first.click()
        expect(page.locator('.trip-calendar-column')).to_have_count(1)
        log('Day and stay views, empty days, collapsed unscheduled strip and period navigation work')
        for width, height in [(834, 1112), (390, 844), (320, 568)]:
            page.set_viewport_size({'width': width, 'height': height})
            if width >= 640:
                page.get_by_role('button', name='Semaine', exact=True).click()
                align()
            else:
                expect(page.locator('.trip-calendar-mobile')).to_be_visible()
                expect(page.locator('.trip-calendar-desktop')).not_to_be_visible()
                if height <= 600:
                    assert page.locator('.trip-calendar-mobile').bounding_box()['height'] >= 80
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
            page.screenshot(path=str(args.output / f'calendar-{width}.png'))
        page.evaluate("document.documentElement.classList.add('dark')")
        page.screenshot(path=str(args.output / 'calendar-mobile-dark.png'))
        assert len([s for s in state()['stops'] if s['trip_item_id'] == parent]) == 3
        assert not errors, errors
        log('Tablet, mobile, dark mode and reduced motion fit without horizontal page overflow')
        (args.output / 'calendar.json').write_text(json.dumps({'passed': passed, 'browserErrors': errors}, indent=2), encoding='utf-8')
    finally:
        config()
        context.close()
        browser.close()
