import type { OpenImage } from './model';

// Metadata is displayed only as text. Never return provider HTML to React.
export function metadataText(value: unknown, max = 1000): string {
  if (typeof value !== 'string') return '';
  const entities: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
    copy: '©',
    ndash: '–',
    mdash: '—',
    eacute: 'é',
    ouml: 'ö',
    aacute: 'á',
  };
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, key: string) => {
      if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? whole;
      const n = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    })
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
export function httpsUrl(value: unknown, hosts?: readonly string[]) {
  if (typeof value !== 'string' || value.length > 4096) return;
  try {
    const url = new URL(value.startsWith('//') ? 'https:' + value : value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      (hosts && !hosts.includes(url.hostname))
    )
      return;
    // Metadata links are never fetched server-side, but must still be public links.
    if (
      /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|\[)/i.test(
        url.hostname,
      )
    )
      return;
    url.hash = '';
    return url.href;
  } catch {
    return;
  }
}
export const photoUrl = (value: unknown) =>
  httpsUrl(value, ['upload.wikimedia.org', 'thumb.wikimedia.org']);
export function openLicense(
  short: string,
  url: unknown,
  creator: string,
  restrictions = '',
): Pick<OpenImage, 'license' | 'licenseVersion' | 'licenseUrl'> | null {
  if (
    /\b(nc|nd|non.?commercial|no.?derivatives|fair.?use|all rights reserved|permission required)\b/i.test(
      short + ' ' + restrictions,
    )
  )
    return null;
  const raw = typeof url === 'string' ? url.replace(/^http:/, 'https:') : '';
  const safe = httpsUrl(raw, ['creativecommons.org']);
  if (!safe) return null;
  const path = new URL(safe).pathname;
  const by = path.match(
    /^\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)(?:\/(?:deed(?:\.[a-z-]+)?)?)?$/i,
  );
  const normalized = short.toLowerCase().replace(/[\s_]+/g, '-');
  if (by && creator && !/\b(unknown|anonymous|inconnu|inconnue|anonyme|n\/a)\b/i.test(creator)) {
    const expected = by[1] === 'by' ? /^(?:cc-)?by(?:-\d\.\d)?$/ : /^(?:cc-)?by-sa(?:-\d\.\d)?$/;
    if (!expected.test(normalized)) return null;
    const version = short.match(/\d\.\d/)?.[0];
    if (version && version !== by[2]) return null;
    return {
      license: by[1] === 'by' ? 'CC BY' : 'CC BY-SA',
      licenseVersion: by[2],
      licenseUrl: `https://creativecommons.org/licenses/${by[1]}/${by[2]}/`,
    };
  }
  if (
    /^\/publicdomain\/zero\/1\.0(?:\/(?:deed(?:\.[a-z-]+)?)?)?$/.test(path) &&
    /^(cc0|cc-zero|cc0-1\.0|cc-zero-1\.0)$/i.test(normalized)
  )
    return {
      license: 'CC0',
      licenseVersion: '1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    };
  if (
    /^\/publicdomain\/mark\/1\.0(?:\/(?:deed(?:\.[a-z-]+)?)?)?$/.test(path) &&
    /^(public-domain|public-domain-mark(?:-1\.0)?|pdm(?:-1\.0)?|pd)$/i.test(normalized)
  )
    return {
      license: 'Public domain',
      licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    };
  return null;
}
export const normalizeName = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\p{M}\p{P}\p{Z}\p{S}]/gu, '');
export const unsuitablePhoto = (title: string, description = '') =>
  /\b(logo|logotype|map|diagram|drawing|sketch|coat of arms|floor.?plan|illustration|postcard|engraving|18\d{2}|19[0-6]\d)\b|地図|ロゴ|紋章/i.test(
    title,
  ) ||
  /\b(historical photograph|historic photograph|archival photograph|photographie ancienne)\b/i.test(
    title + ' ' + description,
  );
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180,
    dLat = (b.latitude - a.latitude) * rad,
    dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
