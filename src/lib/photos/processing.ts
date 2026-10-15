import "server-only";
import sharp from "sharp";

export class PhotoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function photoByteLimit() {
  const size = Number(process.env.NAGI_PHOTO_MAX_BYTES ?? 5_000_000);
  if (!Number.isSafeInteger(size) || size < 100_000 || size > 25_000_000) throw new PhotoError("La limite des photographies n’est pas configurée correctement.", 503);
  return size;
}
export const photoMimeTypes = ["image/jpeg", "image/png", "image/webp"];
export async function optimizePhoto(bytes: Buffer) {
  if (bytes.length > photoByteLimit()) throw new PhotoError("Cette photographie dépasse la taille autorisée.", 413);
  try {
    const input = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning", animated: true });
    const meta = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new PhotoError("Utilisez une photographie JPEG, PNG ou WebP fixe.", 415);
    if (!meta.width || !meta.height || meta.width * meta.height > 40_000_000) throw new PhotoError("Les dimensions de cette photo dépassent la limite de 40 mégapixels.", 422);
    // autoOrient corrige l’EXIF ; sans withMetadata, aucune donnée EXIF/GPS
    // n’est recopiée dans les deux variantes publiques.
    let display = await input.clone().autoOrient().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 4 }).toBuffer({ resolveWithObject: true });
    // Garder aussi la réponse binaire sous la limite Vercel de 4,5 Mo,
    // y compris pour les photographies exceptionnellement complexes.
    if (display.data.length > 4_000_000) display = await input.clone().autoOrient().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (display.data.length > 4_000_000) throw new PhotoError("Cette photographie ne peut pas être optimisée sous la taille requise. Essayez une version moins grande.", 422);
    return { display };
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("Le fichier n’est pas une photographie valide, ou ses dimensions dépassent les limites.", 422);
  }
}
