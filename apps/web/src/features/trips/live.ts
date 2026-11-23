'use client';
import { useEffect } from 'react';
import type { TripMutationQueue } from './mutation-queue';
import { decodeTripBatch } from './sync-client';

/** One private server-verified stream; the replay cursor survives reconnects.
 * Broadcasts only trigger reads of the SQL journal. No event causes a write. */
export function useTripLive(guild: string, trip: string, queue: TripMutationQueue) {
  useEffect(() => {
    let events: EventSource | undefined,
      reconnect: ReturnType<typeof setTimeout> | undefined,
      disposed = false,
      attempt = 0;
    const url = `/app/${guild}/trips/${trip}/sync`;
    function close() {
      events?.close();
      events = undefined;
      clearTimeout(reconnect);
    }
    function connect() {
      if (
        disposed ||
        queue.getSnapshot().revoked ||
        events ||
        document.visibilityState === 'hidden' ||
        !navigator.onLine
      )
        return;
      events = new EventSource(`${url}?since=${queue.getVersion()}`);
      events.addEventListener('change', (event) => {
        try {
          queue.receive(decodeTripBatch(JSON.parse((event as MessageEvent).data)));
          queue.setConnected(true);
          attempt = 0;
        } catch {
          void queue.recover();
        }
      });
      events.addEventListener('revoked', () => {
        close();
        queue.revoke('Votre accès à ce voyage a été révoqué.');
      });
      events.addEventListener('images', () => {
        window.dispatchEvent(new CustomEvent('nagi:images-updated', { detail: { trip } }));
      });
      events.onerror = () => {
        close();
        queue.setConnected(false);
        if (!disposed) reconnect = setTimeout(connect, Math.min(10000, 1000 * 2 ** attempt++));
      };
    }
    function visibility() {
      if (document.visibilityState === 'hidden') close();
      else {
        connect();
        void queue.recover();
      }
    }
    function online() {
      connect();
      void queue.recover();
    }
    connect();
    void queue.recover();
    const poll = setInterval(() => {
      if (document.visibilityState !== 'hidden' && navigator.onLine) void queue.recover();
    }, 15000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      close();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online);
    };
  }, [guild, trip, queue]);
}
