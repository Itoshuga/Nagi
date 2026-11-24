import 'server-only';
import { createHash } from 'node:crypto';
import { ImageHttp, ImageProviderError } from './http';
import {
  distanceKm,
  httpsUrl,
  metadataText,
  normalizeName,
  openLicense,
  photoUrl,
  unsuitablePhoto,
} from './metadata';
import { emptyResolution, type ImageContext, type ImageResolution, type OpenImage } from './model';
import {
  automaticCommonsPhoto,
  matchesPhoto,
  matchPlaceName,
  searchNames,
  conflictsPlaceCategory,
} from './matching';

type Value = Record<string, unknown>;
export const object = (value: unknown): Value =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Value) : {};
const rows = (value: unknown): Value[] => (Array.isArray(value) ? value.map(object) : []);
const values = (value: unknown): Value[] => Object.values(object(value)).map(object);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const meta = (data: Value, key: string) => str(object(data[key]).value);
const claim = (entity: Value, property: string) =>
  rows(object(entity.claims)[property])
    .filter((v) => v.rank !== 'deprecated')
    .map((v) => object(object(v.mainsnak).datavalue).value);
const entityNames = (entity: Value) =>
  [
    ...values(entity.labels).map((v) => str(v.value)),
    ...Object.values(object(entity.aliases)).flatMap((v) => rows(v).map((a) => str(a.value))),
  ].filter(Boolean);
const photoId = (sourceId: string) => {
  const hex = createHash('sha256')
    .update('commons:' + sourceId.normalize('NFC'))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
export function commonsPhoto(
  page: Value,
  provider: OpenImage['provider'] = 'wikimedia',
): OpenImage | null {
  const info = rows(page.imageinfo)[0],
    title = str(page.title).replace(/^File:/, '');
  if (
    !info ||
    page.missing ||
    !/\.(jpe?g|png|webp)$/i.test(title) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(str(info.mime))
  )
    return null;
  const ext = object(info.extmetadata);
  const description = metadataText(meta(ext, 'ImageDescription'));
  if (
    unsuitablePhoto(title, description) ||
    (meta(ext, 'Copyrighted') === 'True' && /fair use/i.test(meta(ext, 'UsageTerms')))
  )
    return null;
  const creator = metadataText(meta(ext, 'Artist'), 500);
  const license = openLicense(
    metadataText(meta(ext, 'LicenseShortName')),
    meta(ext, 'LicenseUrl'),
    creator,
    metadataText(meta(ext, 'Restrictions') + ' ' + meta(ext, 'UsageTerms')),
  );
  const thumbs = values(info.thumburls)
    .filter((v) => photoUrl(v.url) && Number(v.width) > 0)
    .sort((a, b) => Number(a.width) - Number(b.width));
  const thumbnail = (width: number) => photoUrl(thumbs.find((v) => Number(v.width) >= width)?.url);
  const imageUrl = photoUrl(info.url),
    thumbnailUrl = thumbnail(330) ?? photoUrl(info.thumburl),
    sourceUrl = httpsUrl(info.descriptionurl, ['commons.wikimedia.org']);
  const width = Number(info.width),
    height = Number(info.height);
  if (
    !license ||
    !imageUrl ||
    !thumbnailUrl ||
    !sourceUrl ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 240 ||
    height < 160 ||
    width / height > 4 ||
    height / width > 3
  )
    return null;
  // Use only the official returned thumbnail; never synthesize a thumbnail URL.
  const previewUrl = thumbnail(960) ?? thumbnailUrl;
  const authorLink = meta(ext, 'Artist').match(/href=["']([^"']+)["']/i)?.[1];
  const creatorUrl = httpsUrl(authorLink);
  const cleanedTitle = metadataText(meta(ext, 'ObjectName') || title, 500);
  const required = metadataText(meta(ext, 'Attribution'), 1500);
  const sourceLocations = rows(page.coordinates).filter(
    (value) =>
      typeof value.lat === 'number' &&
      typeof value.lon === 'number' &&
      Math.abs(value.lat) <= 90 &&
      Math.abs(value.lon) <= 180 &&
      (!value.globe || value.globe === 'earth'),
  );
  const coordinate = sourceLocations[0];
  return {
    id: photoId(title),
    usageRights: 'open',
    provider,
    sourceId: title,
    sourceUrl,
    imageUrl,
    thumbnailUrl,
    smallThumbnailUrl: thumbnail(120) ?? thumbnailUrl,
    previewUrl,
    title: cleanedTitle,
    description: description || undefined,
    sourceCoordinates: coordinate
      ? { latitude: Number(coordinate.lat), longitude: Number(coordinate.lon) }
      : undefined,
    sourceLocations: sourceLocations.length
      ? sourceLocations.map((value) => ({
          latitude: Number(value.lat),
          longitude: Number(value.lon),
        }))
      : undefined,
    creator,
    ...(creatorUrl ? { creatorUrl } : {}),
    ...license,
    attribution: [
      cleanedTitle,
      creator,
      `${license.license}${license.licenseVersion ? ' ' + license.licenseVersion : ''}`,
      required,
    ]
      .filter(Boolean)
      .join(' · '),
    width,
    height,
    sha1: str(info.sha1) || undefined,
    verifiedAt: new Date().toISOString(),
  };
}
export async function commonsFiles(
  http: ImageHttp,
  filenames: string[],
  provider: OpenImage['provider'] = 'wikimedia',
) {
  if (!filenames.length) return [];
  const data = await http.json('commons', {
    action: 'query',
    prop: 'imageinfo|coordinates',
    colimit: 'max',
    coprimary: 'all',
    titles: filenames
      .slice(0, 5)
      .map((v) => 'File:' + v.replace(/^File:/, ''))
      .join('|'),
    iiprop: 'url|thumburls|size|mime|mediatype|extmetadata|sha1',
    iiurlwidth: '320',
    redirects: '1',
  });
  return rows(object(data.query).pages)
    .map((p) => commonsPhoto(p, provider))
    .filter((p): p is OpenImage => !!p);
}
export type EntityMatch = {
  entity: Value;
  id: string;
  confidence: 'high' | 'ambiguous';
  reasons: string[];
};
export function matchEntity(
  context: ImageContext,
  entity: Value,
  locations: Value[] = [],
): EntityMatch | null {
  const subjects = [...values(entity.labels), ...values(entity.descriptions)]
    .map((value) => str(value.value))
    .join(' ');
  if (conflictsPlaceCategory(context.category, subjects)) return null;
  const name = entityNames(entity)
    .map((value) => matchPlaceName(context, value))
    .sort((a, b) => b.rank - a.rank)[0];
  const exact = (name?.rank ?? 0) >= 2;
  const id = str(entity.id);
  if (!/^Q\d+$/.test(id) || (!name?.rank && id !== context.wikidataId)) return null;
  const kinds = claim(entity, 'P31').map((v) => str(object(v).id));
  if (
    kinds.some((v) => ['Q5', 'Q4167410', 'Q13406463', 'Q43229', 'Q4830453', 'Q431289'].includes(v))
  )
    return null;
  const coordinates = claim(entity, 'P625')
    .map(object)
    .find(
      (v) =>
        typeof v.latitude === 'number' &&
        typeof v.longitude === 'number' &&
        (!v.globe || v.globe === 'http://www.wikidata.org/entity/Q2'),
    );
  if (coordinates && context.latitude !== undefined && context.longitude !== undefined) {
    const distance = distanceKm(
      { latitude: context.latitude, longitude: context.longitude },
      { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) },
    );
    if (distance > 3) return null;
    const threshold =
      name?.rank === 1
        ? 0.15
        : /shop|restaurant|cafe|hotel|mall/i.test(context.category ?? '')
          ? 0.5
          : 1.5;
    return {
      entity,
      id,
      confidence: distance <= threshold ? 'high' : 'ambiguous',
      reasons: [
        name?.reason ?? 'entity-reference',
        distance <= threshold ? 'coordinates-near' : 'coordinates-approximate',
      ],
    };
  }
  const placeIds = [...claim(entity, 'P17'), ...claim(entity, 'P131')].map((v) =>
    str(object(v).id),
  );
  const placeNames: string[] = [];
  const seen = new Set<string>();
  for (let depth = 0; depth < 3; depth++) {
    const level = placeIds.splice(0);
    for (const id of level) {
      if (seen.has(id)) continue;
      seen.add(id);
      const location = locations.find((v) => v.id === id);
      if (!location) continue;
      placeNames.push(...entityNames(location).map(normalizeName));
      placeIds.push(
        ...[...claim(location, 'P131'), ...claim(location, 'P17')].map((v) => str(object(v).id)),
      );
    }
  }
  const country = !!context.country && placeNames.includes(normalizeName(context.country));
  const city = !!context.city && placeNames.includes(normalizeName(context.city));
  // Country alone cannot distinguish a branch, homonym or neighbourhood shop.
  return {
    entity,
    id,
    confidence: exact && country && city ? 'high' : 'ambiguous',
    reasons: [
      'entity-name',
      ...(country ? ['country-match'] : []),
      ...(city ? ['city-match'] : []),
      ...(!city ? ['location-unconfirmed'] : []),
    ],
  };
}
async function entities(
  http: ImageHttp,
  ids: string[],
  props = 'labels|aliases|descriptions|claims|sitelinks',
) {
  if (!ids.length) return [];
  const data = await http.json('wikidata', {
    action: 'wbgetentities',
    ids: [...new Set(ids)].slice(0, 14).join('|'),
    props,
    languages: 'fr|en|ja',
  });
  return values(data.entities);
}
async function entityMatches(http: ImageHttp, context: ImageContext, ids: string[]) {
  const candidates = await entities(http, ids);
  const locations: Value[] = [];
  if (context.latitude === undefined) {
    const idsFor = (list: Value[], key: string) => [
      ...new Set(
        list
          .flatMap((v) => claim(v, key))
          .map((v) => str(object(v).id))
          .filter((v) => /^Q\d+$/.test(v)),
      ),
    ];
    locations.push(...(await entities(http, idsFor(candidates, 'P17'), 'labels|aliases')));
    let parents = idsFor(candidates, 'P131');
    for (let depth = 0; depth < 3 && parents.length; depth++) {
      const level = await entities(http, parents, 'labels|aliases|claims');
      locations.push(...level);
      if (
        context.city &&
        level.some((v) =>
          entityNames(v).some((name) => normalizeName(name) === normalizeName(context.city!)),
        )
      )
        break;
      parents = idsFor(level, 'P131').filter((id) => !locations.some((v) => v.id === id));
    }
    const missingCountries = idsFor(locations, 'P17').filter(
      (id) => !locations.some((value) => value.id === id),
    );
    locations.push(...(await entities(http, missingCountries, 'labels|aliases')));
  }
  return candidates
    .map((v) => matchEntity(context, v, locations))
    .filter((v): v is EntityMatch => !!v);
}
async function wikidata(http: ImageHttp, context: ImageContext) {
  if (context.wikidataId) return entityMatches(http, context, [context.wikidataId]);
  const search = async (name: string, language: string) => {
    const data = await http.json('wikidata', {
      action: 'wbsearchentities',
      search: name,
      language,
      uselang: context.language,
      limit: '5',
      type: 'item',
    });
    return rows(data.search)
      .map((value) => str(value.id))
      .filter((id) => /^Q\d+$/.test(id));
  };
  const first = await search(context.name, context.language);
  const matches = await entityMatches(http, context, first);
  if (matches.some((value) => value.confidence === 'high')) return matches;
  const alternate = searchNames(context)[1] ?? context.name;
  const ids = (await search(alternate, context.language === 'en' ? 'fr' : 'en')).filter(
    (id) => !first.includes(id),
  );
  return [...matches, ...(await entityMatches(http, context, ids))];
}
async function wikipedia(http: ImageHttp, match: EntityMatch, language: ImageContext['language']) {
  const sites = object(match.entity.sitelinks);
  const lang = [language, 'en', 'ja', 'fr'].find((v) => object(sites[v + 'wiki']).title);
  if (!lang) return [];
  const title = str(object(sites[lang + 'wiki']).title);
  const response = await http.json((lang + 'wiki') as 'frwiki' | 'jawiki' | 'enwiki', {
    action: 'query',
    prop: 'pageimages|pageprops',
    titles: title,
    piprop: 'name|original',
    pilicense: 'free',
    redirects: '1',
  });
  const page = rows(object(response.query).pages)[0];
  // Recheck the page association, then resolve the file in Commons: a local
  // Wikipedia fair-use file with the same name is never imported as an image.
  if (
    !page ||
    object(page.pageprops).wikibase_item !== match.id ||
    !photoUrl(object(page.original).source)
  )
    return [];
  return commonsFiles(http, [str(page.pageimage)], 'wikipedia');
}
async function commonsSearch(http: ImageHttp, context: ImageContext, search?: string) {
  const queries = search
    ? [search]
    : searchNames(context)
        .slice(0, 2)
        .map((name) => [name, context.city].filter(Boolean).join(' '));
  const result: OpenImage[] = [];
  for (const query of queries) {
    try {
      const data = await http.json('commons', {
        action: 'query',
        generator: 'search',
        gsrsearch: query.slice(0, 500) + ' filetype:bitmap',
        gsrnamespace: '6',
        gsrlimit: '5',
        prop: 'imageinfo|coordinates',
        colimit: 'max',
        coprimary: 'all',
        iiprop: 'url|thumburls|size|mime|extmetadata|sha1',
        iiurlwidth: '320',
      });
      result.push(
        ...rows(object(data.query).pages)
          .map((p) => commonsPhoto(p))
          .filter((p): p is OpenImage => !!p)
          .filter((image) => matchesPhoto(search ? { ...context, name: search } : context, image)),
      );
      if (result.length >= 3 || automaticCommonsPhoto(context, result)) break;
    } catch (error) {
      if (result.length) break;
      throw error;
    }
  }
  return result;
}
async function nearbyPhotos(http: ImageHttp, context: ImageContext) {
  if (context.latitude === undefined || context.longitude === undefined) return [];
  const data = await http.json('commons', {
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${context.latitude}|${context.longitude}`,
    ggsradius: '1000',
    ggsnamespace: '6',
    ggslimit: '6',
    ggsprimary: 'all',
    prop: 'imageinfo|coordinates',
    coprimary: 'all',
    colimit: 'max',
    iiprop: 'url|thumburls|size|mime|extmetadata|sha1',
    iiurlwidth: '320',
  });
  return rows(object(data.query).pages)
    .map((page) => commonsPhoto(page))
    .filter((image): image is OpenImage => !!image)
    .filter((image) => matchesPhoto(context, image));
}
let openverseToken: { value: string; until: number } | undefined;
let tokenTask: Promise<string | undefined> | undefined;
async function token(http: ImageHttp) {
  const client = process.env.NAGI_OPENVERSE_CLIENT_ID,
    secret = process.env.NAGI_OPENVERSE_CLIENT_SECRET;
  if (!client || !secret) return;
  if (openverseToken && openverseToken.until > Date.now()) return openverseToken.value;
  tokenTask ??= http
    .json(
      'openverseToken',
      {},
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: client,
        client_secret: secret,
      }),
    )
    .then((result) => {
      if (!result.access_token || typeof result.access_token !== 'string') return;
      openverseToken = {
        value: result.access_token,
        until: Date.now() + Math.min(Number(result.expires_in) || 300, 86400) * 1000 - 30000,
      };
      return openverseToken.value;
    })
    .finally(() => {
      tokenTask = undefined;
    });
  return tokenTask;
}
async function openverse(http: ImageHttp, context: ImageContext, search?: string) {
  const auth = await token(http);
  const data = await http.json(
    'openverse',
    {
      q: search ?? [context.name, context.city].filter(Boolean).join(' '),
      page_size: '5',
      license: 'by,by-sa,cc0,pdm',
      mature: 'false',
      category: 'photograph',
    },
    undefined,
    auth,
  );
  const files: string[] = [];
  for (const row of rows(data.results)) {
    if (
      row.mature ||
      !openLicense(
        str(row.license) + (row.license_version ? ' ' + row.license_version : ''),
        row.license_url,
        metadataText(row.creator),
      )
    )
      continue;
    const source = httpsUrl(row.foreign_landing_url, ['commons.wikimedia.org']);
    if (!source) continue;
    const url = new URL(source);
    const title = url.pathname.startsWith('/wiki/File:')
      ? decodeURIComponent(url.pathname.slice('/wiki/File:'.length))
      : url.searchParams.get('title')?.replace(/^File:/, '');
    if (title && !title.includes('|')) files.push(title);
  }
  // Other origins remain excluded until a trustworthy source licence verifier
  // is provided. An Openverse declaration alone does not permit automatic use.
  return (await commonsFiles(http, files, 'openverse')).filter((photo) =>
    matchesPhoto(search ? { ...context, name: search } : context, photo),
  );
}
function dedupe(images: OpenImage[], selected?: OpenImage) {
  const keys = new Set<string>();
  const result = images
    .filter((image) => {
      const key = image.sha1 || image.imageUrl;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    })
    .sort((a, b) => b.width * b.height - a.width * a.height || a.id.localeCompare(b.id))
    .slice(0, 6);
  return selected
    ? [
        selected,
        ...result.filter(
          (image) => image.id !== selected.id && (!selected.sha1 || image.sha1 !== selected.sha1),
        ),
      ].slice(0, 6)
    : result;
}
export async function resolveImages(
  context: ImageContext,
  options: { http?: ImageHttp; search?: string; openverse?: () => Promise<boolean> } = {},
): Promise<ImageResolution<OpenImage>> {
  const http = options.http ?? new ImageHttp();
  const result: ImageResolution<OpenImage> = {
    ...emptyResolution,
    selected: null,
    candidates: [],
    reasons: [],
  };
  if (!options.search && !context.wikidataId && normalizeName(context.name).length < 3)
    return { ...result, reasons: ['insufficient-name'] };
  let providerFailure: unknown;
  const attempt = async <T>(task: () => Promise<T[]>) => {
    try {
      return await task();
    } catch (error) {
      providerFailure ??= error;
      return [];
    }
  };
  if (!options.search) {
    const matches = await attempt(() => wikidata(http, context));
    const high = matches.filter((m) => m.confidence === 'high');
    for (const match of (high.length ? high : matches).slice(0, 2)) {
      const direct = await attempt(() =>
        commonsFiles(
          http,
          claim(match.entity, 'P18').filter((v): v is string => typeof v === 'string'),
        ),
      );
      const images = direct.length
        ? direct
        : await attempt(() => wikipedia(http, match, context.language));
      result.candidates.push(...images);
      if (high.length === 1 && match.confidence === 'high' && images.length)
        return {
          selected: dedupe(images)[0]!,
          candidates: dedupe(images),
          confidence: 'high',
          reasons: [...match.reasons, 'entity-photo', 'license-verified'],
          entity: match.id,
          status: 'ready',
        };
    }
  }
  result.candidates.push(...(await attempt(() => commonsSearch(http, context, options.search))));
  let automatic = options.search ? null : automaticCommonsPhoto(context, result.candidates);
  if (!options.search && !automatic) {
    result.candidates.push(...(await attempt(() => nearbyPhotos(http, context))));
    automatic = automaticCommonsPhoto(context, result.candidates);
  }
  if (automatic)
    return {
      ...result,
      selected: automatic,
      candidates: dedupe(result.candidates, automatic),
      confidence: 'high',
      reasons: ['photo-name', 'photo-coordinates-near', 'license-verified'],
    };
  if (!options.openverse || (await options.openverse()))
    result.candidates.push(...(await attempt(() => openverse(http, context, options.search))));
  const externalAutomatic = options.search
    ? null
    : automaticCommonsPhoto(context, result.candidates);
  if (externalAutomatic)
    return {
      ...result,
      selected: externalAutomatic,
      candidates: dedupe(result.candidates, externalAutomatic),
      confidence: 'high',
      reasons: ['photo-name', 'photo-coordinates-near', 'license-verified'],
    };
  if (!result.candidates.length && providerFailure)
    throw providerFailure instanceof ImageProviderError
      ? providerFailure
      : new ImageProviderError('network');
  result.candidates = dedupe(result.candidates);
  result.confidence = result.candidates.length ? 'ambiguous' : 'none';
  result.reasons = result.candidates.length
    ? ['manual-confirmation', 'license-verified']
    : ['no-reliable-photo'];
  return result;
}
