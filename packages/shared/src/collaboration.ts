import { z } from 'zod';
import { snowflakeSchema } from './identifiers';
export const uuidSchema = z.uuid();
export const tripAuthorSchema = z
  .object({ display_name: z.string(), avatar_url: z.string().nullable() })
  .nullable();

export const discordUserSchema = z.object({
  id: snowflakeSchema,
  username: z.string().min(1).max(100),
  global_name: z.string().nullable().default(null),
  avatar: z.string().nullable().default(null),
  discriminator: z.string().default('0'),
  banner: z.string().nullable().default(null),
  accent_color: z.number().int().min(0).max(16777215).nullable().default(null),
});
export const discordGuildSchema = z.object({
  id: snowflakeSchema,
  name: z.string().min(1).max(100),
  icon: z.string().nullable().default(null),
  owner: z.boolean().default(false),
  permissions: z
    .string()
    .regex(/^\d{1,30}$/)
    .default('0'),
});
export type DiscordUser = z.infer<typeof discordUserSchema>;
export type DiscordGuild = z.infer<typeof discordGuildSchema> & {
  icon_url: string | null;
  members_can_create_trips: boolean;
};
export const tripInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Donnez un nom à votre voyage.').max(120),
    description: z.string().trim().max(4000).default(''),
    start_date: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.iso.date().nullable(),
    ),
    end_date: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.iso.date().nullable(),
    ),
  })
  .strict()
  .refine((value) => !value.start_date || !value.end_date || value.start_date <= value.end_date, {
    path: ['end_date'],
    message: 'La date de fin doit suivre la date de début.',
  });
export type TripInput = z.infer<typeof tripInputSchema>;
export const discordConnectionEnvSchema = z.object({
  DISCORD_CLIENT_SECRET: z.string().min(16),
  DISCORD_BOT_TOKEN: z.string().min(20),
  NAGI_TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/, 'Clé de chiffrement attendue : 32 octets encodés en base64.'),
});
export function guildInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toLocaleUpperCase('fr-FR') || 'N'
  );
}
