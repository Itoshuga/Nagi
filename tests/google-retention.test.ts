import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchGoogleCoordinateExpiry } from '../apps/web/src/features/integrations/google-places/client';
afterEach(() => vi.useRealTimers());
describe('Session coordinate retention', () => {
  it('removes staggered responses at each expiry without refreshing the provider', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const points = new Map([
        ['first', { expiresAt: 600000 }],
        ['later', { expiresAt: 601000 }],
      ]),
      onExpiry = vi.fn();
    const stop = watchGoogleCoordinateExpiry(points, onExpiry);
    vi.advanceTimersByTime(600000);
    expect([...points.keys()]).toEqual(['later']);
    vi.advanceTimersByTime(1000);
    expect(points.size).toBe(0);
    expect(onExpiry).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
  it('cancels map notifications after the view unmounts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onExpiry = vi.fn(),
      stop = watchGoogleCoordinateExpiry(new Map([['place', { expiresAt: 600000 }]]), onExpiry);
    stop();
    vi.advanceTimersByTime(600000);
    expect(onExpiry).not.toHaveBeenCalled();
  });
});
