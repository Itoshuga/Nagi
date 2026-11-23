import 'server-only';

export class ImageProviderError extends Error {
  constructor(
    public code: 'configuration' | 'rate_limit' | 'network' | 'invalid_response',
    public retryAfter = 60,
  ) {
    super(code);
  }
}
export type ImageEndpoint =
  'wikidata' | 'commons' | 'frwiki' | 'enwiki' | 'jawiki' | 'openverse' | 'openverseToken';
const endpoints: Record<ImageEndpoint, string> = {
  wikidata: 'https://www.wikidata.org/w/api.php',
  commons: 'https://commons.wikimedia.org/w/api.php',
  frwiki: 'https://fr.wikipedia.org/w/api.php',
  enwiki: 'https://en.wikipedia.org/w/api.php',
  jawiki: 'https://ja.wikipedia.org/w/api.php',
  openverse: 'https://api.openverse.org/v1/images/',
  openverseToken: 'https://api.openverse.org/v1/auth_tokens/token/',
};
let active = 0;
const queue: (() => void)[] = [];
const cooldown = new Map<string, number>();
async function slot(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason;
  if (active >= 2)
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        const index = queue.indexOf(ready);
        if (index >= 0) queue.splice(index, 1);
        reject(signal?.reason);
      };
      queue.push(ready);
      signal?.addEventListener('abort', abort, { once: true });
    });
  else active++;
  return () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };
}
export function imageUserAgent() {
  const configured = process.env.NAGI_IMAGE_USER_AGENT?.trim();
  if (
    configured &&
    configured.length <= 240 &&
    !/[\r\n]/.test(configured) &&
    /https?:\/\/|@/.test(configured)
  )
    return configured;
  const contact = process.env.NAGI_PRIVACY_CONTACT?.trim();
  if (contact && contact.length < 180 && !/[\r\n]/.test(contact) && /https?:\/\/|@/.test(contact))
    return `NagiImageResolver/1.0 (${contact})`;
  throw new ImageProviderError('configuration', 300);
}
export function retrySeconds(value: string | null, now = Date.now()) {
  if (!value) return 60;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 86400)) : 60;
}
// One process shares two provider slots. Database leases additionally bound work
// across app instances. No user-supplied URL, redirect, binary body or proxy.
export class ImageHttp {
  calls = 0;
  constructor(
    private signal?: AbortSignal,
    private fetcher: typeof fetch = fetch,
  ) {}
  async json<T = Record<string, unknown>>(
    endpoint: ImageEndpoint,
    params: Record<string, string>,
    form?: URLSearchParams,
    token?: string,
  ): Promise<T> {
    if (++this.calls > 16) throw new ImageProviderError('rate_limit');
    const base = endpoints[endpoint],
      host = new URL(base).host;
    if ((cooldown.get(host) ?? 0) > Date.now())
      throw new ImageProviderError(
        'rate_limit',
        Math.ceil((cooldown.get(host)! - Date.now()) / 1000),
      );
    const ua = imageUserAgent();
    const url = new URL(base);
    const mediawiki = !endpoint.startsWith('openverse');
    for (const [key, value] of Object.entries(
      mediawiki ? { format: 'json', formatversion: '2', maxlag: '5', ...params } : params,
    ))
      url.searchParams.set(key, value);
    const release = await slot(this.signal);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const signal = AbortSignal.any([
          AbortSignal.timeout(6500),
          ...(this.signal ? [this.signal] : []),
        ]);
        const response = await this.fetcher(url, {
          method: form ? 'POST' : 'GET',
          body: form,
          redirect: 'error',
          cache: 'no-store',
          signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': ua,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }).catch(() => {
          throw new ImageProviderError('network');
        });
        if (response.status === 429 || response.status === 503) {
          const retry = retrySeconds(response.headers.get('Retry-After'));
          await response.body?.cancel();
          cooldown.set(host, Date.now() + retry * 1000);
          if (!attempt && retry <= 1) {
            await new Promise((resolve) => setTimeout(resolve, 1100));
            continue;
          }
          throw new ImageProviderError('rate_limit', retry);
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new ImageProviderError('network');
        }
        if (
          !/application\/(?:[^;]+\+)?json/i.test(response.headers.get('content-type') ?? '') ||
          Number(response.headers.get('content-length') ?? 0) > 2_000_000
        ) {
          await response.body?.cancel();
          throw new ImageProviderError('invalid_response');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new ImageProviderError('invalid_response');
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new ImageProviderError('invalid_response');
          }
          chunks.push(part.value);
        }
        let data;
        try {
          data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new ImageProviderError('invalid_response');
        }
        if (data.error) {
          if (['maxlag', 'ratelimited'].includes(data.error.code)) {
            cooldown.set(host, Date.now() + 60000);
            throw new ImageProviderError('rate_limit');
          }
          throw new ImageProviderError('invalid_response');
        }
        return data as T;
      }
      throw new ImageProviderError('network');
    } finally {
      release();
    }
  }
}
