'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { googleClientRequest, loadGooglePlaces } from './client';

type Widget = {
  placeId: string;
  promise: Promise<HTMLElement>;
  owner: HTMLElement | null;
  loaded?: boolean;
};
type Session = {
  url: string;
  widgets: Map<string, Widget>;
  status?: Promise<{ available: boolean; minCharacters: number }>;
  replace?: (id: string) => void;
  preview?: (placeId: string) => void;
  coordinates: Map<string, { latitude: number; longitude: number; expiresAt: number }>;
};
const Context = createContext<Session | null>(null);
export function ExternalPlacesProvider({
  guild,
  trip,
  children,
  onReplace,
  onPreview,
}: {
  guild: string;
  trip: string;
  children: React.ReactNode;
  onReplace?: (id: string) => void;
  onPreview?: (placeId: string) => void;
}) {
  const session = useMemo<Session>(
    () => ({
      url: `/app/${guild}/trips/${trip}/external`,
      widgets: new Map(),
      coordinates: new Map(),
      replace: onReplace,
      preview: onPreview,
    }),
    [guild, trip, onReplace, onPreview],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      for (const [id, point] of session.coordinates)
        if (point.expiresAt <= Date.now()) session.coordinates.delete(id);
    }, 30000);
    return () => {
      clearInterval(timer);
      session.widgets.clear();
      session.coordinates.clear();
    };
  }, [session]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useExternalPlaces() {
  return useContext(Context);
}
export function externalStatus(session: Session) {
  session.status ??= googleClientRequest(session.url)
    .then((status) => {
      if (!status.available) session.status = undefined;
      return status;
    })
    .catch((error) => {
      session.status = undefined;
      throw error;
    });
  return session.status;
}
export async function authorizeGoogleWidget(session: Session, kind: 'ui_search' | 'ui_details') {
  const status = await externalStatus(session);
  if (!status.available)
    throw new Error(
      'Google Maps n’est pas encore disponible. Le catalogue Nagi et les étapes personnalisées restent accessibles.',
    );
  await Promise.all([
    googleClientRequest(session.url, { operation: 'ui', kind }),
    loadGooglePlaces(),
  ]);
}
export function GooglePlaceView({
  placeId,
  occurrence,
  full = false,
  appearance = 'card',
  eager = false,
}: {
  placeId: string;
  occurrence: string;
  full?: boolean;
  appearance?: 'card' | 'label' | 'thumbnail';
  eager?: boolean;
}) {
  const session = useExternalPlaces(),
    host = useRef<HTMLSpanElement>(null);
  const [failure, setFailure] = useState(''),
    [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const variant = full ? 'detail' : appearance;
  useEffect(() => {
    const element = host.current;
    if (!session || !element) return;
    let cancelled = false,
      expired = false;
    const base = `${placeId}:${variant}`;
    let key = base,
      attached: HTMLElement | undefined,
      lease: Widget | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const forget = () => {
      if (session.widgets.get(key) === lease) session.widgets.delete(key);
    };
    const onError = () => {
      clearTimeout(timer);
      if (!cancelled) {
        forget();
        setFailure('Les informations Google sont momentanément indisponibles.');
      }
    };
    const onLoad = () => {
      clearTimeout(timer);
      if (lease) lease.loaded = true;
      if (!cancelled) {
        setReady(true);
        setFailure('');
      }
    };
    const show = async () => {
      try {
        await Promise.resolve();
        if (cancelled) return;
        setReady(false);
        setMounted(false);
        setFailure('');
        timer = setTimeout(() => {
          if (cancelled) return;
          expired = true;
          forget();
          setFailure('Le chargement Google prend trop de temps. Vous pouvez réessayer.');
        }, 12000);
        for (
          let slot = 1;
          session.widgets.get(key)?.owner && session.widgets.get(key)?.owner !== element;
          slot++
        )
          key = `${base}:${slot}`;
        let cached = session.widgets.get(key);
        if (cached?.placeId !== placeId) {
          cached = {
            placeId,
            owner: element,
            promise: (async () => {
              await authorizeGoogleWidget(session, 'ui_details');
              const widget = document.createElement(
                full
                  ? 'gmp-place-details'
                  : appearance === 'thumbnail'
                    ? 'gmp-advanced-place-details-compact'
                    : 'gmp-place-details-compact',
              );
              // Keep readiness when a detached widget finishes loading. React's
              // subscriber may already be gone when the provider fires this event.
              const record = cached!;
              widget.addEventListener('gmp-load', () => {
                record.loaded = true;
              });
              if (!full) {
                widget.setAttribute('orientation', 'horizontal');
                widget.setAttribute('truncation-preferred', '');
              }
              if (!full && appearance === 'thumbnail') {
                // An explicit corner action keeps the provider's link available
                // without adding its large main action to a narrow trip row.
                const link = document.createElement('gmp-place-link');
                link.setAttribute('action', 'open-map');
                link.setAttribute('slot', 'action-corner');
                widget.append(link);
              }
              const request = document.createElement('gmp-place-details-place-request');
              request.setAttribute('place', placeId);
              for (const tag of [
                'gmp-place-name',
                ...(full
                  ? [
                      'gmp-place-address',
                      'gmp-place-type',
                      'gmp-place-media',
                      'gmp-place-rating',
                      'gmp-place-opening-hours',
                      'gmp-place-website',
                    ]
                  : appearance === 'card'
                    ? ['gmp-place-media', 'gmp-place-type']
                    : appearance === 'thumbnail'
                      ? ['gmp-place-media']
                      : []),
                'gmp-place-attribution',
              ]) {
                const content = document.createElement(tag);
                if (tag === 'gmp-place-media' && !full)
                  content.setAttribute('preferred-size', 'small');
                widget.append(content);
              }
              widget.append(request);
              return widget;
            })(),
          };
          session.widgets.set(key, cached);
          if (session.widgets.size > 80) {
            for (const [oldKey, value] of session.widgets) {
              if (!value.owner && oldKey !== key) {
                session.widgets.delete(oldKey);
                break;
              }
            }
          }
        }
        cached.owner = element;
        lease = cached;
        const widget = await cached.promise;
        if (!cancelled && !expired) {
          attached = widget;
          widget.addEventListener('gmp-error', onError);
          widget.addEventListener('gmp-load', onLoad);
          setReady(!!cached.loaded);
          setFailure('');
          setMounted(true);
          // Subscribe before connection: a warm widget may finish synchronously.
          element.replaceChildren(widget);
          if (cached.loaded) clearTimeout(timer);
        }
      } catch (error) {
        clearTimeout(timer);
        forget();
        if (!cancelled)
          setFailure(error instanceof Error ? error.message : 'Google Maps indisponible.');
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void show();
        }
      },
      { rootMargin: '80px' },
    );
    if (eager) void show();
    else observer.observe(element);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
      attached?.removeEventListener('gmp-error', onError);
      attached?.removeEventListener('gmp-load', onLoad);
      if (lease?.owner === element) lease.owner = null;
    };
  }, [session, placeId, occurrence, full, retry, appearance, variant, eager]);
  return (
    <span
      onClick={(event) => {
        const path = event.nativeEvent.composedPath(),
          end = path.indexOf(event.currentTarget);
        if (
          path
            .slice(0, end)
            .some((node) => node instanceof Element && node.matches('a,button,gmp-place-link'))
        )
          event.stopPropagation();
      }}
      className={`trip-google-place is-${variant}${mounted ? ' has-widget' : ''}${ready ? ' is-ready' : ''}${failure ? ' has-error' : ''}`}
      data-google-place={placeId}
    >
      <span ref={host} className="trip-google-widget" />
      {failure && (
        <span className="trip-google-fallback">
          <span role="status">{failure}</span>
          {full && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRetry((r) => r + 1);
              }}
            >
              Réessayer
            </button>
          )}
        </span>
      )}
    </span>
  );
}
