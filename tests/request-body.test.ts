import { describe, expect, it, vi } from 'vitest';
import { readJsonBody } from '../apps/web/src/lib/request-body';

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  const cancel = vi.fn();
  let index = 0;
  const request = new Request('https://nagi.test', {
    method: 'POST',
    headers,
    body: new ReadableStream({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]!);
        else controller.close();
      },
      cancel,
    }),
    duplex: 'half',
  } as RequestInit);
  return { request, cancel };
}
const encode = (text: string) => new TextEncoder().encode(text);

describe('Bounded JSON request bodies', () => {
  it('decodes UTF-8 split across chunks at the exact byte limit', async () => {
    const bytes = encode('{"title":"été 日本"}');
    const { request } = streamed([bytes.slice(0, 12), bytes.slice(12)]);
    await expect(readJsonBody(request, bytes.length)).resolves.toEqual({ title: 'été 日本' });
    expect(request.body?.locked).toBe(false);
  });
  it('cancels an oversized chunked body before reading its remaining chunks', async () => {
    const { request, cancel } = streamed([encode(' '.repeat(17)), encode('more data')]);
    await expect(readJsonBody(request, 16)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  });
  it('counts bytes rather than UTF-16 characters and does not trust a shorter declared size', async () => {
    const value = '"日本日本日本"';
    const { request } = streamed([encode(value)], { 'content-length': '1' });
    await expect(readJsonBody(request, value.length)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects a declared oversized body before reading it', async () => {
    const { request } = streamed([encode('{}')], { 'content-length': '1000' });
    await expect(readJsonBody(request, 16)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });
  it.each([encode('{broken'), new Uint8Array([34, 0xff, 34])])(
    'rejects malformed JSON or invalid UTF-8',
    async (bytes) => {
      await expect(readJsonBody(streamed([bytes]).request, 100)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});
