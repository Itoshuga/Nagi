'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function useTripLive(guild: string, trip: string, version: number) {
  const router = useRouter();
  const current = useRef(version);
  useEffect(() => {
    current.current = version;
  }, [version]);
  useEffect(() => {
    const url = `/app/${guild}/trips/${trip}/sync`;
    const stop = new AbortController();
    let events: EventSource | undefined;
    let lastRefresh = 0;
    function refresh() {
      if (
        stop.signal.aborted ||
        document.visibilityState === 'hidden' ||
        Date.now() - lastRefresh < 750
      )
        return;
      lastRefresh = Date.now();
      router.refresh();
    }
    function connect() {
      if (events || document.visibilityState === 'hidden') return;
      events = new EventSource(url);
      events.addEventListener('change', refresh);
      events.addEventListener('unavailable', () => {
        events?.close();
        events = undefined;
      });
    }
    async function poll() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(url, { cache: 'no-store', signal: stop.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          if (response.status === 404 || response.redirected) refresh();
          return;
        }
        const stamp: unknown = (await response.json()).version;
        if (typeof stamp === 'number' && stamp !== current.current) refresh();
      } catch {
        // The next visible poll covers interrupted connections.
      }
    }
    function visibility() {
      if (document.visibilityState === 'hidden') {
        events?.close();
        events = undefined;
      } else {
        connect();
        void poll();
      }
    }
    connect();
    void poll();
    const timer = setInterval(() => void poll(), 15_000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      stop.abort();
      events?.close();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [guild, trip, router]);
}
