/** Browser-facing URLs never turn empty values or OS paths into links. */
export function externalHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return;
  }
}
export function imageSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return;
  const source = value.trim();
  if (source.startsWith('/') && !source.startsWith('//') && !source.includes('\\')) return source;
  if (
    /^blob:https?:\/\//.test(source) ||
    /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/.test(source)
  )
    return source;
  return externalHttpUrl(source);
}
