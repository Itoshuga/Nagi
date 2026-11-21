import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleSearchController,
  type GoogleSearchInput,
} from '../apps/web/src/features/integrations/google-places/search-client';
import { externalHttpUrl, imageSourceUrl } from '../packages/shared/src/urls';
import { googleSearchIds } from '../apps/web/src/features/integrations/google-places/search-model';
const input = (query: string): GoogleSearchInput => ({
  kind: 'autocomplete',
  query,
  type: '',
  context: {},
});
const reply = (...ids: string[]) => ({ ids, timing: { providerMs: 5, serverMs: 7 } });
afterEach(() => vi.useRealTimers());
describe('Progressive Google search', () => {
  it('debounces 250ms, preserves Japanese/accents and never runs Text Search with every character', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('google-place-example')),
      emit = vi.fn(),
      client = new GoogleSearchController('/external', emit, request);
    client.search(input('Se'));
    await vi.advanceTimersByTimeAsync(300);
    expect(request).not.toHaveBeenCalled();
    client.search(input('Senso'));
    client.search(input('Sensō-ji'));
    await vi.advanceTimersByTimeAsync(249);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toMatchObject({ kind: 'autocomplete', query: 'Sensō-ji' });
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'ready', ids: ['google-place-example'] }),
    );
    client.dispose();
  });
  it('aborts superseded queries and rejects late responses even if the network ignores cancellation', async () => {
    vi.useFakeTimers();
    let oldResolve!: (value: unknown) => void;
    const first = new Promise((resolve) => {
        oldResolve = resolve;
      }),
      request = vi
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce(reply('new-place-example')),
      emit = vi.fn(),
      client = new GoogleSearchController('/external', emit, request);
    client.search(input('old'));
    await vi.advanceTimersByTimeAsync(250);
    const signal = request.mock.calls[0]![2];
    client.search(input('new'));
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    oldResolve(reply('old-place-example'));
    await Promise.resolve();
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ ids: ['new-place-example'] }));
    client.dispose();
  });
  it('reuses recent ID results and starts an explicit full search without the typing delay', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('google-place-example')),
      client = new GoogleSearchController('/external', vi.fn(), request);
    client.search(input('Café'));
    await vi.advanceTimersByTimeAsync(250);
    client.search(input('Café'));
    expect(request).toHaveBeenCalledTimes(1);
    client.search({ ...input('Café'), kind: 'text_search' });
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls[1]![1].kind).toBe('text_search');
    client.dispose();
  });
  it('rotates tokens on committed selection and never automatically retries quota failures', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('google-place-example')),
      client = new GoogleSearchController('/external', vi.fn(), request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(250);
    const session = request.mock.calls[0]![1].session;
    client.complete('google-place-example');
    expect(request.mock.calls[1]![1]).toMatchObject({ operation: 'selection', session });
    client.complete('google-place-example');
    expect(request).toHaveBeenCalledTimes(2);
    request.mockRejectedValue(new Error('quota'));
    client.search(input('Osaka'));
    await vi.advanceTimersByTimeAsync(250);
    expect(request.mock.calls[2]![1].session).not.toBe(session);
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(3);
    client.dispose();
  });
  it('keeps existing cards mounted during typing and a failed refresh, then replaces them with fresh IDs', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('first-place-example')),
      emit = vi.fn(),
      client = new GoogleSearchController('/external', emit, request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(250);
    request.mockRejectedValueOnce(new Error('Quota atteint'));
    client.search(input('Tokyo tower'));
    expect(emit).toHaveBeenLastCalledWith({ phase: 'loading', ids: ['first-place-example'] });
    await vi.advanceTimersByTimeAsync(250);
    expect(emit).toHaveBeenLastCalledWith({
      phase: 'error',
      ids: ['first-place-example'],
      error: 'Quota atteint',
    });
    request.mockResolvedValueOnce(reply('fresh-place-example'));
    client.search(input('Tokyo tower'));
    await vi.advanceTimersByTimeAsync(250);
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'ready', ids: ['fresh-place-example'] }),
    );
    client.dispose();
  });
  it('clears previous cards when the destination/filter changes or the input is cleared', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(reply('first-place-example')),
      emit = vi.fn(),
      client = new GoogleSearchController('/external', emit, request);
    client.search(input('Tokyo'));
    await vi.advanceTimersByTimeAsync(250);
    client.search({ ...input('Tokyo'), type: 'museum' });
    expect(emit).toHaveBeenLastCalledWith({ phase: 'loading', ids: [] });
    await vi.advanceTimersByTimeAsync(250);
    client.search({ ...input('Tokyo'), context: { region: 'fr' } });
    expect(emit).toHaveBeenLastCalledWith({ phase: 'loading', ids: [] });
    await vi.advanceTimersByTimeAsync(250);
    client.search(input(''));
    expect(emit).toHaveBeenLastCalledWith({ phase: 'idle', ids: [] });
    client.dispose();
  });
  it('preserves provider ordering and carries only valid reference IDs through the adapter', () => {
    expect(
      googleSearchIds(
        {
          places: [
            { id: 'second-place-example' },
            { id: 'first-place-example' },
            { id: 'second-place-example' },
            { id: 'file:///bad' },
          ],
        },
        'text_search',
      ),
    ).toEqual(['second-place-example', 'first-place-example']);
    expect(googleSearchIds(null, 'autocomplete')).toEqual([]);
  });
});
describe('Browser URL boundaries', () => {
  it('rejects OS paths, file URLs, empty values and executable schemes', () => {
    for (const value of [
      '',
      undefined,
      'file:///',
      'file:///C:/photo.jpg',
      'C:\\photo.jpg',
      'javascript:alert(1)',
      '//example.test/image.png',
    ])
      expect(imageSourceUrl(value)).toBeUndefined();
    expect(imageSourceUrl('/app/entry-media/test')).toBe('/app/entry-media/test');
    expect(imageSourceUrl('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
    expect(externalHttpUrl('file:///')).toBeUndefined();
  });
});
