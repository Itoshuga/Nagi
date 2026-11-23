'use client';
export async function mapboxClientRequest(url: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    cache: 'no-store',
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error ?? 'Les informations Mapbox sont momentanément indisponibles.');
  return data;
}
