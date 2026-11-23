'use client';
import { mapboxSearchResultLimit, type CatalogPlace, type MapboxSearchRequest } from '@nagi/shared';
import { mapboxClientRequest } from './client';
import { mapboxSearchDelay, mapboxRefinementDelay } from './search-model';
export type MapboxSearchInput = Omit<MapboxSearchRequest, 'operation' | 'session'>;
export type MapboxSearchState = {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  places: CatalogPlace[];
  error?: string;
};
/** One controller per open search. Only current in-memory presentation is kept. */
export class MapboxSearchController {
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private refinement: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;
  private session = crypto.randomUUID();
  private touched = 0;
  private requests = 0;
  private ended = false;
  private visible: CatalogPlace[] = [];
  private input: MapboxSearchInput | undefined;
  private readyKey: string | undefined;
  private selectionTail: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Promise<CatalogPlace>>();
  constructor(
    private readonly url: string,
    private readonly emit: (state: MapboxSearchState) => void,
    private readonly publish: (place: CatalogPlace) => void,
    private readonly request = mapboxClientRequest,
  ) {}
  search(input: MapboxSearchInput, minCharacters = 3) {
    this.cancel();
    const sequence = this.sequence;
    const next = { ...input, query: input.query.trim() };
    const key = JSON.stringify(next);
    const sameContext =
      JSON.stringify(this.input?.context) === JSON.stringify(next.context) &&
      this.input?.category === next.category;
    this.input = next;
    if (this.readyKey === key && Date.now() - this.touched < 175000) {
      this.emit({ phase: 'ready', places: this.visible });
      return;
    }
    if (!sameContext) this.visible = [];
    if (this.input.query.length < minCharacters) {
      this.visible = [];
      this.emit({ phase: 'idle', places: [] });
      return;
    }
    if (this.ended || Date.now() - this.touched > 175000 || this.requests >= 49) {
      this.session = crypto.randomUUID();
      this.ended = false;
      this.requests = 0;
    }
    this.touched = Date.now();
    this.emit({ phase: 'loading', places: this.visible });
    const criteria = this.input;
    this.timer = setTimeout(
      async () => {
        const abort = new AbortController();
        this.abort = abort;
        try {
          this.requests++;
          const result = await this.request(
            this.url,
            { ...criteria, operation: 'search', session: this.session },
            abort.signal,
          );
          if (abort.signal.aborted || sequence !== this.sequence) return;
          const refine = criteria.kind === 'suggest' && result.refine === true;
          this.readyKey = refine ? undefined : key;
          this.visible = (result.places as CatalogPlace[]).slice(0, mapboxSearchResultLimit);
          for (const place of this.visible) this.publish(place);
          this.emit({ phase: refine ? 'loading' : 'ready', places: this.visible });
          if (refine) {
            // Only refine an incomplete match after the query stays idle. A new
            // character, explicit search, selection or closed picker cancels it.
            this.refinement = setTimeout(async () => {
              if (abort.signal.aborted || sequence !== this.sequence) return;
              try {
                const improved = await this.request(
                  this.url,
                  {
                    ...criteria,
                    kind: 'forward',
                    operation: 'search',
                    session: this.session,
                  },
                  abort.signal,
                );
                if (abort.signal.aborted || sequence !== this.sequence) return;
                this.readyKey = key;
                const refined = (improved.places as CatalogPlace[]).slice(
                  0,
                  mapboxSearchResultLimit,
                );
                // A full-text search can be empty for a valid partial query.
                // Keep the real suggestions and their still-valid session then.
                if (refined.length) this.visible = refined;
                for (const place of this.visible) this.publish(place);
                this.emit({ phase: 'ready', places: this.visible });
              } catch (error) {
                if (!abort.signal.aborted && sequence === this.sequence)
                  this.emit({
                    phase: 'error',
                    places: this.visible,
                    error:
                      error instanceof Error ? error.message : 'La recherche est indisponible.',
                  });
              }
            }, mapboxRefinementDelay);
          }
        } catch (error) {
          this.readyKey = undefined;
          if (!abort.signal.aborted && sequence === this.sequence)
            this.emit({
              phase: 'error',
              places: this.visible,
              error: error instanceof Error ? error.message : 'La recherche est indisponible.',
            });
        }
      },
      input.kind === 'forward' ? 0 : mapboxSearchDelay,
    );
  }
  resolve(place: CatalogPlace): Promise<CatalogPlace> {
    if (place.coordinates) return Promise.resolve(place);
    const existing = this.pending.get(place.id);
    if (existing) return existing;
    const task = this.selectionTail
      .then(() => this.resolveSelection(place))
      .finally(() => this.pending.delete(place.id));
    this.selectionTail = task.catch(() => {});
    this.pending.set(place.id, task);
    return task;
  }
  private async resolveSelection(place: CatalogPlace) {
    let candidate = place;
    if (this.ended || Date.now() - this.touched > 175000) {
      // Selecting a second suggestion starts a fresh paired session. Never reuse
      // the token consumed by the first retrieve, even if the list stays visible.
      const session = crypto.randomUUID();
      this.session = session;
      this.ended = false;
      this.touched = Date.now();
      this.requests = 1;
      const result = await this.request(this.url, {
        ...this.input,
        query: place.query,
        kind: 'suggest',
        operation: 'search',
        session,
      });
      candidate = result.places.find((p: CatalogPlace) => p.id === place.id);
      if (!candidate)
        throw new Error('Ce résultat a changé. Relancez la recherche pour choisir ce lieu.');
    }
    this.ended = true;
    const result = await this.request(this.url, {
      operation: 'resolve',
      placeId: candidate.id,
      query: candidate.query,
      proof: candidate.proof,
      context: this.input?.context,
    });
    this.publish(result.place);
    return result.place;
  }
  cancel() {
    this.sequence++;
    clearTimeout(this.timer);
    clearTimeout(this.refinement);
    this.abort?.abort();
  }
  finishSearch() {
    this.cancel();
    this.emit({ phase: 'ready', places: this.visible });
  }
  dispose() {
    this.cancel();
    this.visible = [];
    this.pending.clear();
  }
}
