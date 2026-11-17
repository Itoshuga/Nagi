import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Json, NagiDatabase } from '@nagi/database';
import { DiscordApi, DiscordConnectionError, DiscordUserService } from './api';

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable(),
});
const recordSchema = z.object({
  encrypted_tokens: z.string(),
  expires_at: z.string(),
  version: z.number().int(),
  scopes: z.array(z.string()),
});
export class TokenCipher {
  private readonly key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32) throw new Error('Clé NAGI_TOKEN_ENCRYPTION_KEY invalide.');
  }
  encrypt(userId: string, tokens: z.infer<typeof tokensSchema>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`nagi:discord:${userId}`));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(tokensSchema.parse(tokens)), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }
  decrypt(userId: string, value: string) {
    try {
      const [version, iv, tag, content, ...extra] = value.split('.');
      if (version !== 'v1' || !iv || !tag || !content || extra.length)
        throw new Error('Invalid encrypted record');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(`nagi:discord:${userId}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(content, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      return tokensSchema.parse(JSON.parse(plain));
    } catch {
      throw new DiscordConnectionError('reconnect');
    }
  }
}
export class DiscordTokenService {
  constructor(
    private readonly db: NagiDatabase,
    private readonly api: DiscordApi,
    private readonly cipher: TokenCipher,
    private readonly applicationId: string,
    private readonly secret: string,
  ) {}
  async capture(
    userId: string,
    discordId: string,
    accessToken: string,
    refreshToken: string | null,
  ) {
    const [grant, user] = await Promise.all([
      this.api.grant(accessToken, this.applicationId),
      new DiscordUserService(this.api).current(accessToken),
    ]);
    if (user.id !== discordId) throw new DiscordConnectionError('reconnect');
    const { error } = await this.db.rpc('save_discord_credentials', {
      p_user_id: userId,
      p_discord_id: discordId,
      p_profile: user as unknown as Json,
      p_encrypted_tokens: this.cipher.encrypt(userId, { accessToken, refreshToken }),
      p_expires_at: grant.expiresAt,
      p_scopes: grant.scopes,
    });
    if (error) throw new Error('Impossible de sécuriser la connexion Discord.', { cause: error });
    return user;
  }
  private async record(userId: string) {
    const { data, error } = await this.db.rpc('read_discord_credentials', { p_user_id: userId });
    if (error) throw new Error('Connexion Discord indisponible.', { cause: error });
    if (!data) throw new DiscordConnectionError('reconnect');
    return recordSchema.parse(data);
  }
  async accessToken(userId: string, force = false): Promise<string> {
    let row = await this.record(userId);
    for (let attempt = 0; attempt < 80; attempt++) {
      const tokens = this.cipher.decrypt(userId, row.encrypted_tokens);
      if (!force && Date.parse(row.expires_at) > Date.now() + 60000) return tokens.accessToken;
      if (!tokens.refreshToken) {
        await this.revoke(userId, row.version);
        throw new DiscordConnectionError('reconnect');
      }
      const lease = randomUUID();
      const claim = await this.db.rpc('claim_discord_refresh', {
        p_user_id: userId,
        p_version: row.version,
        p_lease: lease,
      });
      if (claim.error)
        throw new Error('Renouvellement Discord indisponible.', { cause: claim.error });
      if (!claim.data) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const next = await this.record(userId);
        if (next.version !== row.version) force = false;
        row = next;
        continue;
      }
      try {
        const refreshed = await this.api.refresh(
          tokens.refreshToken,
          this.applicationId,
          this.secret,
        );
        const saved = await this.db.rpc('finish_discord_refresh', {
          p_user_id: userId,
          p_lease: lease,
          p_encrypted_tokens: this.cipher.encrypt(userId, refreshed),
          p_expires_at: refreshed.expiresAt,
          p_scopes: refreshed.scopes,
        });
        if (saved.error)
          throw new Error('Impossible de sauvegarder le renouvellement Discord.', {
            cause: saved.error,
          });
        if (!saved.data) {
          row = await this.record(userId);
          force = false;
          continue;
        }
        return refreshed.accessToken;
      } catch (error) {
        if (error instanceof DiscordConnectionError && error.reason === 'reconnect')
          await this.revoke(userId, row.version);
        throw error;
      } finally {
        await this.db.rpc('release_discord_refresh', { p_user_id: userId, p_lease: lease });
      }
    }
    throw new DiscordConnectionError('unavailable');
  }
  async revoke(userId: string, version: number) {
    const { error } = await this.db.rpc('revoke_discord_credentials', {
      p_user_id: userId,
      p_version: version,
    });
    if (error) throw new Error('Impossible de fermer la connexion Discord.', { cause: error });
  }
}
