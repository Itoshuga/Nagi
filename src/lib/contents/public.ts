import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import type { Discovery, LocalDestination, UniverseSlug } from "../../types/discoveries";
import { getAdminFirestore } from "../firebase/admin";
import { geographyForReferences } from "../geography/repository";
import { publicRead } from "../public-data/errors";
import { belongsToDestination, resolveGeography } from "../discovery-geography";
import { isUniverse } from "../discoveries";
import { contentKey } from "./schema";
import { ContentError, PAGE_SIZE, listContents, parseContent, readRelatedContents } from "./store";
import { toPublicContent, visibleContent } from "./presentation";

const readPublished = cache(async (universe: string, slug: string) => {
  if (!isUniverse(universe) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const snapshot = await getAdminFirestore().collection("contents").where("type", "==", universe).where("slug", "==", slug)
    .where("status", "==", "published").where("visibility", "==", "public").where("isArchived", "==", false).limit(2).get();
  if (snapshot.size > 1) throw new Error("Duplicate content slug");
  return snapshot.empty ? null : parseContent(snapshot.docs[0].id, snapshot.docs[0].data());
});
export async function loadPublicContent(universe: string, slug: string) {
  return publicRead("contents.detail", async () => {
    const current = await readPublished(universe, slug);
    if (!current) return undefined;
    const geography = await geographyForReferences(getAdminFirestore(), current.destinations);
    return visibleContent(current, geography) ? toPublicContent(current, geography) : undefined;
  });
}
export const getPublicContent = cache(async (universe: string, slug: string) => { await connection(); return loadPublicContent(universe, slug); });
export const getPublicContentBundle = cache(async (universe: string, slug: string) => {
  await connection();
  return publicRead("contents.relations", async () => {
    const db = getAdminFirestore(); const current = await readPublished(universe, slug);
    const empty = { item: undefined, catalogue: [] as Discovery[], geography: { countries: [], cities: [], districts: [] } };
    if (!current) return empty;
    const related = await readRelatedContents(db, current);
    const geography = await geographyForReferences(db, [current, ...related.contents].flatMap((entry) => entry.destinations));
    if (!visibleContent(current, geography)) return empty;
    const visible = related.contents.filter((entry) => visibleContent(entry, geography));
    const visibleKeys = new Set([contentKey(current), ...visible.map(contentKey)]);
    const edges = related.relations.filter((edge) => edge.memberKeys.every((key) => visibleKeys.has(key)));
    const item = toPublicContent(current, geography, edges);
    return { item, geography, catalogue: [item, ...visible.map((entry) => toPublicContent(entry, geography, edges))] };
  });
});
export async function getDestinationContents(scope: LocalDestination, universe: UniverseSlug, cursor?: string, q?: string) {
  await connection();
  return publicRead("contents.location", async () => {
    const db = getAdminFirestore();
    const items: Discovery[] = [];
    let nextCursor: string | null | undefined = cursor;
    let geography = await geographyForReferences(db, [scope]);
    if (!resolveGeography(scope, geography)) return { items, geography, nextCursor: null, invalidCursor: false };
    // Remplir une page malgré des quartiers masqués, avec un budget de lecture
    // borné à 4 lots (96 candidats). Le curseur avance aussi sur les fiches masquées.
    for (let batch = 0; batch < 4; batch++) {
      let result;
      try { result = await listContents(db, { type: universe, geo: `${scope.kind}:${scope.id}`, cursor: nextCursor ?? undefined, q }, true, PAGE_SIZE - items.length); }
      catch (error) {
        if (error instanceof ContentError && error.status === 400) return { items: [], geography, nextCursor: null, invalidCursor: true };
        throw error;
      }
      geography = await geographyForReferences(db, [scope, ...result.documents.flatMap((item) => item.destinations)]);
      const documents = result.documents.filter((item) => visibleContent(item, geography) && item.destinations.some((ref) => resolveGeography(ref, geography) && belongsToDestination(ref, scope, geography)));
      items.push(...documents.map((item) => toPublicContent(item, geography)));
      nextCursor = result.nextCursor;
      if (!nextCursor || items.length >= PAGE_SIZE) break;
    }
    // Toutes les localisations des cartes affichées sont nécessaires à leurs libellés.
    const references = items.flatMap((item) => item.universe === "gastronomie" ? item.destinations : [item.location]);
    geography = await geographyForReferences(db, [scope, ...references]);
    return { items, geography, nextCursor: nextCursor ?? null, invalidCursor: false };
  });
}
