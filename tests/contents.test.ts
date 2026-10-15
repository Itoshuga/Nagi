import { test } from "node:test";
import assert from "node:assert/strict";
import { demonstrationContents, demonstrationRelations } from "../src/lib/contents/demo";
import { contentDocumentSchema, contentInputSchema, contentKey, relationBetween, relationSchema, type ManagedContent } from "../src/lib/contents/schema";
import { toPublicContent, visibleContent } from "../src/lib/contents/presentation";
import { normalizeSearch } from "../src/lib/discovery-filter";
import { staticGeography } from "../src/lib/destinations";
import { contentCovers } from "../src/data/content-covers";
import { remapDemonstrationDestination } from "../src/lib/contents/migration-geography";
import { demonstrationDestinations } from "../src/lib/geography/demo";

function documents(): ManagedContent[] {
  return demonstrationContents().map(({ original, input }) => contentDocumentSchema.parse({ ...input, id: original.id, schemaVersion: 1, locale: "fr", searchTitle: normalizeSearch(input.title), geographyKeys: [], isArchived: false, archivedAt: null, createdAt: new Date(original.createdAt).toISOString(), updatedAt: new Date(original.updatedAt).toISOString(), publishedAt: new Date(original.createdAt).toISOString(), revision: 1 }));
}
test("les quatre types migrent sans perdre titres, textes, images ou associations explicites", () => {
  for (const { original, input } of demonstrationContents()) {
    assert.equal(input.title, original.title); assert.equal(input.slug, original.slug);
    assert.equal(input.description, original.description.join("\n\n")); assert.equal(input.coverImage, original.photograph?.src ?? "");
    assert.deepEqual(input.sources, original.sources);
    assert.deepEqual(input.destinations, original.universe === "gastronomie" ? original.destinations : [original.location]);
    for (const image of [input.coverImage].filter(Boolean)) assert.ok(contentCovers.some((photo) => photo.src === image));
  }
});
test("la projection publique conserve les photographies et retire toutes les métadonnées de gestion", () => {
  for (const item of documents()) {
    const projected = toPublicContent(item, staticGeography);
    const original = demonstrationContents().find((entry) => entry.original.id === item.id)!.original;
    assert.equal(projected.photograph?.src, original.photograph?.src);
    assert.equal(projected.photograph?.alt, original.photograph?.alt);
    assert.equal(projected.photograph?.position, original.photograph?.position);
    assert.equal(projected.description.join("\n\n"), original.description.join("\n\n"));
    assert.doesNotMatch(JSON.stringify(projected), /schemaVersion|searchTitle|geographyKeys|archivedAt|revision|isArchived|visibility/);
  }
});
test("une relation possède la même clé et le même sens quel que soit son côté d’édition", () => {
  const address = { id: "a", type: "adresses" as const }; const food = { id: "f", type: "gastronomie" as const }; const activity = { id: "x", type: "activites" as const };
  assert.deepEqual(relationBetween(address, food), relationBetween(food, address));
  assert.deepEqual(relationBetween(address, activity), relationBetween(activity, address));
  assert.equal(relationBetween(food, food), null); assert.equal(relationBetween(activity, food), null);
  const edges = demonstrationRelations(); assert.equal(new Set(edges.map((edge) => edge.id)).size, edges.length);
  const all = documents(); const a = all.find((item) => item.type === "adresses")!; const f = all.find((item) => item.type === "gastronomie")!;
  const imported = relationBetween(a, f)!; relationSchema.parse(imported);
  assert.deepEqual(Object.keys(imported.source).sort(), ["id", "type"]);
  assert.deepEqual(Object.keys(imported.target).sort(), ["id", "type"]);
});
test("les brouillons, archives et fiches privées ne sont jamais publics", () => {
  const item = documents()[0]; assert.ok(visibleContent(item, staticGeography));
  for (const patch of [{ status: "draft" as const }, { isArchived: true }, { visibility: "private" as const }]) assert.equal(visibleContent({ ...item, ...patch }, staticGeography), false);
  assert.equal(visibleContent(item, { countries: [], cities: [], districts: [] }), false);
});
test("une spécialité garde seulement ses destinations visibles sans en inventer via les restaurants", () => {
  const item = documents().find((item) => item.type === "gastronomie" && item.destinations.length > 1)!;
  const geography = { ...staticGeography, cities: staticGeography.cities.filter((city) => city.id !== item.destinations[0].id) };
  const projected = toPublicContent(item, geography);
  assert.ok(projected.universe === "gastronomie"); assert.ok(projected.destinations.length < item.destinations.length);
  assert.ok(projected.destinations.every((reference) => reference.id !== item.destinations[0].id));
});
test("les relations publiques sont dérivées d’une source unique", () => {
  const edges = demonstrationRelations(); const all = documents();
  for (const item of all.filter((item) => item.type === "adresses")) {
    const projected = toPublicContent(item, staticGeography, edges);
    assert.ok(projected.universe === "adresses");
    assert.deepEqual([...projected.specialtyIds].sort(), edges.filter((edge) => edge.kind === "serves" && edge.source.id === item.id).map((edge) => edge.target.id).sort());
    assert.ok(edges.filter((edge) => edge.memberKeys.includes(contentKey(item))).every((edge) => edge.memberKeys.length === 2));
  }
});
test("les brouillons peuvent être préparés, les publications exigent textes et destination", () => {
  const input = demonstrationContents()[0].input;
  assert.ok(contentInputSchema.safeParse({ ...input, summary: "", description: "", destinations: [], status: "draft" }).success);
  for (const patch of [{ summary: "" }, { description: "" }, { destinations: [] }, { destinations: [{ kind: "country", id: "country-jp" }] }]) assert.equal(contentInputSchema.safeParse({ ...input, ...patch }).success, false);
});
test("les champs techniques, URL exécutables, références forgées et positions GPS invalides sont refusés", () => {
  const input = demonstrationContents()[0].input;
  for (const patch of [{ admin: true }, { revision: 1 }, { slug: "../secret" }, { destinations: [{ kind: "city", id: "cities/forged" }] }, { details: { ...input.details, officialUrl: "javascript:alert(1)" } }, { details: { ...input.details, coordinates: { latitude: 91, longitude: 0 } } }]) assert.equal(contentInputSchema.safeParse({ ...input, ...patch }).success, false);
});

test("la migration rapproche les UUID existants par hiérarchie et refuse les slugs ambigus", () => {
  const documents = demonstrationDestinations();
  const mapping = new Map(documents.map((item, index) => [item.id, `existing-${index}`]));
  const changed = documents.map((item) => ({ ...item, id: mapping.get(item.id)!, ...(item.kind === "cities" ? { countryId: mapping.get(item.countryId)! } : item.kind === "districts" ? { cityId: mapping.get(item.cityId)! } : {}) }));
  const geography = { countries: changed.filter((item) => item.kind === "countries"), cities: changed.filter((item) => item.kind === "cities"), districts: changed.filter((item) => item.kind === "districts") };
  const reference = { kind: "district" as const, id: "district-tokyo-asakusa" };
  assert.deepEqual(remapDemonstrationDestination(reference, geography), { ...reference, id: mapping.get(reference.id) });
  geography.countries.push({ ...geography.countries[0], id: "ambiguous-country" });
  assert.equal(remapDemonstrationDestination(reference, geography), null);
});
