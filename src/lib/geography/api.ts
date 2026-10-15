import "server-only";
import { PhotoError } from "../photos/processing";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { authJson, validateCsrf } from "../auth/http";
import { getAdminSession } from "../auth/session";
import { getAdminFirestore, FirebaseConfigurationError } from "../firebase/admin";
import { archiveManagedDestination, GeographyError, readManagedGeography, saveManagedDestination } from "./store";
import { destinationKinds, idSchema, type DestinationKind } from "./schema";
import { invalidateDestination } from "./invalidation";

const saveBody = z.object({ data: z.unknown(), expectedRevision: z.number().int().positive().nullable() }).strict();
const archiveBody = z.object({ operation: z.enum(["archive", "restore"]), expectedRevision: z.number().int().positive() }).strict();
async function limitedBody(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new GeographyError("Format de demande invalide.", 415);
  if (Number(request.headers.get("content-length")) > 100_000 || !request.body) throw new GeographyError("La demande est trop volumineuse ou vide.", 413);
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 100_000) { await reader.cancel(); throw new GeographyError("La demande est trop volumineuse.", 413); } parts.push(value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new GeographyError("La demande est invalide."); }
}
export async function geographyMutation(request: NextRequest, params: { kind: string; id?: string }) {
  const session = await getAdminSession();
  if (session.status !== "authorized") return authJson({ error: session.status === "denied" ? "Ce compte n’est pas administrateur." : "Ouvrez une session administrateur pour continuer." }, session.status === "unavailable" ? 503 : session.status === "denied" ? 403 : 401);
  if (!validateCsrf(request)) return authJson({ error: "La demande a expiré. Veuillez réessayer." }, 403);
  try {
    if (!(destinationKinds as readonly string[]).includes(params.kind) || (params.id && !idSchema.safeParse(params.id).success)) throw new GeographyError("Destination invalide.", 404);
    const kind = params.kind as DestinationKind;
    if (request.method === "DELETE") throw new GeographyError("La suppression définitive est désactivée pour protéger les villes, quartiers et contenus associés. Vous pouvez archiver cette destination sans perdre ses données.", 409);
    const body = await limitedBody(request);
    const db = getAdminFirestore();
    let result;
    if (request.method === "POST" && params.id) {
      const input = archiveBody.parse(body);
      result = await archiveManagedDestination(db, kind, params.id, input.operation === "archive", input.expectedRevision);
    } else {
      const input = saveBody.parse(body);
      if ((params.id && !input.expectedRevision) || (!params.id && input.expectedRevision !== null)) throw new GeographyError("Version de destination invalide.");
      result = await saveManagedDestination(db, kind, params.id ?? null, input.data, input.expectedRevision, session.user.uid);
    }
    // La transaction est terminée : une erreur de relecture / invalidation ne doit
    // pas transformer une sauvegarde réussie en erreur qui inviterait à la dupliquer.
    try { invalidateDestination(result.document, await readManagedGeography(db), result.previous); } catch { /* Les lectures publiques sont déjà sans cache persistant. */ }
    return authJson({ destination: result.document, success: true }, params.id ? 200 : 201);
  } catch (error) {
    if (error instanceof PhotoError) return authJson({ error: error.message }, error.status);
    if (error instanceof GeographyError) return authJson({ error: error.message, fields: error.fields }, error.status);
    if (error instanceof z.ZodError) return authJson({ error: "La demande est invalide. Rechargez le formulaire." }, 422);
    if (error instanceof FirebaseConfigurationError) return authJson({ error: "La connexion aux destinations n’est pas configurée." }, 503);
    return authJson({ error: "Les destinations sont momentanément indisponibles. Veuillez réessayer." }, 503);
  }
}
