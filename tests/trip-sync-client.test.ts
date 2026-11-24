import { afterEach, describe, expect, it, vi } from 'vitest';
import { tripRequest, tripResponse } from '../apps/web/src/features/trips/sync-client';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stalledFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init!.signal!;
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    ),
  );
}

describe('Trip HTTP recovery', () => {
  it('still revokes access on a forbidden response with a null JSON body', async () => {
    await expect(tripResponse(Response.json(null, { status: 403 }))).rejects.toMatchObject({
      reason: 'forbidden',
    });
  });
  it('keeps malformed error details out of the user message without losing retry classification', async () => {
    await expect(
      tripResponse(Response.json({ error: { private: 'details' } }, { status: 503 })),
    ).rejects.toMatchObject({
      reason: 'temporary',
      message: 'La modification n’a pas pu être enregistrée.',
    });
  });
  it('aborts a stalled request when its deadline expires so a mutation can retry', async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    stalledFetch();
    const pending = tripRequest('/mutations', { signal: new AbortController().signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    deadline.abort(new DOMException('Deadline expired', 'TimeoutError'));
    await assertion;
    expect(timeout).toHaveBeenCalledWith(30000);
  });
  it('preserves immediate cancellation when a trip session is disposed', async () => {
    stalledFetch();
    const session = new AbortController();
    const pending = tripRequest('/sync', { signal: session.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    session.abort();
    await assertion;
  });
});
