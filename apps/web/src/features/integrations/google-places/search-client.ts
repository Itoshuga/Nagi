'use client';
import { googleClientRequest } from './client';
import { googleSearchDelay } from './search-model';
import type { GoogleSearchRequest } from '@nagi/shared';

export type GoogleSearchInput = Omit<GoogleSearchRequest, 'operation' | 'session'>;
export type GoogleSearchState = {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  ids: string[];
  error?: string;
  timing?: { providerMs: number; serverMs: number; requestMs: number };
};
type Reply = { ids: string[]; timing: { providerMs: number; serverMs: number } };
/** Scoped to one open picker. No persistent cache, automatic retries or hover requests. */
export class GoogleSearchController {
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;
  private session = crypto.randomUUID();
  private touched = 0;
  private sessionUsed = false;
  private pendingKey: string | undefined;
  private visibleIds: string[] = [];
  private scope: string | undefined;
  private cache = new Map<string, { at: number; reply: Reply }>();
  constructor(
    private readonly url: string,
    private readonly emit: (state: GoogleSearchState) => void,
    private readonly request = googleClientRequest,
  ) {}
  search(input: GoogleSearchInput, minCharacters = 3) {
    const normalized = { ...input, query: input.query.trim() },
      nextKey = JSON.stringify(normalized);
    if (this.pendingKey === nextKey) return;
    this.cancel();
    const scope = JSON.stringify({ type: input.type, context: input.context });
    if (scope !== this.scope) this.visibleIds = [];
    this.scope = scope;
    const sequence = this.sequence,
      query = input.query.trim();
    if (query.length < minCharacters) {
      this.visibleIds = [];
      if (!query) {
        this.session = crypto.randomUUID();
        this.sessionUsed = false;
      }
      this.emit({ phase: 'idle', ids: [] });
      return;
    }
    if (Date.now() - this.touched > 180000) {
      this.session = crypto.randomUUID();
      this.sessionUsed = false;
    }
    this.touched = Date.now();
    const key = nextKey,
      cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 30000) {
      this.visibleIds = cached.reply.ids;
      this.emit({ phase: 'ready', ids: cached.reply.ids });
      return;
    }
    this.emit({ phase: 'loading', ids: this.visibleIds });
    this.pendingKey = key;
    this.timer = setTimeout(
      async () => {
        const abort = new AbortController();
        this.abort = abort;
        const before = performance.now();
        if (input.kind === 'autocomplete') this.sessionUsed = true;
        try {
          const reply = (await this.request(
            this.url,
            { ...input, query, operation: 'search', session: this.session },
            abort.signal,
          )) as Reply;
          if (sequence !== this.sequence || abort.signal.aborted) return;
          performance.measure('nagi:google-search-transport', {
            start: before,
            end: performance.now(),
          });
          this.pendingKey = undefined;
          this.visibleIds = reply.ids;
          this.cache.set(key, { at: Date.now(), reply });
          if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value!);
          this.emit({
            phase: 'ready',
            ids: reply.ids,
            timing: { ...reply.timing, requestMs: Math.round(performance.now() - before) },
          });
        } catch (error) {
          if (sequence === this.sequence && !abort.signal.aborted) {
            this.pendingKey = undefined;
            this.emit({
              phase: 'error',
              ids: this.visibleIds,
              error:
                error instanceof Error
                  ? error.message
                  : 'La recherche Google Maps est temporairement indisponible.',
            });
          }
        }
      },
      input.kind === 'text_search' ? 0 : googleSearchDelay,
    );
  }
  complete(placeId: string) {
    if (!this.sessionUsed) return;
    this.sessionUsed = false;
    const session = this.session;
    this.session = crypto.randomUUID();
    this.touched = 0;
    // IDs-only termination keeps narrow field masks. Google bills Autocomplete
    // per request for this termination type; do not promise session discounts.
    void this.request(this.url, { operation: 'selection', placeId, session }).catch(() => {});
  }
  cancel() {
    this.sequence++;
    this.pendingKey = undefined;
    clearTimeout(this.timer);
    this.abort?.abort();
  }
  dispose() {
    this.cancel();
    this.cache.clear();
  }
}
