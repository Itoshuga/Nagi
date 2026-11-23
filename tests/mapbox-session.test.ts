import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogPlace } from '../packages/shared/src/trip-places';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/features/integrations/mapbox/client', () => ({ mapboxClientRequest: request }));
const { ExternalPlaceSession } =
  await import('../apps/web/src/features/integrations/mapbox/session');
const base: CatalogPlace = {
  source: 'mapbox',
  id: 'place-reference',
  title: 'Provider title',
  query: 'User input',
  featureType: 'poi',
  coordinates: { latitude: 35, longitude: 139 },
  proof: 'signed-reference',
};
beforeEach(() => vi.resetAllMocks());
describe('Active trip presentation lifetime', () => {
  it('deduplicates concurrent lookups and uses the active presentation without Details calls', async () => {
    request.mockResolvedValue({ place: base });
    const session = new ExternalPlaceSession('/external');
    const first = session.ensure(base.id, 'User input');
    const concurrent = session.ensure(base.id, 'User input');
    expect(first).toBe(concurrent);
    await first;
    await session.ensure(base.id, 'User input');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1].operation).toBe('resolve');
    session.dispose();
  });
  it('keeps the verified point when optional Details omits it, and deduplicates Details openings', async () => {
    const session = new ExternalPlaceSession('/external');
    session.put(base);
    request.mockResolvedValue({
      place: {
        source: 'mapbox',
        id: base.id,
        title: 'Detailed title',
        coordinates: undefined,
        website: 'https://example.test',
      },
    });
    await Promise.all([
      session.details(base.id, 'User input'),
      session.details(base.id, 'User input'),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(session.get(base.id).place?.coordinates).toEqual(base.coordinates);
    expect(session.get(base.id).place?.proof).toBe(base.proof);
    expect(session.get(base.id).place?.title).toBe('Detailed title');
    session.dispose();
  });
  it('preserves basic display when enrichment is unavailable, without automatic paid retries', async () => {
    const session = new ExternalPlaceSession('/external');
    session.put(base);
    request.mockRejectedValue(new Error('Details unavailable'));
    await session.details(base.id, 'User input');
    await session.details(base.id, 'User input');
    expect(request).toHaveBeenCalledTimes(1);
    expect(session.get(base.id).place).toEqual(base);
    expect(session.get(base.id).detailsError).toBe('Details unavailable');
    session.dispose();
  });
  it('removes provider presentation when the trip session closes', async () => {
    const session = new ExternalPlaceSession('/external');
    session.put(base);
    expect(session.get(base.id).place).toBeDefined();
    session.dispose();
    expect(session.get(base.id).place).toBeUndefined();
    await expect(session.ensure(base.id, 'User input')).rejects.toThrow('Session terminée');
    expect(request).not.toHaveBeenCalled();
  });
});
