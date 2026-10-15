import "server-only";
import { PhotoError } from "../photos/processing";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { getAdminSession } from "../auth/session";
import { authJson, validateCsrf } from "../auth/http";
import { getAdminFirestore } from "../firebase/admin";
import { idSchema } from "../geography/schema";
import { universeSlugs } from "../../types/discoveries";
import { archiveContent, ContentError, listContents, saveContent } from "./store";
import { contentReferenceSchema, type ContentType } from "./schema";
import { invalidateContent } from "./invalidation";

const saveSchema = z.object({ data: z.unknown(), expectedRevision: z.number().int().positive().nullable(), relations: z.array(contentReferenceSchema).max(40) }).strict();
const archiveSchema = z.object({ operation: z.enum(["archive", "restore"]), expectedRevision: z.number().int().positive() }).strict();
async function body(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !request.body) throw new ContentError("La demande doit être au format JSON.", 415);
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 100000) { await reader.cancel(); throw new ContentError("La fiche est trop volumineuse.", 413); } parts.push(value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new ContentError("La demande est invalide."); }
}
function failure(error: unknown) {
  if (error instanceof PhotoError) return authJson({ error: error.message }, error.status);
    if (error instanceof ContentError) return authJson({ error: error.message, fields: error.fields }, error.status);
  if (error instanceof z.ZodError) return authJson({ error: "La demande est invalide. Rechargez le formulaire." }, 422);
  return authJson({ error: "Les découvertes sont momentanément indisponibles. Vérifiez la configuration du projet avant de réessayer." }, 503);
}
export async function contentMutation(request: NextRequest, id?: string) {
  const session = await getAdminSession();
  if (session.status !== "authorized") return authJson({ error: "Une session administrateur est nécessaire." }, session.status === "denied" ? 403 : session.status === "unavailable" ? 503 : 401);
  if (!validateCsrf(request)) return authJson({ error: "La demande a expiré. Réessayez." }, 403);
  try {
    if (id && !idSchema.safeParse(id).success) throw new ContentError("Référence invalide.", 404);
    if (request.method === "DELETE") throw new ContentError("La suppression définitive est désactivée. Archivez cette fiche pour conserver ses relations.", 409);
    const payload = await body(request); const db = getAdminFirestore();
    const result = id && request.method === "POST" ? await (async () => { const input = archiveSchema.parse(payload); return archiveContent(db, id, input.operation === "archive", input.expectedRevision); })() : await (async () => {
      const input = saveSchema.parse(payload);
      if (Boolean(id) !== Boolean(input.expectedRevision)) throw new ContentError("Version de fiche invalide.");
      return saveContent(db, id ?? null, input.data, input.expectedRevision, input.relations, session.user.uid);
    })();
    // La sauvegarde reste réussie même si une invalidation secondaire échoue.
    try { await invalidateContent(result.document, result.previous); } catch { /* Lectures sans cache persistant. */ }
    try { if ("related" in result) for (const related of result.related) {
      // Inclut les anciennes relations retirées, absentes de la nouvelle requête.
      const snapshot = await db.collection("contents").doc(related.id).get().catch(() => null);
      const data = snapshot?.data(); if (data) { const { revalidatePath } = await import("next/cache"); revalidatePath(`/decouvertes/${data.type}/${data.slug}`); }
    } } catch { /* Une écriture réussie ne doit pas être présentée comme échouée. */ }
    return authJson({ success: true, content: result.document }, id ? 200 : 201);
  } catch (error) { return failure(error); }
}
export async function contentSearch(request: NextRequest) {
  const session = await getAdminSession();
  if (session.status !== "authorized") return authJson({ error: "Une session administrateur est nécessaire." }, session.status === "denied" ? 403 : 401);
  try {
    const query = request.nextUrl.searchParams; const type = query.get("type") || undefined;
    if (type && !(universeSlugs as readonly string[]).includes(type)) throw new ContentError("Type de fiche invalide.");
    const result = await listContents(getAdminFirestore(), { type: type as ContentType | undefined, q: (query.get("q") ?? "").slice(0, 120), cursor: query.get("cursor") ?? undefined });
    return authJson({ items: result.documents.map((item) => ({ id: item.id, type: item.type, title: item.title, status: item.status })), nextCursor: result.nextCursor });
  } catch (error) { return failure(error); }
}
