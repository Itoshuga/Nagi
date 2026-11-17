import { describe, expect, it } from 'vitest';
import { describeError } from '../packages/shared/src/diagnostics';

describe('Safe server diagnostics', () => {
  it('preserves the database cause and SQLSTATE of a wrapped startup error', () => {
    const error = new Error('Impossible de configurer les propriétaires Nagi.', {
      cause: {
        code: '21000',
        message: 'DELETE requires a WHERE clause',
        details: 'private SQL payload',
      },
    });
    expect(describeError(error)).toEqual({
      kind: 'Error',
      message: error.message,
      causes: [{ kind: 'ServiceError', code: '21000', message: 'DELETE requires a WHERE clause' }],
    });
    expect(JSON.stringify(describeError(error))).not.toContain('private SQL payload');
  });

  it('redacts configured keys, tokens, owner IDs and secrets throughout the cause chain', () => {
    const environment = {
      SUPABASE_SERVICE_ROLE_KEY: 'private-server-key',
      DISCORD_BOT_TOKEN: 'private-bot-token',
      NAGI_OWNER_DISCORD_IDS: '111111111111111111,222222222222222222',
    };
    const error = new Error('Rejected private-server-key for 111111111111111111', {
      cause: new Error('private-bot-token / 222222222222222222'),
    });
    const result = JSON.stringify(describeError(error, environment));
    for (const secret of [
      'private-server-key',
      'private-bot-token',
      '111111111111111111',
      '222222222222222222',
    ])
      expect(result).not.toContain(secret);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts bearer tokens, JWTs, connection credentials and URL token parameters', () => {
    const error = new Error(
      'Bearer token-value, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature postgresql://postgres:password@host/db?access_token=query-secret',
    );
    const result = JSON.stringify(describeError(error));
    for (const secret of [
      'token-value',
      'eyJhbGciOiJIUzI1NiJ9',
      'postgres:password',
      'query-secret',
    ])
      expect(result).not.toContain(secret);
  });

  it('bounds messages and handles cyclic or unknown errors without dumping arbitrary fields', () => {
    const error = new Error('x'.repeat(1000));
    error.cause = error;
    expect(describeError(error).message).toHaveLength(500);
    expect(describeError(error).causes).toBeUndefined();
    expect(describeError({ headers: { Authorization: 'private' } })).toEqual({ kind: 'Error' });
    expect(describeError(undefined)).toEqual({ kind: 'UnknownError' });
  });
});
