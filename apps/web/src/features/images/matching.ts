import type { ImageContext, OpenImage } from './model';
import { distanceKm, normalizeName } from './metadata';

const articles = new Set([
  'a',
  'an',
  'the',
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
  'd',
  'l',
  'of',
  'at',
  'and',
  'et',
]);
const extras = new Set(['official', 'officiel', 'shop', 'store', 'boutique', 'ショップ']);
const descriptors = new Set([
  'national',
  'museum',
  'garden',
  'park',
  'temple',
  'shrine',
  'taisha',
  'jinja',
  'jingu',
  'shinto',
  'buddhist',
  'hotel',
  'restaurant',
  'cafe',
  'shopping',
  'mall',
]);
const vocabulary: Record<string, string> = {
  centre: 'center',
  centers: 'center',
  centres: 'center',
  musee: 'museum',
  musees: 'museum',
  jardin: 'garden',
  jardins: 'garden',
  gardens: 'garden',
  parc: 'park',
  parks: 'park',
  chateau: 'castle',
  gare: 'station',
  tour: 'tower',
  eglise: 'church',
};
export function nameWords(name: string) {
  return (
    name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => !articles.has(word) && !extras.has(word))
      .map((word) => vocabulary[word] ?? word) ?? []
  );
}
const sorted = (words: string[]) => [...new Set(words)].sort().join(' ');
/** A neighbouring station must not stand in for its namesake temple or shop. */
export function conflictsPlaceCategory(category: string | undefined, subject: string) {
  if (!category) return false;
  const normalize = (value: string) =>
    value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[_-]/g, ' ').toLowerCase();
  const expected = normalize(category),
    candidate = normalize(subject);
  const transport =
    /\b(station|gare|railway|railroad|airport|aeroport|subway|metro|bus stop)\b|鉄道|駅/;
  return !transport.test(expected) && transport.test(candidate);
}
function oneEdit(a: string, b: string) {
  if (
    a.length < 6 ||
    b.length < 6 ||
    !/^[a-z]+$/.test(a + b) ||
    a[0] !== b[0] ||
    Math.abs(a.length - b.length) > 1
  )
    return false;
  let first = 0,
    second = 0,
    edits = 0;
  while (first < a.length && second < b.length) {
    if (a[first] === b[second]) {
      first++;
      second++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length <= b.length) second++;
    if (a.length >= b.length) first++;
  }
  return edits + (a.length - first) + (b.length - second) <= 1;
}
export type NameMatch = { rank: 0 | 1 | 2 | 3; reason: string };
const none: NameMatch = { rank: 0, reason: 'name-unrelated' };
export function matchPlaceName(context: ImageContext, candidate: string): NameMatch {
  const location = new Set(
    [context.city, context.country, context.neighborhood]
      .filter((v): v is string => !!v)
      .flatMap(nameWords),
  );
  let best = none;
  for (const name of [context.name, ...context.aliases]) {
    if (normalizeName(name) === normalizeName(candidate)) return { rank: 3, reason: 'entity-name' };
    const full = nameWords(name),
      other = nameWords(candidate);
    if (!full.length || !other.length) continue;
    if (sorted(full) === sorted(other)) return { rank: 2, reason: 'name-words' };
    const identity = full.filter((word) => !location.has(word)),
      target = other.filter((word) => !location.has(word));
    // Location can accompany a venue name, but cannot be the only shared word.
    if (!identity.some((word) => normalizeName(word).length >= 3) || !target.length) continue;
    const short = identity.filter((word) => !descriptors.has(word)),
      shortTarget = target.filter((word) => !descriptors.has(word));
    if (
      short.some((word) => word.length >= 4) &&
      shortTarget.length &&
      sorted(short) === sorted(shortTarget)
    )
      best = { rank: 2, reason: 'name-descriptor' };
    if (sorted(identity) === sorted(target)) best = { rank: 2, reason: 'name-localized' };
    else if (identity.length === target.length) {
      const remaining = [...target];
      let approximate = 0;
      const complete = identity.every((word) => {
        let index = remaining.indexOf(word);
        if (index < 0) {
          index = remaining.findIndex((value) => oneEdit(word, value));
          approximate++;
        }
        if (index < 0) return false;
        remaining.splice(index, 1);
        return true;
      });
      if (complete && approximate === 1 && best.rank < 2)
        best = { rank: 2, reason: 'name-spelling' };
    }
    // An additional building name is acceptable only with very close geography.
    // Conflicting branch names and numbers are never discarded.
    if (
      best.rank < 1 &&
      identity.length > target.length &&
      target.length >= 2 &&
      target.every((word) => identity.includes(word)) &&
      identity.filter((word) => !target.includes(word)).every((word) => !/\d/.test(word))
    )
      best = { rank: 1, reason: 'name-expanded' };
  }
  return best;
}
export function searchNames(context: ImageContext) {
  const clean = context.name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = nameWords(clean);
  const location = new Set(
    [context.city, context.country].filter((value): value is string => !!value).flatMap(nameWords),
  );
  const local = words.filter((word) => !location.has(word));
  const variants = [
    context.name,
    ...context.aliases,
    clean,
    local.join(' '),
    local.filter((word) => !descriptors.has(word)).join(' '),
    words.join(' '),
    words.length > 1 ? [...words.slice(1), words[0]].join(' ') : '',
  ];
  const seen = new Set<string>();
  return variants
    .filter((value) => {
      const key = normalizeName(value);
      if (key.length < 3 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}
export function matchesPhoto(context: ImageContext, image: OpenImage) {
  if (conflictsPlaceCategory(context.category, image.title + ' ' + image.sourceId)) return false;
  const text = [image.title, image.sourceId, image.description ?? ''].join(' ');
  if (/shop|store|retail|mall|restaurant|cafe|hotel/i.test(context.category ?? '')) {
    const identified = [image.title, image.sourceId.replace(/\.(?:jpe?g|png|webp)$/i, '')].some(
      (name) => matchPlaceName(context, name).rank >= 2,
    );
    const establishment =
      /\b(shop|store|boutique|florist|fleuriste|storefront|commerce|restaurant|cafe|hotel|shopping|mall)\b/i.test(
        text,
      );
    if (!identified && !establishment) return false;
  }
  const words = new Set(nameWords(text)),
    compact = normalizeName(text);
  const location = new Set(
    [context.city, context.country, context.neighborhood]
      .filter((v): v is string => !!v)
      .flatMap(nameWords),
  );
  return [context.name, ...context.aliases].some((name) => {
    if (normalizeName(name).length >= 4 && compact.includes(normalizeName(name))) return true;
    const tokens = [...new Set(nameWords(name))];
    const identity = tokens.filter((word) => !location.has(word));
    return (
      identity.some(
        (word) =>
          word.length >= 4 || /[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]/u.test(word),
      ) &&
      tokens.every((word) => words.has(word) || [...words].some((other) => oneEdit(word, other)))
    );
  });
}
export function automaticCommonsPhoto(context: ImageContext, photos: OpenImage[]) {
  if (context.latitude === undefined || context.longitude === undefined) return null;
  const maxDistance = /shop|restaurant|cafe|hotel|mall/i.test(context.category ?? '') ? 0.4 : 1.2;
  return (
    photos
      .filter(
        (image) =>
          (image.sourceCoordinates || image.sourceLocations?.length) &&
          matchesPhoto(context, image),
      )
      .map((image) => ({
        image,
        distance: Math.min(
          ...(image.sourceLocations?.length
            ? image.sourceLocations
            : [image.sourceCoordinates!]
          ).map((point) =>
            distanceKm({ latitude: context.latitude!, longitude: context.longitude! }, point),
          ),
        ),
      }))
      .filter((item) => item.distance <= maxDistance)
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          b.image.width * b.image.height - a.image.width * a.image.height ||
          a.image.id.localeCompare(b.image.id),
      )[0]?.image ?? null
  );
}
