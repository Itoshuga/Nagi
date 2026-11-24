'use client';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { TripPlan } from '@nagi/database';
import { TripMutationQueue } from './mutation-queue';
import { useTripLive } from './live';
import { TripMutationScopeContext } from './mutation-scope';
import { decodeTripBatch, tripRequest } from './sync-client';

export function useTripMutations(
  guild: string,
  initial: TripPlan,
  viewer: string,
  canEdit: boolean,
  canManage: boolean,
) {
  const registry = useContext(TripMutationScopeContext);
  if (!registry) throw new Error('TripMutationScope requis.');
  const key = `${viewer}:${guild}:${initial.id}`;
  const [queue] = useState(() =>
    registry.get(key, () => {
      const url = `/app/${guild}/trips/${initial.id}`;
      return new TripMutationQueue(initial, {
        viewer,
        canEdit,
        canManage,
        send: async (request, signal) =>
          decodeTripBatch(
            await tripRequest(`${url}/mutations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request),
              signal,
            }),
          ),
        recover: async (version, signal) => {
          const batch = decodeTripBatch(
            await tripRequest(`${url}/sync?since=${version}`, { signal }),
          );
          if (!batch.reset) return batch;
          const fresh = await tripRequest(`${url}/sync?snapshot=1`, { signal });
          if (fresh.snapshot?.id !== initial.id || !Array.isArray(fresh.snapshot?.items))
            throw new Error('Voyage invalide.');
          return fresh as { snapshot: TripPlan; can_edit: boolean; can_manage: boolean };
        },
      });
    }),
  );
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  useEffect(() => {
    registry.retain(key);
    queue.setOnline(navigator.onLine);
    return () => registry.release(key);
  }, [registry, key, queue]);
  useEffect(() => queue.replace(initial, canEdit, canManage), [queue, initial, canEdit, canManage]);
  useTripLive(guild, initial.id, queue);
  return { state, queue };
}
