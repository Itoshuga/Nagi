import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MapboxSearchController,
  type MapboxSearchInput,
} from '../apps/web/src/features/integrations/mapbox/search-client';
import { imageSourceUrl, externalHttpUrl } from '../packages/shared/src/urls';
const input = (query: string): MapboxSearchInput => ({
  kind: 'suggest',
  query,
  category: '',
  context: {},
});
const place = (id = 'one') => ({
  source: 'mapbox' as const,
  id,
  title: id,
  query: 'Tokyo',
  proof: 'signed-' + id,
});
const reply = (...ids: string[]) => ({ places: ids.map(place) });
afterEach(() => vi.useRealTimers());
describe('Interactive Mapbox sessions', () => {
  it('keeps valid suggestions when the full-text complement is empty', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockResolvedValueOnce({ ...reply('suggested-place'), refine: true })
        .mockResolvedValueOnce(reply()),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Partial name'));
    await vi.advanceTimersByTimeAsync(900);
    expect(emit).toHaveBeenLastCalledWith({
      phase: 'ready',
      places: reply('suggested-place').places,
    });
    expect(request).toHaveBeenCalledTimes(2);
    client.dispose();
  });
  it('refines an imprecise autocomplete after an idle pause, returning the actual temple without Enter', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockResolvedValueOnce({ ...reply('near-name'), refine: true })
        .mockResolvedValueOnce(reply('asakusa-temple')),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Senso-Ji'));
    await vi.advanceTimersByTimeAsync(300);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(599);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.mock.calls[1]![1]).toMatchObject({ query: 'Senso-Ji', kind: 'forward' });
    expect(emit).toHaveBeenLastCalledWith({
      phase: 'ready',
      places: reply('asakusa-temple').places,
    });
    client.dispose();
  });
  it('cancels a pending refinement when typing resumes or a result is selected', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue({ ...reply('near-name'), refine: true }),
      client = new MapboxSearchController('/external', vi.fn(), vi.fn(), request);
    client.search(input('Senso'));
    await vi.advanceTimersByTimeAsync(300);
    client.search(input('Senso-Ji'));
    await vi.advanceTimersByTimeAsync(300);
    client.finishSearch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every((c) => c[1].kind === 'suggest')).toBe(true);
    client.dispose();
  });
  it('does not retry a failed complement automatically', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockResolvedValueOnce({ ...reply('suggested-place'), refine: true })
        .mockRejectedValueOnce(new Error('Quota atteint')),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Senso-Ji'));
    await vi.advanceTimersByTimeAsync(900);
    expect(emit).toHaveBeenLastCalledWith({
      phase: 'error',
      places: reply('suggested-place').places,
      error: 'Quota atteint',
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(2);
    client.dispose();
  });
  it('aborts an obsolete complement and ignores its late response after a new query', async () => {
    vi.useFakeTimers();
    let finish!: (data: unknown) => void;
    const request = vi
        .fn()
        .mockResolvedValueOnce({ ...reply('near-name'), refine: true })
        .mockReturnValueOnce(
          new Promise((r) => {
            finish = r;
          }),
        )
        .mockResolvedValueOnce(reply('new-query')),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Senso-Ji'));
    await vi.advanceTimersByTimeAsync(900);
    const signal = request.mock.calls[1]![2];
    client.search(input('Tokyo Tower'));
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    finish(reply('old-query'));
    await Promise.resolve();
    expect(emit).toHaveBeenLastCalledWith({ phase: 'ready', places: reply('new-query').places });
    expect(request).toHaveBeenCalledTimes(3);
    client.dispose();
  });
  it('keeps a maximum of six cards in the browser as well', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockResolvedValue(reply(...Array.from({ length: 10 }, (_, i) => String(i)))),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(300);
    expect(emit.mock.lastCall![0].places).toHaveLength(6);
    client.dispose();
  });
  it('debounces 300ms, ignores empty queries and never sends forward while typing', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('one')),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Se'));
    await vi.advanceTimersByTimeAsync(400);
    expect(request).not.toHaveBeenCalled();
    client.search(input('Senso'));
    client.search(input('Sensō-ji'));
    await vi.advanceTimersByTimeAsync(299);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toMatchObject({ kind: 'suggest', query: 'Sensō-ji' });
    expect(emit).toHaveBeenLastCalledWith({ phase: 'ready', places: reply('one').places });
    client.dispose();
  });
  it('aborts obsolete requests and rejects late responses even when cancellation is ignored', async () => {
    vi.useFakeTimers();
    let finish!: (v: unknown) => void;
    const request = vi
        .fn()
        .mockReturnValueOnce(
          new Promise((r) => {
            finish = r;
          }),
        )
        .mockResolvedValueOnce(reply('new')),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('old'));
    await vi.advanceTimersByTimeAsync(300);
    const signal = request.mock.calls[0]![2];
    client.search(input('new'));
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    finish(reply('old'));
    await Promise.resolve();
    expect(emit).toHaveBeenLastCalledWith({ phase: 'ready', places: reply('new').places });
    client.dispose();
  });
  it('reuses only the current presentation on source-tab return and runs explicit forward immediately', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('one')),
      client = new MapboxSearchController('/external', vi.fn(), vi.fn(), request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(300);
    client.cancel();
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(300);
    expect(request).toHaveBeenCalledTimes(1);
    client.search({ ...input('Tokyo'), kind: 'forward' });
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls[1]![1].kind).toBe('forward');
    client.dispose();
  });
  it('serializes successive selections and refreshes suggest before the second retrieve', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockImplementation(async (_url, body) =>
          body.operation === 'resolve'
            ? { place: { ...place(body.placeId), coordinates: { latitude: 35, longitude: 139 } } }
            : reply('one', 'two'),
        ),
      publish = vi.fn(),
      client = new MapboxSearchController('/external', vi.fn(), publish, request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(300);
    const firstSession = request.mock.calls[0]![1].session;
    const a = client.resolve(place('one'));
    const same = client.resolve(place('one'));
    const b = client.resolve(place('two'));
    expect(a).toBe(same);
    await Promise.all([a, b]);
    expect(request.mock.calls.map((c) => c[1].operation)).toEqual([
      'search',
      'resolve',
      'search',
      'resolve',
    ]);
    expect(request.mock.calls[2]![1].session).not.toBe(firstSession);
    expect(request.mock.calls[2]![1].kind).toBe('suggest');
    client.dispose();
  });
  it('keeps existing cards after quota failure and waits for an explicit retry', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockResolvedValueOnce(reply('one'))
        .mockRejectedValueOnce(new Error('Quota atteint'))
        .mockResolvedValueOnce(reply('fresh')),
      emit = vi.fn(),
      client = new MapboxSearchController('/external', emit, vi.fn(), request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(300);
    client.search(input('Tokyo Tower'));
    expect(emit).toHaveBeenLastCalledWith({ phase: 'loading', places: reply('one').places });
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).toHaveBeenLastCalledWith({
      phase: 'error',
      places: reply('one').places,
      error: 'Quota atteint',
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(2);
    client.search(input('Tokyo Tower'));
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).toHaveBeenLastCalledWith({ phase: 'ready', places: reply('fresh').places });
    client.dispose();
  });
  it('does not invent a result when a refreshed session cannot match the saved ID', async () => {
    vi.useFakeTimers();
    const request = vi
        .fn()
        .mockResolvedValueOnce(reply('one'))
        .mockResolvedValueOnce(reply('different')),
      client = new MapboxSearchController('/external', vi.fn(), vi.fn(), request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(180000);
    await expect(client.resolve(place('one'))).rejects.toThrow(/Relancez/);
    expect(request).toHaveBeenCalledTimes(2);
    client.dispose();
  });
});
describe('Browser URL boundaries', () => {
  it('rejects local files and executable protocols', () => {
    for (const value of [
      '',
      undefined,
      'file:///',
      'C:\\photo.jpg',
      'javascript:alert(1)',
      '//example.test/a.jpg',
    ])
      expect(imageSourceUrl(value)).toBeUndefined();
    expect(imageSourceUrl('/app/entry-media/test')).toBe('/app/entry-media/test');
    expect(externalHttpUrl('file:///')).toBeUndefined();
  });
});
