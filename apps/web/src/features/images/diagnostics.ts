import 'server-only';

type Counter = {
  requests: number;
  found: number;
  errors: number;
  totalMs: number;
  returnedRecords: number;
  fallbacks: number;
};
const counters = new Map<string, Counter>();
export function imageDiagnostic(
  provider: string,
  reason: string,
  ms = 0,
  found = 0,
  returnedRecords = 0,
) {
  const counter = counters.get(provider) ?? {
    requests: 0,
    found: 0,
    errors: 0,
    totalMs: 0,
    returnedRecords: 0,
    fallbacks: 0,
  };
  counter.requests++;
  counter.found += found;
  counter.errors += /network|unavailable|quota|access|invalid|unsupported/.test(reason) ? 1 : 0;
  counter.totalMs += Math.round(ms);
  counter.returnedRecords += returnedRecords;
  counter.fallbacks += /no-reliable|none|unusable|no-photos/.test(reason) ? 1 : 0;
  counters.set(provider, counter);
  if (process.env.NODE_ENV === 'development' && process.env.NAGI_IMAGE_DIAGNOSTICS === 'true')
    console.info('nagi.image', { provider, reason, ms: Math.round(ms), found });
}
// Only aggregate counts; no names, coordinates, URLs, tokens or member IDs.
export const imageDiagnostics = () => Object.fromEntries(counters);
