import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { demonstrationDestinations } from "./demo";
import { destinationParentId, slugReservationId } from "./schema";
import { GeographyError, parseDestination } from "./store";

export async function importDemonstrationGeography(db: Firestore, apply = false) {
  const source = demonstrationDestinations();
  return db.runTransaction(async (transaction) => {
    const plan = [];
    // Toutes les lectures précèdent toutes les écritures. La transaction unique
    // garde les dix destinations et leurs réservations cohérentes ensemble.
    for (const original of source) {
      const reference = db.collection(original.kind).doc(original.id);
      const snapshot = await transaction.get(reference);
      const document = snapshot.exists ? parseDestination(original.kind, original.id, snapshot.data()) : original;
      const reservation = db.collection("geographySlugs").doc(slugReservationId(document));
      const reserved = await transaction.get(reservation);
      const parentId = destinationParentId(document);
      let duplicateQuery = db.collection(document.kind).where("slug", "==", document.slug);
      if (document.kind === "cities") duplicateQuery = duplicateQuery.where("countryId", "==", document.countryId);
      if (document.kind === "districts") duplicateQuery = duplicateQuery.where("cityId", "==", document.cityId);
      const duplicates = await transaction.get(duplicateQuery);
      if ((reserved.exists && reserved.data()?.destinationId !== document.id) || duplicates.docs.some((entry) => entry.id !== document.id)) throw new GeographyError(`Conflit d’adresse pour ${document.name}. Aucun document n’a été modifié.`, 409);
      if (parentId && !source.some((entry) => entry.id === parentId)) {
        const parentKind = document.kind === "cities" ? "countries" : "cities";
        const parent = await transaction.get(db.collection(parentKind).doc(parentId));
        if (!parent.exists) throw new GeographyError(`Le parent de ${document.name} est introuvable.`, 409);
        parseDestination(parentKind, parentId, parent.data());
      }
      plan.push({ reference, reservation, document, create: !snapshot.exists, reserve: !reserved.exists });
    }
    if (apply) for (const entry of plan) {
      if (entry.create) transaction.create(entry.reference, entry.document);
      if (entry.reserve) transaction.create(entry.reservation, { destinationId: entry.document.id, kind: entry.document.kind, parentId: destinationParentId(entry.document), slug: entry.document.slug });
    }
    return plan.map(({ document, create, reserve }) => ({ id: document.id, name: document.name, collection: document.kind, action: create ? "create" : "keep", reservation: reserve ? "create" : "keep" }));
  });
}
