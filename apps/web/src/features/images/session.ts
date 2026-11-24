'use client';
import {
  emptyResolution,
  isTemporaryImage,
  type PersistentImage,
  type ProviderImage,
  type PreviewImage,
  type ImageReference,
  type ImageResolution,
} from './model';
export type ImageState = { result?: ImageResolution; loading?: boolean; error?: string };
export const emptyImageState: ImageState = {};
export const imageReferenceKey = (ref: ImageReference) =>
  [
    ref.source,
    ...(ref.kind && ref.kind !== 'entry' ? [ref.kind] : []),
    ref.id,
    ref.visit ?? '',
  ].join(':');
type Work = {
  key: string;
  ref: ImageReference;
  interested: number;
  attempts: number;
  upgrade?: boolean;
  refreshRequested?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  abort?: AbortController;
};
export class ImageSession {
  private records = new Map<string, ImageState>();
  private listeners = new Map<string, Set<() => void>>();
  private work = new Map<string, Work>();
  private queue: Work[] = [];
  private active = 0;
  private disposed = false;
  private concurrency = 2;
  private expiries = new Map<string, ReturnType<typeof setTimeout>>();
  private versions = new Map<string, number>();
  constructor(
    readonly url: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  get = (key: string) => this.records.get(key) ?? emptyImageState;
  subscribe = (key: string, fn: () => void) => {
    const set = this.listeners.get(key) ?? new Set();
    set.add(fn);
    this.listeners.set(key, set);
    return () => {
      set.delete(fn);
      if (!set.size) this.listeners.delete(key);
    };
  };
  private update(key: string, state: ImageState) {
    if (this.disposed) return;
    clearTimeout(this.expiries.get(key));
    this.expiries.delete(key);
    if (state.result) {
      const usable = (image: NonNullable<ImageResolution['selected']>) =>
        !isTemporaryImage(image) || Date.parse(image.expiresAt) > Date.now();
      state = {
        ...state,
        result: {
          ...state.result,
          selected:
            state.result.selected && usable(state.result.selected) ? state.result.selected : null,
          candidates: state.result.candidates.filter(usable),
        },
      };
      const expiries = [state.result!.selected, ...state.result!.candidates]
        .filter((photo): photo is ProviderImage => !!photo && isTemporaryImage(photo))
        .map((photo) => Date.parse(photo.expiresAt));
      if (expiries.length)
        this.expiries.set(
          key,
          setTimeout(
            () => {
              this.update(key, this.get(key));
            },
            Math.max(1, Math.min(...expiries) - Date.now()),
          ),
        );
    }
    this.records.set(key, state);
    for (const fn of this.listeners.get(key) ?? []) fn();
  }
  start() {
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
    for (const work of this.work.values()) {
      clearTimeout(work.timer);
      work.abort?.abort();
    }
    this.queue = [];
    this.work.clear();
    for (const timer of this.expiries.values()) clearTimeout(timer);
    this.expiries.clear();
    this.records.clear();
  }
  observe(ref: ImageReference) {
    const key = imageReferenceKey(ref);
    let work = this.work.get(key);
    if (!work) {
      work = { key, ref, interested: 0, attempts: 0 };
      this.work.set(key, work);
    }
    const improved =
      (ref.located && !work.ref.located) ||
      (ref.priority === 'selected' && work.ref.priority !== 'selected');
    if (improved && work.abort) work.upgrade = true;
    // A visible thumbnail must not downgrade a selected details panel sharing
    // this record, or remove its confirmed Mapbox context before the job runs.
    work.ref = {
      ...work.ref,
      ...ref,
      priority: work.ref.priority === 'selected' ? 'selected' : ref.priority,
      located: work.ref.located || ref.located,
      proof: ref.proof ?? work.ref.proof,
    };
    work.interested++;
    const result = this.get(key).result;
    if (
      !result ||
      (result.reasons.includes('context-pending') && ref.proof) ||
      (improved && result.confidence !== 'high')
    )
      this.schedule(work);
    return () => {
      if (!work) return;
      work.interested--;
      if (!work.interested) {
        clearTimeout(work.timer);
        work.timer = undefined;
        this.queue = this.queue.filter((v) => v !== work);
      }
    };
  }
  private schedule(work: Work, delay = 850) {
    if (this.disposed || work.timer || work.abort || this.queue.includes(work)) return;
    work.timer = setTimeout(() => {
      work.timer = undefined;
      if (!work.interested || this.disposed) return;
      this.queue.push(work);
      this.pump();
    }, delay);
  }
  private pump() {
    while (!this.disposed && this.active < this.concurrency && this.queue.length) {
      const work = this.queue.shift()!;
      if (!work.interested) continue;
      this.active++;
      work.abort = new AbortController();
      void this.load(work).finally(() => {
        this.active--;
        work.abort = undefined;
        if (work.upgrade || work.refreshRequested) {
          const refresh = work.refreshRequested;
          work.refreshRequested = false;
          work.upgrade = false;
          if (refresh || this.get(work.key).result?.confidence !== 'high') this.schedule(work, 0);
        }
        this.pump();
      });
    }
  }
  private async load(work: Work) {
    const { key, ref } = work;
    const version = this.versions.get(key) ?? 0;
    this.update(key, { ...this.get(key), loading: true });
    try {
      let result = await this.request({ operation: 'read', reference: ref }, work.abort?.signal);
      if (
        result.maxConcurrentRequests &&
        result.maxConcurrentRequests >= 1 &&
        result.maxConcurrentRequests <= 20
      )
        this.concurrency = Math.floor(result.maxConcurrentRequests);
      if (result.status === 'pending')
        result = await this.request({ operation: 'resolve', reference: ref }, work.abort?.signal);
      if ((this.versions.get(key) ?? 0) !== version) return;
      this.update(key, { result });
      const retryLimit = result.reasons.includes('serper:waiting') ? 20 : 4;
      if (result.status === 'pending' && result.retryAfter && work.attempts++ < retryLimit) {
        // Schedule after finally releases the in-flight marker.
        work.timer = setTimeout(() => {
          work.timer = undefined;
          this.schedule(work, 0);
        }, result.retryAfter * 1000);
      }
    } catch (error) {
      if (!this.disposed && (this.versions.get(key) ?? 0) === version)
        this.update(key, {
          result: { ...emptyResolution, status: 'unavailable' },
          error: error instanceof Error ? error.message : 'Photographie indisponible.',
        });
    }
  }
  async request<T = ImageResolution>(body: unknown, signal?: AbortSignal): Promise<T> {
    // Native browser fetch rejects a custom receiver ("Illegal invocation").
    // Keep it detached; calling this.fetcher(...) binds it to ImageSession.
    const request = this.fetcher;
    const response = await request(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? 'Les photographies sont indisponibles.');
    return data;
  }
  async select(
    ref: ImageReference,
    mode: 'automatic' | 'manual' | 'fallback',
    image: string | null,
    optimistic?: PersistentImage,
  ) {
    const key = imageReferenceKey(ref),
      revision = this.get(key).result?.revision ?? 0;
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    const previous = this.get(key);
    if (mode === 'manual' && optimistic)
      this.update(key, {
        result: { ...(previous.result ?? emptyResolution), selected: optimistic, mode: 'manual' },
      });
    try {
      const result = await this.request({
        operation: 'select',
        reference: ref,
        mode,
        image,
        revision,
      });
      this.update(key, { result });
      if (mode === 'automatic') this.invalidate(ref.visit);
      return result;
    } catch (error) {
      this.update(key, previous);
      // Refresh the independent photo revision after a concurrent editor wins.
      const result = await this.request({ operation: 'read', reference: ref });
      this.update(key, { result });
      throw error;
    }
  }
  async selectPreview(
    ref: ImageReference,
    mode: NonNullable<ImageResolution['previewMode']>,
    image: string | null,
    optimistic?: PersistentImage | PreviewImage,
  ) {
    const key = imageReferenceKey(ref),
      previous = this.get(key);
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    if (mode === 'manual' && optimistic)
      this.update(key, {
        result: {
          ...(previous.result ?? emptyResolution),
          previewEnabled: true,
          selected: optimistic,
          coverHidden: false,
          mode: 'manual',
          previewMode: 'manual',
        },
      });
    try {
      const result = await this.request({
        operation: 'preview',
        reference: ref,
        mode,
        image,
        revision: previous.result?.previewRevision ?? 0,
      });
      this.update(key, { result });
      return result;
    } catch (error) {
      this.update(key, previous);
      try {
        this.update(key, { result: await this.request({ operation: 'read', reference: ref }) });
      } catch {
        /* Keep the previous cover while offline. */
      }
      throw error;
    }
  }
  selectTemporary(ref: ImageReference, image: ProviderImage) {
    if (
      Date.parse(image.expiresAt) <= Date.now() ||
      (image.provider === 'mapbox' && image.sourceId !== ref.id)
    )
      throw new Error('Cette photographie temporaire n’est plus disponible.');
    const key = imageReferenceKey(ref),
      state = this.get(key);
    const work = this.work.get(key);
    if (work) {
      clearTimeout(work.timer);
      work.timer = undefined;
      work.upgrade = false;
      this.queue = this.queue.filter((item) => item !== work);
    }
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    this.update(key, {
      result: {
        ...(state.result ?? emptyResolution),
        selected: image,
        candidates: state.result?.candidates ?? [image],
        mode: 'manual',
        status: 'ready',
        reasons: ['session-selection'],
      },
    });
  }
  invalidate(visit?: string) {
    for (const work of this.work.values())
      if (!visit || work.ref.visit === visit) {
        this.versions.set(work.key, (this.versions.get(work.key) ?? 0) + 1);
        if (work.abort) work.upgrade = true;
        this.records.delete(work.key);
        work.attempts = 0;
        for (const fn of this.listeners.get(work.key) ?? []) fn();
        if (work.interested) this.schedule(work, 0);
      }
  }
  refresh(ref: ImageReference) {
    const key = imageReferenceKey(ref),
      work = this.work.get(key);
    if (!work) return;
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    clearTimeout(work.timer);
    work.timer = undefined;
    work.attempts = 0;
    this.update(key, { ...this.get(key), loading: true, error: undefined });
    if (work.abort) work.refreshRequested = true;
    else if (work.interested) this.schedule(work, 0);
  }
  broken(ref: ImageReference, image: string) {
    const key = imageReferenceKey(ref),
      state = this.get(key);
    if (state.result?.selected?.id !== image) return;
    const selected = state.result.selected;
    const alternative = state.result.candidates.find(
      (photo) => photo.id !== image && !isTemporaryImage(photo),
    );
    this.update(key, {
      result: {
        ...state.result,
        selected: alternative ?? null,
        candidates: state.result.candidates.filter((photo) => photo.id !== image),
        reasons: ['selected-image-unavailable'],
      },
    });
    // Report once; no retry loop and no global invalidation based on a client error.
    if (!isTemporaryImage(selected))
      void this.request({ operation: 'broken', reference: ref, image }).catch(() => {});
  }
}
