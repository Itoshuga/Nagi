import { z } from "zod";
import type { Photograph } from "../../types/content";

const httpUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
export const photoCreditSchema = z.object({ author: z.string().min(1).max(200), sourceUrl: httpUrl, license: z.string().max(100).optional(), licenseUrl: httpUrl.optional(), title: z.string().max(400).optional() }).strict();
// Compatibilité des chemins déjà enregistrés en base ; aucune bibliothèque locale.
export function legacyPhotograph(src: string, alt: string, position = "50% 50%", credit?: z.infer<typeof photoCreditSchema> | null): Photograph | null {
  if (!/^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/.test(src)) return null;
  return { src, alt, position, ...(credit ? { credit } : {}) };
}
