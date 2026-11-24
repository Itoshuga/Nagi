import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
const { commonsPhoto, matchEntity, resolveImages } =
  await import('../apps/web/src/features/images/providers');
const { ImageHttp, retrySeconds } = await import('../apps/web/src/features/images/http');
const { metadataText, openLicense, httpsUrl } =
  await import('../apps/web/src/features/images/metadata');
const { imageContextSchema } = await import('../apps/web/src/features/images/model');
const { issueImageProof, readImageProof } = await import('../apps/web/src/features/images/proof');
const ctx = imageContextSchema.parse({
  name: 'Sensō-ji',
  city: 'Tokyo',
  country: 'Japan',
  latitude: 35.7148,
  longitude: 139.7967,
});
const snak = (value: unknown) => ({ mainsnak: { datavalue: { value } }, rank: 'normal' });
const entity = {
  id: 'Q175141',
  labels: { en: { value: 'Sensō-ji' }, ja: { value: '浅草寺' } },
  claims: {
    P625: [snak({ latitude: 35.7148, longitude: 139.7967 })],
    P18: [snak('Sensoji Tokyo 2025.jpg')],
  },
};
const file = (
  title = 'File:Sensoji Tokyo 2025.jpg',
  license = 'CC BY-SA 4.0',
  licenseUrl = 'https://creativecommons.org/licenses/by-sa/4.0/',
) => ({
  title,
  imageinfo: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Sensoji.jpg',
      thumburl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sensoji.jpg/320px-Sensoji.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sensoji.jpg',
      width: 2400,
      height: 1600,
      mime: 'image/jpeg',
      sha1: 'unique-photo-hash',
      extmetadata: {
        Artist: {
          value:
            '<a href="https://commons.wikimedia.org/wiki/User:Photographer">Élodie &amp; Co.</a>',
        },
        LicenseShortName: { value: license },
        LicenseUrl: { value: licenseUrl },
        ObjectName: { value: 'Sensō-ji Tokyo' },
      },
    },
  ],
});
beforeEach(() => {
  vi.stubEnv('NAGI_IMAGE_USER_AGENT', 'NagiImageResolverTest/1.0 (https://example.org/contact)');
  vi.stubEnv('NAGI_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 4).toString('base64'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('open photographic metadata', () => {
  it('supports current Wikimedia thumbnail domains and official multiple sizes without constructing URLs', () => {
    const page = file();
    const info = {
      ...page.imageinfo[0],
      thumburls: {
        '120': { url: 'https://thumb.wikimedia.org/example/120px-photo.jpg', width: 120 },
        '960': { url: 'https://thumb.wikimedia.org/example/960px-photo.jpg', width: 960 },
      },
    };
    const photo = commonsPhoto({ ...page, imageinfo: [info] });
    expect(photo?.smallThumbnailUrl).toBe('https://thumb.wikimedia.org/example/120px-photo.jpg');
    expect(photo?.previewUrl).toBe('https://thumb.wikimedia.org/example/960px-photo.jpg');
    expect(
      openLicense('CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'Artist')
        ?.license,
    ).toBe('CC BY-SA');
  });
  it('decodes entities without returning executable metadata HTML', () => {
    expect(metadataText('<script>bad()</script><b>Élodie &amp; Co. &#x65E5;&#26412;</b>')).toBe(
      'Élodie & Co. 日本',
    );
    expect(metadataText('&#x110000;')).toBe('');
  });
  it.each(['CC BY-NC 4.0', 'CC BY-ND 4.0', 'Unknown', 'Copyright'])(
    'rejects incompatible or unverified licence %s',
    (short) => {
      expect(
        openLicense(short, 'https://creativecommons.org/licenses/by/4.0/', 'Artist'),
      ).toBeNull();
    },
  );
  it('requires the author and rejects contradictory licence and version metadata', () => {
    expect(openLicense('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', '')).toBeNull();
    expect(
      openLicense('CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/4.0/', 'Alice'),
    ).toBeNull();
    expect(
      openLicense('CC BY 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', 'Alice'),
    ).toBeNull();
    expect(
      openLicense(
        'CC BY 4.0',
        'https://creativecommons.org/licenses/by/4.0/',
        'Alice',
        'Permission required',
      ),
    ).toBeNull();
  });
  it('distinguishes CC0 from a verified public domain declaration', () => {
    expect(
      openLicense('CC0', 'https://creativecommons.org/publicdomain/zero/1.0/', '')?.license,
    ).toBe('CC0');
    expect(
      openLicense('Public domain', 'https://creativecommons.org/publicdomain/mark/1.0/', '')
        ?.license,
    ).toBe('Public domain');
    expect(openLicense('Public domain', '', '')).toBeNull();
  });
  it('accepts a raster photo with full attribution; deduplicates its provider-independent ID', () => {
    const photo = commonsPhoto(file())!;
    expect(photo.creator).toBe('Élodie & Co.');
    expect(photo.license).toBe('CC BY-SA');
    expect(photo.creatorUrl).toContain('User:Photographer');
    expect(commonsPhoto(file(), 'openverse')?.id).toBe(photo.id);
    expect(photo.attribution).not.toContain('<');
  });
  it.each(['File:Tokyo logo.jpg', 'File:Tokyo map.jpg', 'File:Temple 1900.jpg', 'File:Temple.svg'])(
    'rejects unsuitable content %s',
    (name) => expect(commonsPhoto(file(name))).toBeNull(),
  );
  it.each([
    'file:///C:/secret.jpg',
    'http://upload.wikimedia.org/a.jpg',
    'https://upload.wikimedia.org.attacker.test/a.jpg',
    'https://user:pass@upload.wikimedia.org/a.jpg',
    'https://127.0.0.1/a.jpg',
  ])('rejects unsafe photo/source URLs %s', (url) => {
    const bad = file();
    bad.imageinfo[0]!.url = url;
    expect(commonsPhoto(bad)).toBeNull();
  });
  it('does not accept private address metadata links', () =>
    expect(httpsUrl('https://172.16.0.1/')).toBeUndefined());
});
describe('conservative deterministic matching', () => {
  it('uses an explicit administrative hierarchy without borrowing another candidate’s location', () => {
    const parent = {
      id: 'Q111',
      labels: { en: { value: 'Taitō' } },
      claims: { P131: [snak({ id: 'Q222' })] },
    };
    const city = { id: 'Q222', labels: { en: { value: 'Tokyo' } } };
    const country = { id: 'Q17', labels: { en: { value: 'Japan' } } };
    const local = {
      ...entity,
      claims: { P17: [snak({ id: 'Q17' })], P131: [snak({ id: 'Q111' })] },
    };
    expect(
      matchEntity({ ...ctx, latitude: undefined, longitude: undefined }, local, [
        parent,
        city,
        country,
      ])?.confidence,
    ).toBe('high');
    expect(
      matchEntity({ ...ctx, latitude: undefined, longitude: undefined }, local, [city, country])
        ?.confidence,
    ).toBe('ambiguous');
  });
  it('requires exact label or alias and verified geography', () =>
    expect(matchEntity(ctx, entity)?.confidence).toBe('high'));
  it('accepts a reordered venue name once its location is confirmed', () => {
    const place = { ...entity, labels: { en: { value: 'PARCO Shibuya' } } };
    expect(matchEntity({ ...ctx, name: 'Shibuya PARCO' }, place)?.confidence).toBe('high');
  });
  it('accepts a current photo whose description mentions the construction year', () => {
    const page = file('File:Tokyo Tower 2025.jpg');
    const data = {
      ...page,
      imageinfo: [
        {
          ...page.imageinfo[0],
          extmetadata: {
            ...page.imageinfo[0]!.extmetadata,
            ImageDescription: {
              value: 'Tokyo Tower was constructed in 1958. A logo is visible on the building.',
            },
          },
        },
      ],
    };
    expect(commonsPhoto(data)).not.toBeNull();
  });
  it('automatically selects a named Commons photo with matching source coordinates', async () => {
    const page = {
      ...file(),
      coordinates: [{ lat: ctx.latitude, lon: ctx.longitude, globe: 'earth', primary: true }],
    };
    const http = {
      json: vi.fn(async (endpoint: string) =>
        endpoint === 'wikidata' ? { search: [] } : { query: { pages: [page] } },
      ),
    };
    const result = await resolveImages(ctx, {
      http: http as unknown as InstanceType<typeof ImageHttp>,
    });
    expect(result.confidence).toBe('high');
    expect(result.selected?.sourceCoordinates).toEqual({
      latitude: ctx.latitude,
      longitude: ctx.longitude,
    });
    expect(result.reasons).toContain('photo-coordinates-near');
  });
  it('can find a named nearby photo when text search does not find it', async () => {
    const page = {
      ...file(),
      coordinates: [{ lat: ctx.latitude, lon: ctx.longitude, globe: 'earth' }],
    };
    const http = {
      json: vi.fn(async (_endpoint: string, params: Record<string, string>) =>
        params.action === 'wbsearchentities'
          ? { search: [] }
          : { query: { pages: params.generator === 'geosearch' ? [page] : [] } },
      ),
    };
    const result = await resolveImages(ctx, {
      http: http as unknown as InstanceType<typeof ImageHttp>,
    });
    expect(result.selected).not.toBeNull();
    expect(
      http.json.mock.calls.some(
        ([, params]) => params.generator === 'geosearch' && params.ggsnamespace === '6',
      ),
    ).toBe(true);
  });
  it('rejects a namesake on another continent', () =>
    expect(matchEntity({ ...ctx, latitude: 48.85, longitude: 2.35 }, entity)).toBeNull());
  it('rejects a neighbouring railway station whose alias equals the requested shrine', () => {
    expect(
      matchEntity(
        { ...ctx, name: 'Fushimi Inari', category: 'shrine' },
        {
          ...entity,
          labels: { en: { value: 'Fushimi Inari' } },
          descriptions: { en: { value: 'railway station in Kyoto, Japan' } },
        },
      ),
    ).toBeNull();
    expect(
      matchEntity(
        { ...ctx, name: 'Fushimi Inari', category: 'shrine' },
        {
          ...entity,
          labels: { en: { value: 'Fushimi Inari Taisha' } },
        },
      )?.confidence,
    ).toBe('high');
  });
  it('leaves location-free matches ambiguous', () =>
    expect(
      matchEntity({ ...ctx, latitude: undefined, longitude: undefined }, entity)?.confidence,
    ).toBe('ambiguous'));
  it('does not replace a small shop with its city or parent mall', () => {
    expect(
      matchEntity(
        { ...ctx, name: 'Pokémon Center SHIBUYA', category: 'shop' },
        { ...entity, labels: { en: { value: 'Shibuya Parco' } } },
      ),
    ).toBeNull();
    expect(matchEntity({ ...ctx, name: 'Unknown new shop 123' }, entity)).toBeNull();
  });
  it('does not match a company to an individual branch', () =>
    expect(
      matchEntity(ctx, {
        ...entity,
        claims: { ...entity.claims, P31: [snak({ id: 'Q4830453' })] },
      }),
    ).toBeNull());
  it('stops after a high-confidence, licensed entity image', async () => {
    const http = {
      json: vi
        .fn()
        .mockResolvedValue({ search: [], query: { pages: [] } })
        .mockResolvedValueOnce({ search: [{ id: entity.id }] })
        .mockResolvedValueOnce({ entities: { [entity.id]: entity } })
        .mockResolvedValueOnce({ query: { pages: [file()] } }),
    };
    const result = await resolveImages(ctx, {
      http: http as unknown as InstanceType<typeof ImageHttp>,
    });
    expect(result.confidence).toBe('high');
    expect(result.selected?.license).toBe('CC BY-SA');
    expect(http.json).toHaveBeenCalledTimes(3);
    expect(http.json.mock.calls.map((c) => c[0])).toEqual(['wikidata', 'wikidata', 'commons']);
  });
  it('revalidates Wikipedia PageImages through Commons, rejecting local fair-use images', async () => {
    const noPhoto = {
      ...entity,
      claims: { P625: entity.claims.P625 },
      sitelinks: { enwiki: { title: 'Sensō-ji' } },
    };
    const http = {
      json: vi
        .fn()
        .mockResolvedValue({ search: [], query: { pages: [] } })
        .mockResolvedValueOnce({ search: [{ id: entity.id }] })
        .mockResolvedValueOnce({ entities: { [entity.id]: noPhoto } })
        .mockResolvedValueOnce({
          query: {
            pages: [
              {
                pageimage: 'Local-fair-use.jpg',
                pageprops: { wikibase_item: entity.id },
                original: { source: 'https://en.wikipedia.org/local-image.jpg' },
              },
            ],
          },
        })
        .mockResolvedValueOnce({ query: { pages: [] } }),
    };
    const result = await resolveImages(ctx, {
      http: http as unknown as InstanceType<typeof ImageHttp>,
      openverse: async () => false,
    });
    expect(result.selected).toBeNull();
    expect(result.confidence).toBe('none');
  });
  it('keeps Commons photos without geographic evidence as manual suggestions', async () => {
    const http = {
      json: vi
        .fn()
        .mockResolvedValue({ search: [], query: { pages: [] } })
        .mockResolvedValueOnce({ search: [] })
        .mockResolvedValueOnce({ search: [] })
        .mockResolvedValueOnce({ query: { pages: [file()] } }),
    };
    const result = await resolveImages(ctx, {
      http: http as unknown as InstanceType<typeof ImageHttp>,
    });
    expect(result.selected).toBeNull();
    expect(result.confidence).toBe('ambiguous');
    expect(result.candidates).toHaveLength(1);
  });
  it('discards unrelated Commons suggestions rather than using a generic city image', async () => {
    const http = {
      json: vi
        .fn()
        .mockResolvedValue({ search: [], query: { pages: [] } })
        .mockResolvedValueOnce({ search: [] })
        .mockResolvedValueOnce({ search: [] })
        .mockResolvedValueOnce({ query: { pages: [file('File:Generic Tokyo street.jpg')] } }),
    };
    const result = await resolveImages(
      { ...ctx, name: 'Unknown tiny shop' },
      { http: http as unknown as InstanceType<typeof ImageHttp>, openverse: async () => false },
    );
    expect(result.candidates).toEqual([]);
    expect(result.selected).toBeNull();
  });
});
describe('provider safety and proof isolation', () => {
  it('binds temporary Mapbox context to actor, trip and source ID', () => {
    const proof = issueImageProof('actor', 'trip', {
      source: 'mapbox',
      id: 'mapbox-id',
      title: 'Sensō-ji',
      coordinates: { latitude: ctx.latitude!, longitude: ctx.longitude! },
    });
    expect(readImageProof(proof, 'actor', 'trip', 'mapbox-id')?.name).toBe('Sensō-ji');
    expect(readImageProof(proof, 'other', 'trip', 'mapbox-id')).toBeNull();
    expect(readImageProof(proof + 'x', 'actor', 'trip', 'mapbox-id')).toBeNull();
  });
  it('parses Retry-After seconds and HTTP dates', () => {
    expect(retrySeconds('120')).toBe(120);
    expect(retrySeconds(new Date(120000).toUTCString(), 0)).toBe(120);
  });
  it('limits external calls to two and only fixed API endpoints', async () => {
    let active = 0,
      max = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(new URL(String(url)).host).toBe('www.wikidata.org');
      expect(init?.redirect).toBe('error');
      active++;
      max = Math.max(active, max);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active--;
      return Response.json({ search: [] });
    });
    await Promise.all(
      Array.from({ length: 6 }, () =>
        new ImageHttp(undefined, fetcher as typeof fetch).json('wikidata', {
          action: 'wbsearchentities',
          search: 'name',
        }),
      ),
    );
    expect(max).toBe(2);
  });
  it('rejects a non-JSON or oversized provider response', async () => {
    await expect(
      new ImageHttp(
        undefined,
        vi.fn(async () => new Response('<html>bad</html>')) as typeof fetch,
      ).json('commons', {}),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(
      new ImageHttp(
        undefined,
        vi.fn(
          async () =>
            new Response('{}', {
              headers: { 'content-type': 'application/json', 'content-length': '3000000' },
            }),
        ) as typeof fetch,
      ).json('commons', {}),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
