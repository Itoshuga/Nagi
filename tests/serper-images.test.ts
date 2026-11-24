import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
const { canonicalImageUrl, serperCandidates, serperQueries, serperImagePage } =
  await import('../apps/web/src/features/images/serper');
const { imageContextSchema } = await import('../apps/web/src/features/images/model');
const { serperImagesConfig } = await import('../apps/web/src/features/images/config');
const context = imageContextSchema.parse({
  name: 'Kamakura (鎌倉市)',
  country: 'Japan',
  language: 'en',
});
beforeEach(() => {
  vi.stubEnv('SERPER_API_KEY', 'test-private-serper-key');
  vi.stubEnv('SERPER_IMAGES_ENABLED', 'true');
  vi.stubEnv('NAGI_IMAGE_RESOLVER_ENABLED', 'true');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Serper private discovery and stable resource identity', () => {
  it('requests ten images in a single first-page call with the server key', async () => {
    const request = vi.fn(async () => Response.json({ images: [], credits: 1 }));
    vi.stubGlobal('fetch', request);
    const result = await serperImagePage(serperQueries(context, 'city')[0]!, 1);
    expect(result.credits).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://google.serper.dev/images');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.headers).toMatchObject({ 'X-API-KEY': 'test-private-serper-key' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      page: 1,
      num: 10,
      gl: 'jp',
      hl: 'en',
    });
    expect(init.body).not.toContain('test-private-serper-key');
  });
  it('cannot restore expensive pagination through legacy environment values or a page-two call', async () => {
    vi.stubEnv('SERPER_IMAGES_PAGE_SIZE', '100');
    vi.stubEnv('SERPER_IMAGES_MAX_PAGES', '5');
    vi.stubEnv('SERPER_IMAGES_MAX_TOTAL_PAGES', '50');
    expect(serperImagesConfig()).toMatchObject({ pageSize: 10, maxPages: 1, maxTotalPages: 1 });
    vi.stubEnv('SERPER_IMAGES_PAGE_SIZE', '20');
    expect(serperImagesConfig().pageSize).toBe(10);
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(serperImagePage(serperQueries(context)[0]!, 2)).rejects.toMatchObject({
      code: 'configuration',
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('does not retry a rate-limited, exhausted or inaccessible key in a paid request loop', async () => {
    const request = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    );
    vi.stubGlobal('fetch', request);
    await expect(serperImagePage(serperQueries(context)[0]!, 1)).rejects.toMatchObject({
      code: 'rate_limit',
      retryAfter: 120,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retains ten candidates without licence filtering even if the provider unexpectedly sends a hundred', () => {
    const images = Array.from({ length: 100 }, (_, index) => ({
      title: 'Unrelated commercial result ' + index,
      imageUrl: 'https://site-' + index + '.example.org/image.jpg',
      thumbnailUrl: 'https://thumbs.example.org/' + index + '.jpg',
      source: 'Unknown travel shop',
      position: index + 1,
    }));
    const result = serperCandidates({ images }, 'gallery-key', context, 'city');
    expect(result).toHaveLength(10);
    expect(result[9]!.metadata).not.toHaveProperty('license');
    expect(result[0]!.metadata).not.toHaveProperty('imageWidth');
  });
  it('deduplicates only equivalent original URLs while preserving transformations and alternate source pages', () => {
    const result = serperCandidates(
      {
        images: [
          {
            imageUrl: 'https://example.org/photo.jpg?utm_source=a',
            link: 'https://a.example.org/page',
          },
          {
            imageUrl: 'https://example.org/photo.jpg?utm_source=b',
            link: 'https://b.example.org/page',
          },
          { imageUrl: 'https://example.org/photo.jpg?width=600' },
          { imageUrl: 'https://another.example.org/photo.jpg' },
        ],
      },
      'key',
      context,
    );
    expect(result).toHaveLength(3);
    expect(result[0]!.sources).toHaveLength(2);
    expect(canonicalImageUrl('https://example.org/a.jpg?sig=123&width=20')).toContain(
      'sig=123&width=20',
    );
    expect(
      serperCandidates(
        { images: [{ imageUrl: 'https://example.org/photo.jpg?utm_source=z' }] },
        'key',
        context,
      )[0]!.id,
    ).toBe(result[0]!.id);
    expect(
      serperCandidates(
        { images: [{ imageUrl: 'https://example.org/photo.jpg' }] },
        'another-place',
        context,
      )[0]!.id,
    ).not.toBe(result[0]!.id);
  });
  it.each([
    'file:///secret',
    'javascript:alert(1)',
    'https://127.0.0.1/a.jpg',
    'https://192.168.1.1/a.jpg',
    'https://user:secret@example.org/a.jpg',
    'https://[::1]/photo',
  ])('rejects a dangerous resource %s', (url) => {
    expect(serperCandidates({ images: [{ imageUrl: url }] }, 'key', context)).toHaveLength(0);
  });
  it('uses only real native names and avoids paying for equivalent query variants', () => {
    const queries = serperQueries({ ...context, aliases: ['Kamakura', '鎌倉市'] }, 'city');
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({ q: 'Kamakura Japan', gl: 'jp', hl: 'en' });
    expect(queries[1]).toMatchObject({ q: '鎌倉市 Japan', gl: 'jp', hl: 'ja' });
  });
  it('never reflects a provider credential through discovered metadata', () => {
    expect(
      serperCandidates(
        {
          images: [
            {
              imageUrl: 'https://example.org/photo.jpg',
              link: 'https://example.org/?key=test-private-serper-key',
            },
          ],
        },
        'key',
        context,
      ),
    ).toHaveLength(0);
  });
});
