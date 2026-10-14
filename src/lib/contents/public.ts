import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { discoveries } from "../../data/discoveries";
import { getAdminFirestore } from "../firebase/admin";
import { getPublicGeography, geographySource } from "../geography/public";
import { getDiscoveriesForDestination, getDiscoveryBySlug, visibleDiscoveryCatalogue } from "../discoveries";
import { listContents, parseContent, readRelatedContents } from "./store";
import { toPublicContent, visibleContent } from "./presentation";
import { contentKey } from "./schema";
import type { Discovery, LocalDestination, UniverseSlug } from "../../types/discoveries";
import type { PublicGeography } from "../../types/destinations";

export function contentSource() {
  const source = process.env.NAGI_CONTENT_SOURCE ?? "static";
  if (source !== "static" && source !== "firestore") throw new Error("NAGI_CONTENT_SOURCE doit valoir static ou firestore.");
  if (source === "firestore" && geographySource() !== "firestore") throw new Error("Activez la géographie Firestore avant le catalogue de fiches.");
  return source;
}
// Les données et leur visibilité ne persistent pas entre les requêtes : une
// dépublication parentale prend effet immédiatement. React déduplique le rendu.
export async function loadPublicContent(universe: string, slug: string, geography: PublicGeography) {
  if (contentSource() === "static") return getDiscoveryBySlug(universe, slug, visibleDiscoveryCatalogue(geography));
  const snapshot = await getAdminFirestore().collection("contents").where("type", "==", universe).where("slug", "==", slug).limit(1).get();
  const first = snapshot.docs[0]; if (!first) return undefined;
  const item = parseContent(first.id, first.data());
  return visibleContent(item, geography) ? toPublicContent(item, geography) : undefined;
}
export const getPublicContent = cache(async (universe: string, slug: string) => { await connection(); return loadPublicContent(universe, slug, await getPublicGeography()); });
export const getPublicContentBundle = cache(async (universe: string, slug: string) => {
  const geography = await getPublicGeography(); const item = await getPublicContent(universe, slug);
  if (!item) return { item, catalogue: [] as Discovery[] };
  if (contentSource() === "static") return { item, catalogue: visibleDiscoveryCatalogue(geography, discoveries) };
  const db = getAdminFirestore(); const related = await readRelatedContents(db, { type: item.universe, id: item.id });
  const visible = related.contents.filter((entry) => visibleContent(entry, geography));
  const visibleKeys = new Set([`${item.universe}:${item.id}`, ...visible.map(contentKey)]);
  const edges = related.relations.filter((edge) => edge.memberKeys.every((key) => visibleKeys.has(key)));
  const currentSnapshot = await db.collection("contents").doc(item.id).get();
  if (!currentSnapshot.exists) return { item: undefined, catalogue: [] as Discovery[] };
  const current = parseContent(item.id, currentSnapshot.data());
  if (!visibleContent(current, geography)) return { item: undefined, catalogue: [] as Discovery[] };
  const projected = toPublicContent(current, geography, edges);
  return { item: projected, catalogue: [projected, ...visible.map((entry) => toPublicContent(entry, geography, edges))] };
});
export async function getDestinationContents(scope: LocalDestination, universe: UniverseSlug, cursor?: string) {
  const geography = await getPublicGeography();
  if (contentSource() === "static") return { items: getDiscoveriesForDestination(scope, universe, visibleDiscoveryCatalogue(geography), geography), nextCursor: null };
  const result = await listContents(getAdminFirestore(), { type: universe, geo: `${scope.kind}:${scope.id}`, cursor }, true);
  return { items: result.documents.filter((item) => visibleContent(item, geography)).map((item) => toPublicContent(item, geography)), nextCursor: result.nextCursor };
}
