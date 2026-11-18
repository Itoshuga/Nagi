import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  media: vi.fn(),
  download: vi.fn(),
  verify: vi.fn(),
  banner: vi.fn(),
}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  sessionDatabase: async () => ({
    auth: { getClaims: mocks.claims },
    from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: mocks.media };
      return query;
    },
  }),
  serviceDatabase: () => ({ storage: { from: () => ({ download: mocks.download }) } }),
}));
vi.mock('@/features/auth/session', () => ({ requireViewer: async () => ({ id: 'viewer' }) }));
vi.mock('@/features/profiles/server', () => ({
  profileServices: () => ({ access: { verify: mocks.verify }, store: { banner: mocks.banner } }),
}));

const { GET: entryImage } =
  await import('../apps/web/src/app/(app)/app/entry-media/[entryId]/[mediaId]/[version]/route');
const { GET: profileBanner } =
  await import('../apps/web/src/app/(app)/app/profile-banner/[userId]/[version]/route');
const user = '11111111-1111-4111-8111-111111111111';
const version = '22222222-2222-4222-8222-222222222222';
const sharp = createRequire(new URL('../apps/web/package.json', import.meta.url))('sharp');
const request = new Request('https://nagi.test/app/image?w=320');

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ data: { claims: { sub: user } } });
  mocks.media.mockResolvedValue({
    data: { storage_path: 'route-fixture/image.webp' },
    error: null,
  });
  mocks.verify.mockResolvedValue(true);
  mocks.banner.mockResolvedValue(true);
  const bytes: Buffer = await sharp({
    create: { width: 640, height: 320, channels: 3, background: '#73a6df' },
  })
    .webp()
    .toBuffer();
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null });
});

describe('Private media route authorization with warm image caches', () => {
  it('rechecks the session and current RLS-visible media before returning cached pixels', async () => {
    const context = { params: Promise.resolve({ entryId: user, mediaId: user, version }) };
    expect((await entryImage(request, context)).status).toBe(200);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    mocks.claims.mockResolvedValue({ data: { claims: null } });
    expect((await entryImage(request, context)).status).toBe(404);
    mocks.claims.mockResolvedValue({ data: { claims: { sub: user } } });
    mocks.media.mockResolvedValue({ data: null, error: null });
    expect((await entryImage(request, context)).status).toBe(404);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it('refuses cached banners after Discord access or the current banner version changes', async () => {
    const context = { params: Promise.resolve({ userId: user, version }) };
    expect((await profileBanner(request, context)).status).toBe(200);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    mocks.verify.mockResolvedValue(false);
    expect((await profileBanner(request, context)).status).toBe(404);
    mocks.verify.mockResolvedValue(true);
    mocks.banner.mockResolvedValue(false);
    expect((await profileBanner(request, context)).status).toBe(404);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
});
