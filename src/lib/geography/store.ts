import "server-only";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { geographicCover } from "../../data/geographic-covers";
import { decodeDestinationDocument } from "./documents";
import { destinationDocumentSchema, destinationInputSchema, destinationParentId, slugReservationId, type DestinationKind, type ManagedDestination, type ManagedGeography } from "./schema";

export class GeographyError extends Error {
  constructor(message: string, public readonly status = 400, public readonly fields?: Record<string, string>) { super(message); }
}
export function parseDestination(kind: DestinationKind, id: string, data: unknown): ManagedDestination {
  const document = decodeDestinationDocument(kind, id, data);
  if (!document) throw new GeographyError(`La destination ${kind}/${id} utilise un format incompatible. Vérifiez ses données avant de continuer.`, 503);
  return document;
}
export async function readManagedGeography(db: Firestore, publicOnly = false): Promise<ManagedGeography> {
  const kinds = ["countries", "cities", "districts"] as const;
  const values = await Promise.all(kinds.map(async (kind) => {
    const collection = db.collection(kind);
    const snapshot = await (publicOnly ? collection.where("status", "==", "published").where("visibility", "==", "public").where("archivedAt", "==", null) : collection).get();
    return snapshot.docs.map((document) => parseDestination(kind, document.id, document.data()));
  }));
  const all = values.flat();
  return {
    countries: all.filter((item) => item.kind === "countries"), cities: all.filter((item) => item.kind === "cities"), districts: all.filter((item) => item.kind === "districts"),
  };
}

// Module interne serveur : seules l’API autorisée et la migration de confiance
// appellent les transactions. Aucun appel direct depuis un composant client.
export async function saveManagedDestination(db: Firestore, kind: DestinationKind, id: string | null, raw: unknown, expectedRevision: number | null) {
  const parsed = destinationInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    throw new GeographyError("Vérifiez les champs indiqués.", 422, fields);
  }
  const input = parsed.data;
  if (input.kind !== kind) throw new GeographyError("Type de destination invalide.");
  if (input.coverImage && !geographicCover(input.coverImage)) throw new GeographyError("Choisissez une photographie de la bibliothèque existante.", 422, { coverImage: "Cette photographie n’est pas disponible." });
  const reference = db.collection(kind).doc(id ?? randomUUID());
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (id && !existing.exists) throw new GeographyError("Cette destination n’existe plus.", 404);
    const previous = existing.exists ? parseDestination(kind, reference.id, existing.data()) : null;
    if (previous && expectedRevision !== previous.revision) throw new GeographyError("Cette destination a été modifiée ailleurs. Rechargez la page avant de réessayer.", 409);
    if (previous?.archivedAt) throw new GeographyError("Restaurez cette destination avant de la modifier.", 409);
    if (previous && destinationParentId(input) !== destinationParentId(previous)) throw new GeographyError("Le déplacement d’une destination n’est pas disponible.", 409);
    if (previous?.publishedAt && input.slug !== previous.slug) throw new GeographyError("L’adresse d’une destination déjà publiée est protégée.", 409, { slug: "Cette adresse a déjà été publiée et ne peut plus être modifiée." });
    const parentId = destinationParentId(input);
    if (parentId) {
      const parentKind = kind === "cities" ? "countries" : "cities";
      const parentSnapshot = await transaction.get(db.collection(parentKind).doc(parentId));
      if (!parentSnapshot.exists || parseDestination(parentKind, parentId, parentSnapshot.data()).archivedAt) throw new GeographyError("La destination parente est introuvable ou archivée.", 422, { [kind === "cities" ? "countryId" : "cityId"]: "Choisissez une destination parente active." });
    }
    const reservation = db.collection("geographySlugs").doc(slugReservationId(input));
    const reserved = await transaction.get(reservation);
    let duplicates = db.collection(kind).where("slug", "==", input.slug);
    if (kind === "cities") duplicates = duplicates.where("countryId", "==", parentId);
    if (kind === "districts") duplicates = duplicates.where("cityId", "==", parentId);
    const matches = await transaction.get(duplicates);
    if ((reserved.exists && reserved.data()?.destinationId !== reference.id) || matches.docs.some((document) => document.id !== reference.id)) throw new GeographyError("Cette adresse est déjà utilisée dans cette destination.", 409, { slug: "Choisissez une autre adresse URL." });
    const oldReservation = previous && previous.slug !== input.slug ? db.collection("geographySlugs").doc(slugReservationId(previous)) : null;
    const oldReserved = oldReservation ? await transaction.get(oldReservation) : null;
    const now = new Date().toISOString();
    const editorial = previous?.editorial ? { ...previous.editorial } : null;
    if (editorial && previous && input.coverImage !== (previous.coverImage?.src ?? "")) {
      delete editorial.featurePhotograph; delete editorial.discoveryPhotograph;
    }
    if (editorial && previous && input.name !== previous.name) editorial.caption = input.name;
    const document = destinationDocumentSchema.parse({ ...input, id: reference.id, schemaVersion: 1, locale: "fr", coverImage: geographicCover(input.coverImage), editorial,
      createdAt: previous?.createdAt ?? now, updatedAt: now, publishedAt: previous?.publishedAt ?? (input.status === "published" ? now : null), archivedAt: null, revision: (previous?.revision ?? 0) + 1,
    });
    transaction.set(reference, document);
    transaction.set(reservation, { destinationId: document.id, kind, parentId, slug: document.slug });
    if (oldReservation && oldReserved?.data()?.destinationId === reference.id) transaction.delete(oldReservation);
    return { document, previous };
  });
}

export async function archiveManagedDestination(db: Firestore, kind: DestinationKind, id: string, archived: boolean, expectedRevision: number) {
  const reference = db.collection(kind).doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new GeographyError("Destination introuvable.", 404);
    const previous = parseDestination(kind, id, snapshot.data());
    if (previous.revision !== expectedRevision) throw new GeographyError("Cette destination a changé. Rechargez la page.", 409);
    const now = new Date().toISOString();
    const document = { ...previous, status: "draft" as const, archivedAt: archived ? now : null, updatedAt: now, revision: previous.revision + 1 };
    transaction.set(reference, document);
    // La réservation reste en place, y compris pendant l’archivage.
    return { document, previous };
  });
}
