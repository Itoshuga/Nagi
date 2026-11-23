'use client';
import { emptyResolution, type ImageReference, type ImageResolution } from './model';
export type ImageState = { result?: ImageResolution; loading?: boolean; error?: string };
export const emptyImageState: ImageState = {};
export const imageReferenceKey = (ref: ImageReference) =>
  [ref.source, ref.id, ref.visit ?? ''].join(':');
type Work = {
  key: string;
  ref: ImageReference;
  interested: number;
  attempts: number;
  upgrade?: boolean;
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
  }
  observe(ref: ImageReference) {
    const key = imageReferenceKey(ref);
    let work = this.work.get(key);
    if (!work) {
      work = { key, ref, interested: 0, attempts: 0 };
      this.work.set(key, work);
    }
    const improved = ref.located && !work.ref.located;
    if (improved && work.abort) work.upgrade = true;
    work.ref = ref;
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
    while (!this.disposed && this.active < 2 && this.queue.length) {
      const work = this.queue.shift()!;
      if (!work.interested) continue;
      this.active++;
      work.abort = new AbortController();
      void this.load(work).finally(() => {
        this.active--;
        work.abort = undefined;
        if (work.upgrade) {
          work.upgrade = false;
          if (this.get(work.key).result?.confidence !== 'high') this.schedule(work, 0);
        }
        this.pump();
      });
    }
  }
  private async load(work: Work) {
    const { key, ref } = work;
    this.update(key, { ...this.get(key), loading: true });
    try {
      let result = await this.request({ operation: 'read', reference: ref }, work.abort?.signal);
      if (result.status === 'pending')
        result = await this.request({ operation: 'resolve', reference: ref }, work.abort?.signal);
      this.update(key, { result });
      if (result.status === 'pending' && result.retryAfter && work.attempts++ < 4) {
        // Schedule after finally releases the in-flight marker.
        work.timer = setTimeout(() => {
          work.timer = undefined;
          this.schedule(work, 0);
        }, result.retryAfter * 1000);
      }
    } catch (error) {
      if (!this.disposed)
        this.update(key, {
          result: { ...emptyResolution, status: 'unavailable' },
          error: error instanceof Error ? error.message : 'Photographie indisponible.',
        });
    }
  }
  async request(body: unknown, signal?: AbortSignal): Promise<ImageResolution> {
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
  ) {
    const key = imageReferenceKey(ref),
      revision = this.get(key).result?.revision ?? 0;
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
      // Refresh the independent photo revision after a concurrent editor wins.
      const result = await this.request({ operation: 'read', reference: ref });
      this.update(key, { result });
      throw error;
    }
  }
  invalidate(visit?: string) {
    for (const work of this.work.values())
      if (!visit || work.ref.visit === visit) {
        this.records.delete(work.key);
        work.attempts = 0;
        for (const fn of this.listeners.get(work.key) ?? []) fn();
        if (work.interested) this.schedule(work, 0);
      }
  }
  broken(ref: ImageReference, image: string) {
    const key = imageReferenceKey(ref),
      state = this.get(key);
    if (state.result?.selected?.id !== image) return;
    this.update(key, {
      result: { ...state.result, selected: null, reasons: ['selected-image-unavailable'] },
    });
    // Report once; no retry loop and no global invalidation based on a client error.
    void this.request({ operation: 'broken', reference: ref, image }).catch(() => {});
  }
}
