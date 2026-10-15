import { z } from "zod";
import type { Photograph } from "../../types/content";

export const photoKinds = ["countries", "cities", "districts", "contents"] as const;
export const photoScopeSchema = z.object({ kind: z.enum(photoKinds), id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/).nullable(), draftId: z.uuid() }).strict();
export type PhotoScope = z.infer<typeof photoScopeSchema>;
const presentation = { alt: z.string().trim().min(1, "Décrivez la photographie.").max(400), focal: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict(), caption: z.string().max(600).default("") };
export const storagePhotoSchema = z.object({ kind: z.literal("storage"), id: z.uuid(), path: z.string().regex(/^entities\/(countries|cities|districts|contents)\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}\/display\.webp$/), variant: z.literal("display"), width: z.number().int().positive().max(2400), height: z.number().int().positive().max(2400), ...presentation }).strict();
export const photoReferenceSchema = z.discriminatedUnion("kind", [storagePhotoSchema, z.object({ kind: z.literal("local"), src: z.string().regex(/^\/images\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp|avif)$/), ...presentation }).strict()]);
// Compatibilité de lecture avec les documents de l’ancienne version.
export const legacyPhotosSchema = z.object({ cover: photoReferenceSchema.nullable(), gallery: z.array(photoReferenceSchema).max(12) }).strict();
export type PhotoReference = z.infer<typeof photoReferenceSchema>;
export type StoragePhoto = z.infer<typeof storagePhotoSchema>;
export type LegacyPhotos = z.infer<typeof legacyPhotosSchema>;
export function photoUrl(photo: PhotoReference) { return photo.kind === "local" ? photo.src : `/api/photos/${photo.id}/${photo.variant}`; }
export function presentPhoto(photo: PhotoReference): Photograph & { caption: string } {
  return { src: photoUrl(photo), alt: photo.alt, position: `${photo.focal.x}% ${photo.focal.y}%`, caption: photo.caption, ...(photo.kind === "storage" ? { width: photo.width, height: photo.height } : {}) };
}
// L’ancien champ photos est lu uniquement pour conserver les couvertures
// déjà enregistrées. Les nouveaux formulaires écrivent seulement coverPhoto.
export interface CoverDocument { coverPhoto?: StoragePhoto; photos?: LegacyPhotos }
export function coverReference(document?: CoverDocument | null) { return document?.coverPhoto ?? document?.photos?.cover ?? null; }
export function coverPhotograph(document: CoverDocument | null | undefined, legacy: Photograph | null = null): Photograph | null {
  if (document?.coverPhoto) return presentPhoto(document.coverPhoto);
  if (document?.photos) return document.photos.cover ? presentPhoto(document.photos.cover) : null;
  return legacy;
}
export function coverAssetIds(document?: CoverDocument | null) { const cover = coverReference(document); return cover?.kind === "storage" ? [cover.id] : []; }
export const coverUploadSchema = storagePhotoSchema.extend({ focal: z.object({ x: z.literal(50), y: z.literal(50) }).strict(), caption: z.literal("") });
// Les images protégées sont déjà optimisées. Le cache /_next/image ne doit pas
// continuer à servir une photographie après le passage de sa fiche en privé.
export { protectedPhoto } from "./urls";
