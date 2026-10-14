import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import type { CatalogueCollection } from "@/types/firestore";
import { catalogueCollections } from "@/types/firestore";
import { getAdminFirestore } from "./admin";

// Fondation en lecture seule ; volontairement inutilisée par les pages publiques.
// Le SDK Admin contourne les règles : l’autorisation est donc vérifiée ici aussi.
export async function readAdminCatalogueDocument(collection: CatalogueCollection, id: string): Promise<Record<string, unknown> | null> {
  await requireAdmin();
  if (!catalogueCollections.includes(collection) || !id || id.includes("/") || id === "." || id === "..") throw new Error("Référence de catalogue invalide.");
  const snapshot = await getAdminFirestore().collection(collection).doc(id).get();
  // Données non validées : ne pas les convertir en modèle métier par assertion.
  // Les parseurs propres à chaque collection seront ajoutés lors de la migration.
  return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
}
