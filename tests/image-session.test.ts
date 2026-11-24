import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageSession, imageReferenceKey } from '../apps/web/src/features/images/session';
import {
  emptyResolution,
  type ImageReference,
  type ProviderImage,
  type PreviewImage,
} from '../apps/web/src/features/images/model';
const ref: ImageReference = {
  source: 'mapbox',
  id: 'saved-place',
  visit: '11111111-1111-4111-8111-111111111111',
  proof: 'temporary-proof',
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('visible photo loading independent from the planner', () => {
  const previewPhoto: PreviewImage = {
    id: 'abc00000-0000-4000-8000-000000000011',
    provider: 'serper',
    sourceId: 'serper:photo',
    sourceUrl: 'https://venue.example.org/photos',
    imageUrl: 'https://venue.example.org/original.jpg',
    thumbnailUrl: 'https://thumbs.example.org/photo.jpg',
    previewUrl: 'https://venue.example.org/original.jpg',
    title: 'Kamakura',
    attribution: 'Venue',
    rightsStatus: 'unknown',
    usageRights: 'development-preview',
  };
  it('uses a separate optimistic preview mutation and reloads the server choice without indexing', async () => {
    let saved = {
      ...emptyResolution,
      previewEnabled: true,
      previewRevision: 3,
    } as import('../apps/web/src/features/images/model').ImageResolution;
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (body.operation === 'preview')
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return Response.json(saved);
    });
    const first = new ImageSession('/images', fetcher as typeof fetch);
    first.observe(ref);
    await vi.advanceTimersByTimeAsync(900);
    const saving = first.selectPreview(ref, 'manual', previewPhoto.id, previewPhoto);
    expect(first.get(imageReferenceKey(ref)).result?.selected).toBe(previewPhoto);
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toMatchObject({
      operation: 'preview',
      revision: 3,
      image: previewPhoto.id,
    });
    saved = {
      ...saved,
      selected: previewPhoto,
      candidates: [previewPhoto],
      previewRevision: 4,
      previewMode: 'manual',
      mode: 'manual',
    };
    finish(Response.json(saved));
    await saving;
    first.dispose();
    const reloaded = new ImageSession('/images', fetcher as typeof fetch);
    reloaded.observe(ref);
    await vi.advanceTimersByTimeAsync(900);
    expect(reloaded.get(imageReferenceKey(ref)).result?.selected?.id).toBe(previewPhoto.id);
    expect(fetcher.mock.calls.map((call) => JSON.parse(call[1]!.body as string).operation)).toEqual(
      ['read', 'preview', 'read'],
    );
    reloaded.dispose();
  });
  it('refreshes only the changed place after discovery and updates its cover without another indexing request', async () => {
    let ready = false;
    const other = { ...ref, id: 'other-place', visit: '22222222-2222-4222-8222-222222222222' };
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      return Response.json({
        ...emptyResolution,
        selected: ready && body.reference.id === ref.id ? previewPhoto : null,
      });
    });
    const session = new ImageSession('/images', fetcher as typeof fetch);
    session.observe(ref);
    session.observe(other);
    await vi.advanceTimersByTimeAsync(900);
    expect(fetcher).toHaveBeenCalledTimes(2);
    ready = true;
    session.refresh(ref);
    await vi.advanceTimersByTimeAsync(10);
    expect(session.get(imageReferenceKey(ref)).result?.selected?.id).toBe(previewPhoto.id);
    expect(session.get(imageReferenceKey(other)).result?.selected).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.every((call) => JSON.parse(call[1]!.body as string).operation === 'read'),
    ).toBe(true);
    session.dispose();
  });
  it('rolls back a refused preview without writing a public choice or searching again', async () => {
    const previous = { ...emptyResolution, previewEnabled: true, previewRevision: 2 };
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) =>
      JSON.parse(init?.body as string).operation === 'preview'
        ? Response.json({ error: 'Accès refusé' }, { status: 403 })
        : Response.json(previous),
    );
    const session = new ImageSession('/images', fetcher as typeof fetch);
    session.observe(ref);
    await vi.advanceTimersByTimeAsync(900);
    await expect(
      session.selectPreview(ref, 'manual', previewPhoto.id, previewPhoto),
    ).rejects.toThrow('Accès refusé');
    expect(session.get(imageReferenceKey(ref)).result?.selected).toBeNull();
    expect(session.get(imageReferenceKey(ref)).result?.previewRevision).toBe(2);
    expect(fetcher.mock.calls.map((call) => JSON.parse(call[1]!.body as string).operation)).toEqual(
      ['read', 'preview', 'read'],
    );
    session.dispose();
  });
  const temporary = (): ProviderImage => ({
    id: 'mapbox-photo:session',
    provider: 'mapbox',
    sourceId: ref.id,
    sourceUrl: 'https://example.org/',
    imageUrl: 'https://example.org/storefront.jpg',
    thumbnailUrl: 'https://example.org/storefront.jpg',
    previewUrl: 'https://example.org/storefront.jpg',
    title: 'Venue',
    attribution: 'Source example.org',
    usageRights: 'provider-restricted',
    persistence: 'session',
    cropAllowed: false,
    expiresAt: new Date(Date.now() + 10000).toISOString(),
  });
  it('keeps a restricted choice local to an occurrence, expires it and makes no write or retry', async () => {
    const fetcher = vi.fn();
    const session = new ImageSession('/images', fetcher);
    session.selectTemporary(ref, temporary());
    expect(session.get(imageReferenceKey(ref)).result?.selected?.provider).toBe('mapbox');
    expect(session.get(imageReferenceKey({ ...ref, visit: 'another' })).result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(11000);
    expect(session.get(imageReferenceKey(ref)).result?.selected).toBeNull();
    expect(session.get(imageReferenceKey(ref)).result?.candidates).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
    session.dispose();
  });
  it('ignores an automatic request that completes after a local manual choice', async () => {
    let complete!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    const session = new ImageSession('/images', fetcher);
    session.observe(ref);
    await vi.advanceTimersByTimeAsync(900);
    session.selectTemporary(ref, temporary());
    complete(Response.json(emptyResolution));
    await vi.advanceTimersByTimeAsync(1);
    expect(session.get(imageReferenceKey(ref)).result?.selected?.id).toBe('mapbox-photo:session');
    session.dispose();
  });
  it('does not report a restricted asset to the persistent image verification endpoint', () => {
    const fetcher = vi.fn();
    const session = new ImageSession('/images', fetcher);
    const photo = temporary();
    session.selectTemporary(ref, photo);
    session.broken(ref, photo.id);
    expect(session.get(imageReferenceKey(ref)).result?.selected).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    session.dispose();
  });
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
  it('does not let a lazy thumbnail disable automatic discovery requested by the details panel', async () => {
    const fetcher = vi.fn(async () => Response.json(emptyResolution));
    const session = new ImageSession('/images', fetcher as typeof fetch);
    const selected = {
      source: 'nagi' as const,
      id: 'place',
      priority: 'selected' as const,
      located: true,
      proof: 'confirmed',
    };
    session.observe(selected);
    session.observe({ ...selected, priority: 'visible', located: false, proof: undefined });
    await vi.advanceTimersByTimeAsync(1000);
    const body = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1].body as string,
    );
    expect(body.reference).toMatchObject({
      priority: 'selected',
      located: true,
      proof: 'confirmed',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
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
