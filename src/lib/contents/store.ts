import "server-only";
import { randomUUID } from "node:crypto";
import { FieldPath, type Firestore, type Query, type Transaction } from "firebase-admin/firestore";
import { contentCover } from "../../data/content-covers";
import { normalizeSearch } from "../discovery-filter";
import { parseDestination } from "../geography/store";
import { contentDocumentSchema, contentInputSchema, contentKey, relationBetween, relationSchema, type ContentInput, type ContentReference, type ContentRelation, type ContentType, type ManagedContent } from "./schema";
import type { GeographicReference } from "../../types/discoveries";

export const PAGE_SIZE = 24;
export const MAX_RELATIONS = 40;
export class ContentError extends Error {
  constructor(message: string, public status = 400, public fields?: Record<string, string>) { super(message); }
}
export function parseContent(id: string, raw: unknown) {
  const result = contentDocumentSchema.safeParse(raw);
  if (!result.success || result.data.id !== id) throw new ContentError(`La fiche contents/${id} utilise un format incompatible. Vérifiez la migration.`, 503);
  return result.data;
}
export async function readContent(db: Firestore, id: string) {
  const snapshot = await db.collection("contents").doc(id).get();
  return snapshot.exists ? parseContent(id, snapshot.data()) : null;
}
export function relationOther(relation: ContentRelation, item: ContentReference) { return contentKey(relation.source) === contentKey(item) ? relation.target : relation.source; }
export async function readRelations(db: Firestore, item: ContentReference) {
  const snapshot = await db.collection("contentRelations").where("memberKeys", "array-contains", contentKey(item)).limit(MAX_RELATIONS + 1).get();
  if (snapshot.size > MAX_RELATIONS) throw new ContentError("Cette fiche dépasse la limite de 40 relations. Vérifiez ses associations.", 503);
  return snapshot.docs.map((document) => relationSchema.parse(document.data()));
}
export async function readRelatedContents(db: Firestore, item: ContentReference) {
  const relations = await readRelations(db, item);
  if (!relations.length) return { relations, contents: [] as ManagedContent[] };
  const snapshots = await db.getAll(...relations.map((relation) => db.collection("contents").doc(relationOther(relation, item).id)));
  return { relations, contents: snapshots.flatMap((snapshot) => snapshot.exists ? [parseContent(snapshot.id, snapshot.data())] : []) };
}

export interface ContentFilters { type?: ContentType; status?: "draft" | "published"; archived?: boolean; q?: string; geo?: string; cursor?: string }
function fingerprint(filters: ContentFilters) { return JSON.stringify([filters.type ?? "", filters.status ?? "", Boolean(filters.archived), normalizeSearch(filters.q ?? "").slice(0, 120), filters.geo ?? ""]); }
export async function listContents(db: Firestore, filters: ContentFilters, publicOnly = false) {
  let query: Query = db.collection("contents").where("isArchived", "==", Boolean(filters.archived));
  if (filters.type) query = query.where("type", "==", filters.type);
  if (filters.status || publicOnly) query = query.where("status", "==", publicOnly ? "published" : filters.status);
  if (publicOnly) query = query.where("visibility", "==", "public");
  if (filters.geo) query = query.where("geographyKeys", "array-contains", filters.geo);
  const q = normalizeSearch(filters.q ?? "").slice(0, 120);
  if (q) query = query.where("searchTitle", ">=", q).where("searchTitle", "<=", `${q}\uf8ff`);
  query = query.orderBy("searchTitle").orderBy(FieldPath.documentId());
  if (filters.cursor) {
    try {
      if (filters.cursor.length > 2500) throw new Error();
      const cursor = JSON.parse(Buffer.from(filters.cursor, "base64url").toString());
      if (cursor.f !== fingerprint(filters) || typeof cursor.title !== "string" || typeof cursor.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor.id)) throw new Error();
      query = query.startAfter(cursor.title, cursor.id);
    } catch { throw new ContentError("Cette page de résultats a expiré. Réinitialisez les filtres."); }
  }
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const documents = snapshot.docs.slice(0, PAGE_SIZE).map((doc) => parseContent(doc.id, doc.data()));
  const last = documents.at(-1);
  return { documents, nextCursor: snapshot.size > PAGE_SIZE && last ? Buffer.from(JSON.stringify({ f: fingerprint(filters), title: last.searchTitle, id: last.id })).toString("base64url") : null };
}

// Les clés d’agrégation proviennent exclusivement des parents validés, jamais du navigateur.
export async function validatedGeographyKeys(db: Firestore, transaction: Transaction, references: ContentInput["destinations"]) {
  const keys = new Set<string>();
  for (const reference of references) {
    let current: GeographicReference | null = reference;
    while (current) {
      const kind = current.kind === "country" ? "countries" : current.kind === "city" ? "cities" : "districts";
      const snapshot = await transaction.get(db.collection(kind).doc(current.id));
      if (!snapshot.exists) throw new ContentError("Une destination sélectionnée n’existe plus.", 422, { destinations: "Choisissez une destination existante." });
      const destination = parseDestination(kind, current.id, snapshot.data());
      if (destination.archivedAt) throw new ContentError("Une destination sélectionnée ou son parent est archivé.", 422, { destinations: "Choisissez une destination active." });
      keys.add(`${current.kind}:${current.id}`);
      current = destination.kind === "countries" ? null : destination.kind === "cities" ? { kind: "country", id: destination.countryId } : { kind: "city", id: destination.cityId };
    }
  }
  return [...keys].sort();
}
export function makeContent(input: ContentInput, id: string, geographyKeys: string[], previous?: ManagedContent | null): ManagedContent {
  const now = new Date().toISOString();
  return contentDocumentSchema.parse({ ...input, id, schemaVersion: 1, locale: "fr", geographyKeys, searchTitle: normalizeSearch(input.title), createdAt: previous?.createdAt ?? now, updatedAt: now, publishedAt: previous?.publishedAt ?? (input.status === "published" ? now : null), archivedAt: null, isArchived: false, revision: (previous?.revision ?? 0) + 1 });
}
export async function saveContent(db: Firestore, id: string | null, raw: unknown, expectedRevision: number | null, selections: ContentReference[]) {
  const parsed = contentInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] ??= issue.message;
    throw new ContentError("Vérifiez les champs indiqués.", 422, fields);
  }
  const input = parsed.data;
  for (const image of [input.coverImage, ...input.images].filter(Boolean)) if (!contentCover(image)) throw new ContentError("Choisissez une image de la bibliothèque existante.", 422, { coverImage: "Cette image n’est pas disponible." });
  const reference = db.collection("contents").doc(id ?? randomUUID());
  const self = { id: reference.id, type: input.type };
  const desired = selections.map((target) => relationBetween(self, target));
  if (desired.some((relation) => !relation) || new Set(desired.map((relation) => relation!.id)).size !== desired.length || selections.length > MAX_RELATIONS) throw new ContentError("Relations incompatibles, en double ou trop nombreuses.", 422, { relations: "Sélectionnez des fiches compatibles, sans doublon (40 maximum)." });
  const edges = desired as ContentRelation[];
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (id && !existing.exists) throw new ContentError("Cette fiche n’existe plus.", 404);
    const previous = existing.exists ? parseContent(reference.id, existing.data()) : null;
    if (previous && previous.revision !== expectedRevision) throw new ContentError("Cette fiche ou ses relations ont changé. Rechargez avant d’enregistrer.", 409);
    if (previous?.isArchived) throw new ContentError("Restaurez cette fiche avant de la modifier.", 409);
    if (previous && previous.type !== input.type) throw new ContentError("Le type d’une fiche ne peut pas être modifié.", 409);
    if (previous?.publishedAt && previous.slug !== input.slug) throw new ContentError("L’adresse d’une fiche déjà publiée est protégée.", 409, { slug: "Conservez l’adresse publiée." });
    const geographyKeys = await validatedGeographyKeys(db, transaction, input.destinations);
    const reservation = db.collection("contentSlugs").doc(`${input.type}:${input.slug}`);
    const reserved = await transaction.get(reservation);
    const duplicates = await transaction.get(db.collection("contents").where("type", "==", input.type).where("slug", "==", input.slug).limit(2));
    if (reserved.exists && reserved.data()?.contentId !== reference.id || duplicates.docs.some((doc) => doc.id !== reference.id)) throw new ContentError("Cette adresse existe déjà dans cet univers.", 409, { slug: "Choisissez une autre adresse." });
    const oldReservation = previous && previous.slug !== input.slug ? db.collection("contentSlugs").doc(`${previous.type}:${previous.slug}`) : null;
    const oldReserved = oldReservation ? await transaction.get(oldReservation) : null;
    const oldSnapshot = await transaction.get(db.collection("contentRelations").where("memberKeys", "array-contains", contentKey(self)).limit(MAX_RELATIONS + 1));
    if (oldSnapshot.size > MAX_RELATIONS) throw new ContentError("Cette fiche dépasse la limite de relations.", 409);
    const oldEdges = oldSnapshot.docs.map((doc) => relationSchema.parse(doc.data()));
    const neighbors = new Map([...oldEdges, ...edges].map((edge) => { const other = relationOther(edge, self); return [contentKey(other), other]; }));
    const changedNeighbors: ManagedContent[] = [];
    for (const neighbor of neighbors.values()) {
      const target = await transaction.get(db.collection("contents").doc(neighbor.id));
      const selected = edges.filter((edge) => edge.memberKeys.includes(contentKey(neighbor)));
      if (!target.exists) { if (selected.length) throw new ContentError("Une fiche associée n’existe plus.", 422, { relations: "Retirez la relation introuvable." }); else continue; }
      const targetData = parseContent(target.id, target.data());
      if (targetData.type !== neighbor.type) throw new ContentError("Le type de la fiche associée est incompatible.", 422);
      const unchanged = oldEdges.some((edge) => selected.some((value) => value.id === edge.id));
      if (targetData.isArchived && selected.length && !unchanged) throw new ContentError("Une fiche archivée ne peut pas être ajoutée aux relations.", 422, { relations: "Choisissez une fiche active." });
      const incoming = await transaction.get(db.collection("contentRelations").where("memberKeys", "array-contains", contentKey(neighbor)).limit(MAX_RELATIONS + 1));
      const planned = [...incoming.docs.map((doc) => relationSchema.parse(doc.data())).filter((edge) => !edge.memberKeys.includes(contentKey(self))), ...selected];
      if (planned.length > MAX_RELATIONS) throw new ContentError("Une fiche associée atteint déjà la limite de 40 relations.", 409);
      for (const activity of [self, neighbor].filter((value) => value.type === "activites")) {
        const activityEdges = activity.id === self.id ? edges : planned;
        for (const venueType of ["tourisme", "adresses"]) if (activityEdges.filter((edge) => edge.kind === "hosts" && edge.target.type === venueType).length > 1) throw new ContentError("Une activité accepte un lieu touristique et un établissement organisateur au maximum. Retirez d’abord l’ancienne association.", 422, { relations: "Conservez un lieu et un organisateur au maximum par activité." });
      }
      if (selected.length !== oldEdges.filter((edge) => edge.memberKeys.includes(contentKey(neighbor))).length) changedNeighbors.push(targetData);
    }
    const document = makeContent(input, reference.id, geographyKeys, previous);
    transaction.set(reference, document);
    transaction.set(reservation, { contentId: document.id, type: document.type, slug: document.slug });
    if (oldReservation && oldReserved?.data()?.contentId === document.id) transaction.delete(oldReservation);
    for (const edge of oldEdges) if (!edges.some((value) => value.id === edge.id)) transaction.delete(db.collection("contentRelations").doc(edge.id));
    for (const edge of edges) transaction.set(db.collection("contentRelations").doc(edge.id), edge);
    // Une édition depuis l’autre côté invalide également le formulaire ouvert.
    for (const neighbor of changedNeighbors) transaction.update(db.collection("contents").doc(neighbor.id), { revision: neighbor.revision + 1, updatedAt: document.updatedAt });
    return { document, previous, related: [...neighbors.values()] };
  });
}
export async function archiveContent(db: Firestore, id: string, archived: boolean, revision: number) {
  return db.runTransaction(async (transaction) => {
    const reference = db.collection("contents").doc(id); const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new ContentError("Fiche introuvable.", 404);
    const previous = parseContent(id, snapshot.data());
    if (previous.revision !== revision) throw new ContentError("Cette fiche a changé. Rechargez la page.", 409);
    const now = new Date().toISOString();
    const document: ManagedContent = { ...previous, status: "draft", archivedAt: archived ? now : null, isArchived: archived, revision: revision + 1, updatedAt: now };
    transaction.set(reference, document);
    return { document, previous };
  });
}
