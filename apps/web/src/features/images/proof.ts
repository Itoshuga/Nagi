import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CatalogPlace } from '@nagi/shared';
import { imageContextSchema, type ImageContext } from './model';

function sign(body: string) {
  const key = process.env.NAGI_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('Image context signing is unavailable');
  return createHmac('sha256', Buffer.from(key, 'base64'))
    .update('nagi:image-context:v1:' + body)
    .digest('base64url');
}
export function issueImageProof(actor: string, trip: string, place: CatalogPlace) {
  const labels = place.locationLabel?.split(' · ') ?? [];
  const context = imageContextSchema.parse({
    name: place.title,
    category: place.categoryId ?? place.category,
    country: labels.at(-1),
    city: labels.length > 1 ? labels.at(-2) : undefined,
    neighborhood: labels.length > 2 ? labels.slice(0, -2).join(' · ') : undefined,
    latitude: place.coordinates?.latitude,
    longitude: place.coordinates?.longitude,
    language: /[\u3040-\u30ff\u3400-\u9fff]/u.test(place.title) ? 'ja' : 'fr',
  });
  const body = Buffer.from(
    JSON.stringify({ actor, trip, id: place.id, context, expires: Date.now() + 60 * 60 * 1000 }),
  ).toString('base64url');
  return body + '.' + sign(body);
}
export function readImageProof(
  proof: string | undefined,
  actor: string,
  trip: string,
  id: string,
): ImageContext | null {
  if (!proof || proof.length > 12000) return null;
  try {
    const [body, signature, extra] = proof.split('.');
    if (!body || !signature || extra) return null;
    const expected = Buffer.from(sign(body)),
      received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.actor === actor && data.trip === trip && data.id === id && data.expires > Date.now()
      ? imageContextSchema.parse(data.context)
      : null;
  } catch {
    return null;
  }
}
