import { z } from 'zod';
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'Identifiant Discord invalide.');
