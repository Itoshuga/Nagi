import "server-only";
import { z } from "zod";
import { after, type NextRequest } from "next/server";
import { authJson, validateCsrf } from "../auth/http";
import { getAdminSession } from "../auth/session";
import { getAdminFirestore, getAdminStorage } from "../firebase/admin";
import { beginPhotoUpload, finishPhotoUpload, readOwnedAsset } from "./assets";
import { PhotoError, photoByteLimit } from "./processing";
import { photoScopeSchema } from "./schema";

async function readBytes(request: NextRequest, limit: number) {
  if (!request.body || Number(request.headers.get("content-length")) > limit) throw new PhotoError("Le fichier ou la demande est trop volumineux.", 413);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new PhotoError("La taille autorisée est dépassée.", 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
const beginSchema = z.object({ scope: photoScopeSchema, mime: z.string().max(100), bytes: z.number().int().positive() }).strict();
export async function photoMutation(request: NextRequest, id?: string, operation?: string) {
  const session = await getAdminSession();
  if (session.status !== "authorized") return authJson({ error: "Une session administrateur est nécessaire." }, session.status === "denied" ? 403 : session.status === "unavailable" ? 503 : 401);
  if (!validateCsrf(request)) return authJson({ error: "La demande a expiré. Réessayez." }, 403);
  try {
    if (id && !z.uuid().safeParse(id).success) throw new PhotoError("Import introuvable.", 404);
    if (!id) {
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PhotoError("Demande invalide.", 415);
      const input = beginSchema.parse(JSON.parse((await readBytes(request, 8000)).toString()));
      const ticket = await beginPhotoUpload(session.user.uid, input.scope, input.mime, input.bytes);
      after(async () => { try { const { cleanupPhotos } = await import("./cleanup"); await cleanupPhotos(getAdminFirestore(), getAdminStorage(), true, new Date().toISOString(), 5); } catch { /* Repris par la tâche quotidienne et le CLI. */ } });
      return authJson(ticket, 201);
    }
    if (operation === "finalize") return authJson({ photo: await finishPhotoUpload(id, session.user.uid) }, 200);
    if (operation === "upload" && request.method === "PUT" && process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true") {
      const asset = await readOwnedAsset(id, session.user.uid);
      if (asset.state !== "uploading") throw new PhotoError("Cet import est déjà terminé.", 409);
      const bytes = await readBytes(request, photoByteLimit());
      if (bytes.length !== asset.declaredBytes) throw new PhotoError("Le fichier est incomplet.", 422);
      await getAdminStorage().bucket().file(asset.original).save(bytes, { resumable: false, contentType: asset.mime, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { cacheControl: "private, no-store" } });
      return authJson({ success: true }, 200);
    }
    throw new PhotoError("Opération inconnue.", 404);
  } catch (error) {
    if (error instanceof PhotoError) return authJson({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return authJson({ error: "Les informations de l’import sont invalides." }, 422);
    return authJson({ error: "L’importation est indisponible. Vérifiez la configuration Storage." }, 503);
  }
}
