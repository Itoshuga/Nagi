import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { remapDemonstrationDestination } from "./migration-geography";
import { demonstrationContents, demonstrationRelations } from "./demo";
import { readManagedGeography } from "../geography/store";
import { ContentError, makeContent, parseContent, validatedGeographyKeys } from "./store";
import { contentDocumentSchema, relationBetween, type ManagedContent } from "./schema";
import type { GeographicReference } from "../../types/discoveries";

export async function importDemonstrationContents(db: Firestore, apply = false) {
  const geography = await readManagedGeography(db);
  function referenceFor(reference: GeographicReference): GeographicReference {
    const result = remapDemonstrationDestination(reference, geography);
    if (!result) throw new ContentError(`Destination absente ou ambiguë pour ${reference.kind}/${reference.id}. Rapprochez la géographie avant l’import.`, 409);
    return result;
  }
  // Les quatre anciennes collections étaient une fondation sans éditeur. En
  // présence de données personnalisées, refuser de les ignorer silencieusement.
  for (const collection of ["tourism", "activities", "food", "addresses"]) if (!(await db.collection(collection).limit(1).get()).empty) throw new ContentError(`La collection historique ${collection} contient des données. Préparez leur conversion vers contents avant cet import ; rien n’a été modifié.`, 409);
  const errors = new Set<string>();
  const source = demonstrationContents().map((entry) => ({ ...entry, input: { ...entry.input, destinations: entry.input.destinations.map((reference) => {
    try { return referenceFor(reference); } catch (error) { if (!(error instanceof ContentError)) throw error; errors.add(error.message); return reference; }
  }) } }));
  if (errors.size) throw new ContentError([...errors].join("\n"), 409);
  return db.runTransaction(async (transaction) => {
    const plan: { document: ManagedContent; create: boolean; reserve: boolean }[] = [];
    const mapping = new Map<string, ManagedContent>();
    for (const { original, input } of source) {
      const snapshot = await transaction.get(db.collection("contents").doc(original.id));
      const current = snapshot.exists ? parseContent(snapshot.id, snapshot.data()) : null;
      if (current && current.type !== input.type) throw new ContentError(`L’identifiant ${original.id} appartient à un autre univers. Aucun document modifié.`, 409);
      const matching = await transaction.get(db.collection("contents").where("type", "==", input.type).where("slug", "==", current?.slug ?? input.slug).limit(2));
      if (matching.size > 1 || snapshot.exists && matching.docs.some((doc) => doc.id !== snapshot.id)) throw new ContentError(`Adresse ambiguë pour ${original.title}. Aucun document modifié.`, 409);
      const existing = snapshot.exists ? snapshot : matching.docs[0];
      const document = existing?.exists ? parseContent(existing.id, existing.data()) : contentDocumentSchema.parse({ ...makeContent(input, original.id, await validatedGeographyKeys(db, transaction, input.destinations)), createdAt: new Date(original.createdAt).toISOString(), updatedAt: new Date(original.updatedAt).toISOString(), publishedAt: original.status === "published" ? new Date(original.createdAt).toISOString() : null });
      const reservation = await transaction.get(db.collection("contentSlugs").doc(`${document.type}:${document.slug}`));
      if (reservation.exists && reservation.data()?.contentId !== document.id) throw new ContentError(`Adresse réservée pour ${original.title}. Aucun document modifié.`, 409);
      plan.push({ document, create: !existing?.exists, reserve: !reservation.exists }); mapping.set(original.id, document);
    }
    const edges = [];
    for (const original of demonstrationRelations()) {
      const a = mapping.get(original.source.id); const b = mapping.get(original.target.id);
      if (!a || !b || a.type !== original.source.type || b.type !== original.target.type) throw new ContentError("Relation de migration incompatible.", 409);
      // Une fiche déjà administrée conserve ses choix de relations. Ne pas
      // rétablir une association retirée lors d’un réimport.
      if (!plan.find((entry) => entry.document.id === a.id)?.create || !plan.find((entry) => entry.document.id === b.id)?.create) continue;
      const edge = relationBetween(a, b)!;
      const existing = await transaction.get(db.collection("contentRelations").doc(edge.id));
      if (!existing.exists) edges.push(edge);
    }
    if (apply) {
      for (const entry of plan) {
        if (entry.create) transaction.create(db.collection("contents").doc(entry.document.id), entry.document);
        if (entry.reserve) transaction.create(db.collection("contentSlugs").doc(`${entry.document.type}:${entry.document.slug}`), { contentId: entry.document.id, type: entry.document.type, slug: entry.document.slug });
      }
      for (const edge of edges) transaction.create(db.collection("contentRelations").doc(edge.id), edge);
    }
    return { contents: plan.map(({ document, create }) => ({ id: document.id, title: document.title, type: document.type, action: create ? "create" : "keep" })), relations: edges.length };
  });
}
