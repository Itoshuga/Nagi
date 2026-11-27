'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DayRoutePlan, DayRouteResult } from './map-route-model';
import { dayRouteKey, dayRouteProfile } from './map-route-model';
export type DayRouteInput = {
  day: string;
  plan: DayRoutePlan;
  places: { id: string; query: string; proof: string }[];
};
type State = { token: object; key: string; result?: DayRouteResult; error?: string; code?: string };
export function useDayRoute(url: string, input: DayRouteInput, enabled: boolean, refresh: number) {
  const key = dayRouteKey(input.day, dayRouteProfile, input.plan);
  const token = useMemo(() => ({ url, key, enabled, refresh }), [url, key, enabled, refresh]);
  const [state, setState] = useState<State>();
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  useEffect(() => {
    // Discard the previous response: Navigation results are not cached.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(undefined);
    if (!enabled || latest.current.plan.points.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const current = latest.current;
      const body = JSON.stringify({
        day: current.day,
        key,
        places: current.places,
      });
      try {
        let response: Response;
        let data: DayRouteResult & { error?: string; code?: string };
        for (let attempt = 0; ; attempt++) {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
            body,
          });
          data = await response.json();
          // Optimistic edits can arrive before their write. A stale request has
          // made no provider call; allow a bounded wait for the existing queue.
          if (response.status !== 409 || data.code !== 'stale_route' || attempt >= 2) break;
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 600 * (attempt + 1));
            controller.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                resolve();
              },
              { once: true },
            );
          });
          controller.signal.throwIfAborted();
        }
        if (controller.signal.aborted) return;
        setState(
          response.ok && data.key === key
            ? { token, key, result: data }
            : {
                token,
                key,
                error: data.error ?? 'Le trajet est momentanément indisponible.',
                code: data.code,
              },
        );
      } catch {
        if (!controller.signal.aborted)
          setState({
            token,
            key,
            error: 'Le trajet est momentanément indisponible. Les lieux restent accessibles.',
          });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, key, enabled, refresh, token]);
  // A previous day's line disappears in the same render, before the effect runs.
  const current = enabled && state?.token === token ? state : undefined;
  return {
    result: current?.result,
    error: current?.error,
    code: current?.code,
    loading: enabled && input.plan.points.length >= 2 && !current,
  };
}
