import { z } from 'zod';
import { slugSchema, snowflakeSchema } from './identifiers';
export { describeError } from './diagnostics';
export { slugSchema, snowflakeSchema } from './identifiers';
export * from './collaboration';
export * from './geography';
export * from './trip-planner';
export * from './trip-format';
export * from './calendar-colors';
export * from './trip-sync';

export const roleSchema = z.enum(['user', 'admin', 'owner']);
export type Role = z.infer<typeof roleSchema>;
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema,
    position: z.number().int().min(0).default(0),
  })
  .strict();
export type CategoryInput = z.input<typeof categoryInputSchema>;
export function safeNext(value: string | null | undefined): string {
  if (!value || !/^\/(app|admin|select-server)(\/|\?|$)/.test(value) || /[\\\r\n]/.test(value))
    return '/app';
  return value;
}
export function isPrivatePath(path: string): boolean {
  return /^\/(app|admin|select-server)(\/|$)/.test(path);
}
export type BotPresence = 'online' | 'offline' | 'unavailable';
export function botPresence(
  heartbeat: string | null,
  connected: boolean,
  now = Date.now(),
): BotPresence {
  if (!heartbeat) return 'offline';
  const age = now - Date.parse(heartbeat);
  if (!Number.isFinite(age) || age < -5000 || age > 90000) return 'offline';
  if (!connected || age > 45000) return 'unavailable';
  return 'online';
}
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url().refine((value) => {
    const url = new URL(value);
    const local =
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.hostname.endsWith('.localhost');
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  }, 'URL canonique HTTPS requise (HTTP autorisé sur localhost), sans chemin ni identifiants.'),
});
const owners = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .pipe(z.array(snowflakeSchema));
export const serviceEnvSchema = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    DISCORD_APPLICATION_ID: snowflakeSchema,
    DISCORD_COMMAND_SCOPE: z.enum(['guild', 'global']).default('guild'),
    DISCORD_DEV_GUILD_ID: snowflakeSchema.optional(),
    NAGI_OWNER_DISCORD_IDS: owners,
  })
  .superRefine((value, ctx) => {
    if (value.DISCORD_COMMAND_SCOPE === 'guild' && !value.DISCORD_DEV_GUILD_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCORD_DEV_GUILD_ID'],
        message: 'Obligatoire pour le scope guild.',
      });
    }
  });
export const botEnvSchema = serviceEnvSchema.extend({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  DISCORD_BOT_TOKEN: z.string().min(20),
});
export type ServiceEnv = z.infer<typeof serviceEnvSchema>;
export function parseEnv<T>(schema: z.ZodType<T>, env: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Never include input values, which can contain secrets.
    throw new Error(
      `Configuration Nagi invalide :\n${result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}\nConsultez .env.example.`,
    );
  }
  return result.data;
}
export function commandScope(
  env: Pick<ServiceEnv, 'DISCORD_COMMAND_SCOPE' | 'DISCORD_DEV_GUILD_ID'>,
): string {
  if (env.DISCORD_COMMAND_SCOPE === 'global') return 'global';
  if (!env.DISCORD_DEV_GUILD_ID)
    throw new Error('Un serveur Discord est requis pour le scope guild.');
  return `guild:${env.DISCORD_DEV_GUILD_ID}`;
}
export * from './catalog';
export * from './profiles';
export * from './relations';
export * from './trip-catalog-duration';
export * from './trip-places';
export * from './urls';
