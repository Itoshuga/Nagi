import { describeError } from '@nagi/shared';

/** Structured logs deliberately exclude tokens, HTTP headers and interaction payloads. */
export function log(event: string, details: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), service: 'nagi-bot', event, ...details }),
  );
}
export function errorDetails(error: unknown) {
  return describeError(error, process.env);
}
