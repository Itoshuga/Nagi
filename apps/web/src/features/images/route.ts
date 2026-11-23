import 'server-only';
import { imageRequestSchema } from './model';
import { readImages, reportBrokenImage, selectImage } from './server';
import { tripRequestFailure } from '@/features/trips/sync-server';

export const imageHeaders = { 'Cache-Control': 'private, no-store' };
export async function imageRoute(
  request: Request,
  scope: () => Promise<Parameters<typeof readImages>[0]>,
) {
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return new Response(null, { status: 403, headers: imageHeaders });
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 32768)
      return new Response(null, { status: 413, headers: imageHeaders });
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers: imageHeaders });
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        return new Response(null, { status: 413, headers: imageHeaders });
      }
      chunks.push(part.value);
    }
    let json;
    try {
      json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return new Response(null, { status: 400, headers: imageHeaders });
    }
    const input = imageRequestSchema.safeParse(json);
    if (!input.success) return new Response(null, { status: 400, headers: imageHeaders });
    const ctx = await scope(),
      data = input.data;
    if (data.operation === 'broken') {
      await reportBrokenImage(ctx, data.reference, data.image);
      return Response.json({ ok: true }, { headers: imageHeaders });
    }
    const start = performance.now();
    const result =
      data.operation === 'select'
        ? await selectImage(ctx, data.reference, data.mode, data.image, data.revision)
        : await readImages(
            ctx,
            data.reference,
            data.operation === 'resolve',
            data.operation === 'resolve' ? data.search : undefined,
            data.operation === 'resolve' && data.browse,
          );
    return Response.json(result, {
      headers: {
        ...imageHeaders,
        'Server-Timing': `images;dur=${Math.round(performance.now() - start)}`,
      },
    });
  } catch (error) {
    const failure = tripRequestFailure(error);
    return Response.json(
      {
        error:
          failure.status === 503
            ? 'Les photographies sont momentanément indisponibles.'
            : failure.body.error,
      },
      { status: failure.status, headers: imageHeaders },
    );
  }
}
