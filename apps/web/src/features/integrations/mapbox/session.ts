'use client';
import type { CatalogPlace, TripPlaceReference } from '@nagi/shared';
import { mapboxClientRequest } from './client';

export type RecordState = {
  place?: CatalogPlace;
  loading?: boolean;
  error?: string;
  at?: number;
  detailsLoaded?: boolean;
  detailsLoading?: boolean;
  detailsError?: string;
};
export const emptyPlaceState: RecordState = {};
export class ExternalPlaceSession {
  private records = new Map<string, RecordState>();
  private listeners = new Map<string, Set<() => void>>();
  private all = new Set<() => void>();
  private version = 0;
  private pending = new Map<string, Promise<CatalogPlace>>();
  private enriched = new Map<string, Promise<void>>();
  private resolvers = new Map<string, () => Promise<CatalogPlace>>();
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  private disposed = false;
  private context: { proximity?: [number, number] } = {};
  setContext(context: { proximity?: [number, number] }) {
    this.context = context;
  }
  status?: Promise<{
    available: boolean;
    minCharacters: number;
    photos: boolean;
    mapAvailable: boolean;
  }>;
  constructor(
    readonly url: string,
    readonly replace?: (id: string) => void,
    readonly preview?: (place: CatalogPlace) => void,
  ) {}
  get = (id: string) => this.records.get(id) ?? emptyPlaceState;
  getVersion = () => this.version;
  subscribeAll = (listener: () => void) => {
    this.all.add(listener);
    return () => {
      this.all.delete(listener);
    };
  };
  subscribe = (id: string, listener: () => void) => {
    const list = this.listeners.get(id) ?? new Set();
    list.add(listener);
    this.listeners.set(id, list);
    return () => {
      list.delete(listener);
      if (!list.size) this.listeners.delete(id);
    };
  };
  private update(id: string, patch: Partial<RecordState>) {
    if (this.disposed) return;
    this.records.set(id, { ...this.get(id), ...patch });
    this.version++;
    for (const fn of this.listeners.get(id) ?? []) fn();
    for (const fn of this.all) fn();
  }
  put = (place: CatalogPlace) => {
    const previous = this.get(place.id);
    // A new suggestion must not discard an already resolved coordinate/proof.
    if (previous.place?.coordinates && !place.coordinates) return;
    this.update(place.id, {
      place: { ...previous.place, ...place },
      error: undefined,
      at: Date.now(),
      loading: false,
    });
  };
  register = (id: string, resolve: () => Promise<CatalogPlace>) => {
    this.resolvers.set(id, resolve);
    return () => {
      if (this.resolvers.get(id) === resolve) this.resolvers.delete(id);
    };
  };
  ensure = (id: string, query: string, force = false): Promise<CatalogPlace> => {
    const record = this.get(id);
    if (!force && record.place?.coordinates && Date.now() - (record.at ?? 0) < 9 * 60 * 1000)
      return Promise.resolve(record.place);
    const current = this.pending.get(id);
    if (current) return current;
    if (!force && record.error) return Promise.reject(new Error(record.error));
    this.update(id, { loading: true, error: undefined });
    const run = async () => {
      if (this.disposed) throw new Error('Session terminée.');
      try {
        const resolver = this.resolvers.get(id);
        const place =
          resolver && !force
            ? await resolver()
            : ((
                await mapboxClientRequest(
                  this.url,
                  {
                    operation: 'resolve',
                    placeId: id,
                    query,
                    proof: record.place?.proof,
                    context: this.context,
                  },
                  this.abort.signal,
                )
              ).place as CatalogPlace);
        if (!place.coordinates) throw new Error('La localisation du lieu est indisponible.');
        this.put(place);
        return place;
      } catch (error) {
        this.update(id, {
          loading: false,
          error: error instanceof Error ? error.message : 'Le lieu est momentanément indisponible.',
        });
        throw error;
      }
    };
    const task = this.tail.then(run).finally(() => {
      this.pending.delete(id);
    });
    // Space cold lookups; one saved lookup may contain a paired suggest/retrieve.
    this.tail = task.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, 300)));
    this.pending.set(id, task);
    return task;
  };
  reference = async (
    id: string,
    query: string,
  ): Promise<Extract<TripPlaceReference, { source: 'mapbox' }>> => {
    const place = await this.ensure(id, query);
    return { source: 'mapbox', placeId: id, query: place.query ?? query, proof: place.proof };
  };
  details = (id: string, query: string, force = false): Promise<void> => {
    const current = this.enriched.get(id);
    if (current) return current;
    if (!force && this.get(id).detailsLoaded) return Promise.resolve();
    this.update(id, { detailsLoading: true, detailsError: undefined });
    const task = (async () => {
      try {
        const base = await this.ensure(id, query);
        if (base.featureType !== 'poi') {
          this.update(id, { detailsLoading: false, detailsLoaded: true });
          return;
        }
        const data = await mapboxClientRequest(
          this.url,
          { operation: 'details', placeId: id, query: base.query ?? query, proof: base.proof },
          this.abort.signal,
        );
        const extra = Object.fromEntries(
          Object.entries(data.place).filter(([, value]) => value != null && value !== ''),
        );
        this.put({ ...base, ...extra, query: base.query, proof: base.proof });
        this.update(id, { detailsLoaded: true, detailsLoading: false });
      } catch (error) {
        this.update(id, {
          detailsLoaded: true,
          detailsLoading: false,
          detailsError:
            error instanceof Error
              ? error.message
              : 'Les détails supplémentaires sont indisponibles.',
        });
      }
    })().finally(() => this.enriched.delete(id));
    this.enriched.set(id, task);
    return task;
  };
  start() {
    if (this.disposed) {
      this.disposed = false;
      this.abort = new AbortController();
    }
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.records.clear();
    this.resolvers.clear();
    this.listeners.clear();
    this.all.clear();
    this.pending.clear();
    this.enriched.clear();
  }
}
