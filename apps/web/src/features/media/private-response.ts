import 'server-only';
import sharp from 'sharp';
import { privateImageWidths } from './private-loader';

const maxBytes = 32 * 1024 * 1024;
const lifetime = 10 * 60 * 1000;
const images = new Map<string, { bytes: Buffer; expires: number }>();
const pending = new Map<string, Promise<Buffer | null>>();
let usedBytes = 0;

async function cachedImage(key: string, load: () => Promise<Buffer | null>) {
  const existing = images.get(key);
  if (existing) {
    images.delete(key);
    if (existing.expires > Date.now()) {
      images.set(key, existing);
      return existing.bytes;
    }
    usedBytes -= existing.bytes.length;
  }
  const running = pending.get(key);
  if (running) return running;
  const task = load().then((bytes) => {
    if (!bytes || bytes.length > maxBytes) return bytes;
    while (usedBytes + bytes.length > maxBytes) {
      const oldest = images.entries().next().value;
      if (!oldest) break;
      images.delete(oldest[0]);
      usedBytes -= oldest[1].bytes.length;
    }
    images.set(key, { bytes, expires: Date.now() + lifetime });
    usedBytes += bytes.length;
    return bytes;
  });
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}

/** Call only after authorizing this request and checking the current image version. */
export async function privateImageResponse(
  request: Request,
  key: string,
  download: () => Promise<{ data: Blob | null; error: unknown }>,
) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const requested = new URL(request.url).searchParams.get('w');
  const width = Number(requested);
  if (requested !== null && !privateImageWidths.some((size) => size === width))
    return new Response(null, { status: 400, headers });
  try {
    const bytes = await cachedImage(
      `${key}:${requested === null ? 'original' : width}`,
      async () => {
        const original = await cachedImage(`${key}:source`, async () => {
          const file = await download();
          if (file.error) throw file.error;
          return file.data ? Buffer.from(await file.data.arrayBuffer()) : null;
        });
        if (!original || requested === null) return original;
        return sharp(original)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      },
    );
    if (!bytes) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length) },
    });
  } catch (error) {
    const missing =
      error && typeof error === 'object' && 'status' in error && Number(error.status) === 404;
    return new Response(null, { status: missing ? 404 : 503, headers });
  }
}
