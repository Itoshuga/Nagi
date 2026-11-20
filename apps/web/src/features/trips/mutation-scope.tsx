'use client';
import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { TripQueueRegistry } from './mutation-registry';

export const TripMutationScopeContext = createContext<TripQueueRegistry | null>(null);
export function TripMutationScope({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new TripQueueRegistry());
  const cleanup = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(cleanup.current);
    const online = () => registry.online(navigator.onLine);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (registry.pending()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
      window.removeEventListener('beforeunload', beforeUnload);
      cleanup.current = setTimeout(() => registry.dispose(), 0);
    };
  }, [registry]);
  return <TripMutationScopeContext value={registry}>{children}</TripMutationScopeContext>;
}
