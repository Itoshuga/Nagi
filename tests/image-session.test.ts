import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageSession, imageReferenceKey } from '../apps/web/src/features/images/session';
import { emptyResolution, type ImageReference } from '../apps/web/src/features/images/model';
const ref: ImageReference = {
  source: 'mapbox',
  id: 'saved-place',
  visit: '11111111-1111-4111-8111-111111111111',
  proof: 'temporary-proof',
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('visible photo loading independent from the planner', () => {
  it('calls browser fetch without binding it to the image session', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this instanceof ImageSession) return Promise.reject(new TypeError('Illegal invocation'));
      return Promise.resolve(Response.json(emptyResolution));
    });
    const session = new ImageSession('/images', fetcher as typeof fetch);
    session.observe(ref);
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.get(imageReferenceKey(ref)).error).toBeUndefined();
    expect(session.get(imageReferenceKey(ref)).result?.status).toBe('ready');
    session.dispose();
  });
  it('upgrades an ambiguous suggestion when a retrieved location becomes available', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      return Response.json({
        ...emptyResolution,
        confidence: body.reference.located ? 'high' : 'ambiguous',
      });
    });
    const session = new ImageSession('/images', fetcher as typeof fetch);
    const stop = session.observe({ ...ref, located: false });
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    session.observe({ ...ref, located: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.get(imageReferenceKey(ref)).result?.confidence).toBe('high');
    session.dispose();
  });
  it('deduplicates multiple visible cards and reuses cache reads through planning rerenders', async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      Response.json({ ...emptyResolution, revision: 0 }),
    );
    const session = new ImageSession('/images', fetcher as typeof fetch);
    const first = session.observe(ref),
      second = session.observe(ref);
    await vi.advanceTimersByTimeAsync(900);
    expect(fetcher).toHaveBeenCalledTimes(1);
    first();
    second();
    session.observe({ ...ref });
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).operation).toBe('read');
    session.dispose();
  });
  it('cancels invisible queued results before idle and never issues a planner mutation', async () => {
    const fetcher = vi.fn();
    const session = new ImageSession('/images', fetcher);
    const stop = session.observe(ref);
    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).not.toHaveBeenCalled();
    session.dispose();
  });
  it('resolves once after a cache miss and caps concurrent result jobs', async () => {
    let active = 0,
      max = 0;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      active--;
      return Response.json({
        ...emptyResolution,
        status: body.operation === 'read' ? 'pending' : 'ready',
      });
    });
    const session = new ImageSession('/images', fetcher as typeof fetch);
    for (let i = 0; i < 6; i++) session.observe({ ...ref, id: String(i) });
    await vi.advanceTimersByTimeAsync(2000);
    expect(max).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(12);
    expect(fetcher.mock.calls.every((c) => c[0] === '/images')).toBe(true);
    session.dispose();
  });
  it('reloads the independent photo revision after a concurrent selection conflict', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...emptyResolution, revision: 2 }))
      .mockResolvedValueOnce(Response.json({ error: 'Choix modifié entre-temps' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ...emptyResolution, revision: 3, mode: 'fallback' }));
    const session = new ImageSession('/images', fetcher);
    session.observe(ref);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(session.select(ref, 'fallback', null)).rejects.toThrow('entre-temps');
    expect(session.get(imageReferenceKey(ref)).result?.revision).toBe(3);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).revision).toBe(2);
    session.dispose();
  });
});
