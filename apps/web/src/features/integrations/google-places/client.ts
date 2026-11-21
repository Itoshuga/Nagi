'use client';

type GoogleRuntime = { maps: { importLibrary: (library: string) => Promise<unknown> } };
let loading: Promise<void> | undefined;
export function loadGooglePlaces() {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const started = performance.now();
    const runtime = window as unknown as { google?: GoogleRuntime; __nagiPlacesReady?: () => void };
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      script?.remove();
      if (runtime.__nagiPlacesReady === finish) delete runtime.__nagiPlacesReady;
      reject(new Error('Google Maps ne répond pas. Réessayez.'));
    }, 15000);
    const ready = () => {
      performance.measure('nagi:google-sdk', { start: started, end: performance.now() });
      clearTimeout(timer);
      resolve();
    };
    const failed = () => {
      clearTimeout(timer);
      reject(new Error('Google Maps indisponible.'));
    };
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      failed();
      return;
    }
    const finish = () => {
      if (!runtime.google?.maps.importLibrary) {
        failed();
        return;
      }
      void runtime.google.maps.importLibrary('places').then(ready, failed);
    };
    if (runtime.google?.maps.importLibrary) {
      finish();
      return;
    }
    runtime.__nagiPlacesReady = finish;
    script.id = 'nagi-google-places-sdk';
    script.async = true;
    script.src =
      'https://maps.googleapis.com/maps/api/js?' +
      new URLSearchParams({
        key,
        v: 'weekly',
        loading: 'async',
        libraries: 'places',
        callback: '__nagiPlacesReady',
        language: 'fr',
      });
    script.onerror = () => {
      script?.remove();
      failed();
    };
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
export async function googleClientRequest(url: string, body?: object, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }).catch((error: unknown) => {
    if (timeout.aborted && !signal?.aborted)
      throw new Error('Google Maps met trop de temps à répondre. Réessayez.');
    throw error;
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'La recherche Google Maps est temporairement indisponible.',
    );
  }
  return response.json();
}
// Every point has its own expiry; one early response must not leave later
// responses on the map indefinitely. Expiry never makes another paid request.
export function watchGoogleCoordinateExpiry(
  points: Map<string, { expiresAt: number }>,
  onExpiry: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = () => {
    const expiry = Math.min(...[...points.values()].map((point) => point.expiresAt));
    if (stopped || !Number.isFinite(expiry)) return;
    timer = setTimeout(
      () => {
        for (const [id, point] of points) if (point.expiresAt <= Date.now()) points.delete(id);
        onExpiry();
        schedule();
      },
      Math.max(1, expiry - Date.now()),
    );
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
