import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { externalPlaceIdSchema, mapboxQuerySchema } from '@nagi/shared';
const schema = z
  .object({
    actor: z.uuid(),
    trip: z.uuid(),
    id: externalPlaceIdSchema,
    query: mapboxQuerySchema,
    kind: z.enum(['suggestion', 'resolved']),
    session: z.uuid().optional(),
    proximity: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).optional(),
    expires: z.number().int(),
  })
  .strict();
type Proof = z.infer<typeof schema>;
const sign = (body: string) => {
  const secret = process.env.NAGI_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('La signature des références Mapbox est indisponible.');
  return createHmac('sha256', Buffer.from(secret, 'base64'))
    .update('nagi:mapbox-reference:v1:' + body)
    .digest('base64url');
};
export function issueMapboxProof(data: Omit<Proof, 'expires'>) {
  const body = Buffer.from(
    JSON.stringify({
      ...data,
      expires: Date.now() + (data.kind === 'suggestion' ? 170000 : 10 * 60 * 1000),
    }),
  ).toString('base64url');
  return body + '.' + sign(body);
}
export function readMapboxProof(
  value: string | undefined,
  actor: string,
  trip: string,
  id: string,
  query: string,
  acceptExpired = false,
) {
  if (!value) return null;
  try {
    const [body, signature, extra] = value.split('.');
    if (!body || !signature || extra) return null;
    const expected = Buffer.from(sign(body)),
      received = Buffer.from(signature);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const data = schema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
    return data.actor === actor &&
      data.trip === trip &&
      data.id === id &&
      data.query === query &&
      (acceptExpired || data.expires > Date.now())
      ? data
      : null;
  } catch {
    return null;
  }
}
