import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { isPrivateImage, privateImageLoader } from '../apps/web/src/features/media/private-loader';

const { privateImageResponse } = await import('../apps/web/src/features/media/private-response');
const sharp = createRequire(new URL('../apps/web/package.json', import.meta.url))('sharp');
const request = (width: number) => new Request(`https://nagi.test/app/entry-media/test?w=${width}`);

describe('Private image variants', () => {
  it('serves smaller variants and shares downloads across concurrent sizes', async () => {
    const pixels = Buffer.alloc(1600 * 900 * 3);
    for (let index = 0; index < pixels.length; index++)
      pixels[index] = (index * 31 + (index >> 4)) % 256;
    const source: Buffer = await sharp(pixels, { raw: { width: 1600, height: 900, channels: 3 } })
      .webp()
      .toBuffer();
    const download = vi.fn(async () => ({ data: new Blob([new Uint8Array(source)]), error: null }));
    const [small, large] = await Promise.all([
      privateImageResponse(request(320), 'test/variants', download),
      privateImageResponse(request(960), 'test/variants', download),
    ]);
    const smallBytes = Buffer.from(await small.arrayBuffer());
    expect((await sharp(smallBytes).metadata()).width).toBe(320);
    expect((await sharp(Buffer.from(await large.arrayBuffer())).metadata()).width).toBe(960);
    expect(smallBytes.length).toBeLessThan(source.length);
    expect(download).toHaveBeenCalledTimes(1);
    expect(small.headers.get('cache-control')).toBe('private, no-store');
    expect(small.headers.get('content-length')).toBe(String(smallBytes.length));
    await privateImageResponse(request(320), 'test/variants', download);
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('bounds requested sizes and retries failed downloads without caching errors', async () => {
    const download = vi.fn().mockResolvedValue({ data: null, error: { status: 404 } });
    expect((await privateImageResponse(request(999999), 'test/retry', download)).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
    expect((await privateImageResponse(request(320), 'test/retry', download)).status).toBe(404);
    const bytes: Buffer = await sharp({
      create: { width: 40, height: 20, channels: 3, background: '#73a6df' },
    })
      .webp()
      .toBuffer();
    download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null });
    const response = await privateImageResponse(request(320), 'test/retry', download);
    expect(response.status).toBe(200);
    expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width).toBe(40);
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('keeps remote assets separate and maps responsive sizes to bounded private URLs', () => {
    expect(isPrivateImage('https://example.com/image.webp')).toBe(false);
    expect(isPrivateImage('/app/profile-banner/user/version')).toBe(true);
    expect(privateImageLoader({ src: '/app/entry-media/a/b/c', width: 420 })).toBe(
      '/app/entry-media/a/b/c?w=640',
    );
    expect(privateImageLoader({ src: '/app/trip-cover/a/b/c', width: 3840 })).toBe(
      '/app/trip-cover/a/b/c?w=1600',
    );
  });
});
