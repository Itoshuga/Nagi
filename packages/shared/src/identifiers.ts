import { z } from 'zod';
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'Identifiant Discord invalide.');
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
