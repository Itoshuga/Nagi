export type ErrorDiagnostic = {
  kind: string;
  message?: string;
  code?: string | number;
};

/** Server log fields only: never serialize stacks, SQL details, headers or payloads. */
export function describeError(
  error: unknown,
  environment: Record<string, string | undefined> = {},
): ErrorDiagnostic & { causes?: ErrorDiagnostic[] } {
  const sensitive = Object.entries(environment)
    .filter(
      ([key, value]) =>
        value && /TOKEN|SECRET|PASSWORD|KEY|OWNER_DISCORD_IDS|DATABASE_URL|DB_URL/i.test(key),
    )
    .flatMap(([key, value]) =>
      key.endsWith('OWNER_DISCORD_IDS')
        ? value!
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : [value!],
    )
    .sort((a, b) => b.length - a.length);

  function redact(value: string): string {
    let result = value;
    for (const secret of sensitive) result = result.replaceAll(secret, '[REDACTED]');
    return result
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
      .replace(
        /([?&](?:apikey|token|access_token|refresh_token|key|password)=)[^&#\s]+/gi,
        '$1[REDACTED]',
      )
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, 500);
  }

  const chain: ErrorDiagnostic[] = [];
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') {
      chain.push({
        kind: 'UnknownError',
        ...(typeof current === 'string' ? { message: redact(current) } : {}),
      });
      break;
    }
    if (seen.has(current)) break;
    seen.add(current);
    const record = current as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    const code =
      typeof record.code === 'number' ||
      (typeof record.code === 'string' && /^[A-Z0-9_]{1,40}$/i.test(record.code))
        ? record.code
        : undefined;
    chain.push({
      kind: redact(typeof record.name === 'string' ? record.name : code ? 'ServiceError' : 'Error'),
      ...(typeof record.message === 'string' ? { message: redact(record.message) } : {}),
      ...(code !== undefined ? { code } : {}),
    });
    if (!record.cause) break;
    current = record.cause;
  }
  return {
    ...(chain[0] ?? { kind: 'UnknownError' }),
    ...(chain.length > 1 ? { causes: chain.slice(1) } : {}),
  };
}
