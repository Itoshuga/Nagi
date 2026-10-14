import { test } from "node:test";
import assert from "node:assert/strict";
import { demonstrationDestinations } from "../src/lib/geography/demo";
import { destinationInputSchema, proposedSlug, slugReservationId, visibilityReason, type ManagedGeography } from "../src/lib/geography/schema";
import { publicGeographyFromDocuments } from "../src/lib/geography/presentation";
import { decodeDestinationDocument } from "../src/lib/geography/documents";
import { cities, countries, districts } from "../src/data/geography";
import { geographicCover } from "../src/data/geographic-covers";

function demonstration(): ManagedGeography {
  const items = demonstrationDestinations("2026-10-14T10:00:00.000Z");
  return { countries: items.filter((item) => item.kind === "countries"), cities: items.filter((item) => item.kind === "cities"), districts: items.filter((item) => item.kind === "districts") };
}

test("la migration conserve les textes, les IDs, les parents et les images du carnet", () => {
  const data = demonstration();
  const documents = [...data.countries, ...data.cities, ...data.districts];
  assert.equal(documents.length, 10);
  for (const original of [...countries, ...cities, ...districts]) {
    const migrated = documents.find((item) => item.id === original.id);
    assert.ok(migrated);
    assert.equal(migrated.name, original.name);
    assert.equal(migrated.summary, original.description);
    assert.equal(migrated.description, original.introduction);
    assert.deepEqual(migrated.coverImage, original.photograph);
    if (migrated.kind === "cities" && "countryId" in original) assert.equal(migrated.countryId, original.countryId);
    if (migrated.kind === "districts" && "cityId" in original) assert.equal(migrated.cityId, original.cityId);
  }
});

test("un parent dépublié, privé ou archivé masque tous ses descendants", () => {
  for (const patch of [{ status: "draft" as const }, { visibility: "private" as const }, { archivedAt: "2026-10-14T10:00:00.000Z" }]) {
    const data = demonstration(); Object.assign(data.countries[0], patch);
    const visible = publicGeographyFromDocuments(data);
    assert.deepEqual(visible, { countries: [], cities: [], districts: [] });
    assert.match(visibilityReason(data.districts[0], data) ?? "", /pays parent/);
  }
  const data = demonstration(); const tokyo = data.cities.find((item) => item.id === "city-jp-tokyo")!;
  tokyo.status = "draft";
  assert.equal(publicGeographyFromDocuments(data).districts.length, 0);
  assert.equal(publicGeographyFromDocuments(data).cities.length, 3);
  assert.match(visibilityReason(data.districts[0], data) ?? "", /ville parente/);
});

test("une ville sans quartier reste publique et les données de gestion ne fuient pas", () => {
  const data = demonstration(); data.districts = [];
  const visible = publicGeographyFromDocuments(data);
  assert.equal(visible.cities.length, 4);
  assert.ok(visible.cities.some((item) => item.slug === "fujiyoshida"));
  assert.doesNotMatch(JSON.stringify(visible), /revision|archivedAt|publishedAt|schemaVersion/);
  data.countries[0].coverImage = null;
  assert.equal(publicGeographyFromDocuments(data).countries[0].photograph.src, "/images/destination-placeholder.svg");
});

test("les réservations distinguent le pays et la ville du même slug", () => {
  const data = demonstration();
  const city = { ...data.cities[0], slug: "meme-nom" };
  assert.notEqual(slugReservationId(city), slugReservationId({ ...city, countryId: "other-country" }));
  const district = { ...data.districts[0], slug: "meme-nom" };
  assert.notEqual(slugReservationId(district), slugReservationId({ ...district, cityId: "other-city" }));
  assert.notEqual(slugReservationId(city), slugReservationId(district));
});

test("la proposition de slug et la validation refusent les chemins et champs injectés", () => {
  assert.equal(proposedSlug("  Édō — Tōkyō, côté cœur ! "), "edo-tokyo-cote-coeur");
  const input = { kind: "districts", name: "Quartier", nativeName: "", slug: "quartier", cityId: "city-jp-tokyo", summary: "Résumé", description: "Présentation", status: "draft", visibility: "public", coverImage: "", sortOrder: 0 };
  assert.equal(destinationInputSchema.safeParse(input).success, true);
  for (const patch of [{ slug: "../secret" }, { slug: "explorer" }, { cityId: "cities/forged" }, { status: "admin" }, { sortOrder: -1 }, { admin: true }]) assert.equal(destinationInputSchema.safeParse({ ...input, ...patch }).success, false);
});

function legacyDocument(item: ReturnType<typeof demonstrationDestinations>[number]) {
  return {
    id: item.id, name: item.name, nativeName: item.nativeName, slug: item.slug,
    summary: item.summary, description: item.description, coverImage: item.coverImage?.src ?? "",
    status: item.status, sortOrder: item.sortOrder, createdAt: item.createdAt, updatedAt: item.updatedAt,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    isoCode: item.kind === "countries" ? item.isoCode : "", continent: item.kind === "countries" ? item.continent : "",
    ...(item.kind === "cities" ? { countryId: item.countryId } : item.kind === "districts" ? { cityId: item.cityId } : {}),
  };
}

test("les anciens documents deviennent lisibles sans changer leurs données ni leurs relations", () => {
  for (const original of demonstrationDestinations("2026-10-11T22:02:31.366Z")) {
    const raw = legacyDocument(original); const before = structuredClone(raw);
    const decoded = decodeDestinationDocument(original.kind, original.id, raw);
    assert.ok(decoded);
    assert.equal(decoded.id, original.id);
    assert.equal(decoded.kind, original.kind);
    assert.equal(decoded.name, original.name);
    assert.equal(decoded.summary, original.summary);
    assert.equal(decoded.publishedAt, original.publishedAt);
    assert.equal(decoded.revision, 1);
    assert.deepEqual(decoded.coverImage, geographicCover(raw.coverImage));
    if (decoded.kind === "cities" && original.kind === "cities") assert.equal(decoded.countryId, original.countryId);
    if (decoded.kind === "districts" && original.kind === "districts") assert.equal(decoded.cityId, original.cityId);
    assert.deepEqual(raw, before);
  }
});

test("un ancien brouillon incomplet reste éditable et masque ses enfants publiés", () => {
  const data = demonstration();
  const raw = { ...legacyDocument(data.countries[0]), status: "draft", summary: "", description: "", publishedAt: undefined };
  const country = decodeDestinationDocument("countries", raw.id, raw);
  assert.ok(country?.kind === "countries");
  assert.equal(country.summary, ""); assert.equal(country.description, ""); assert.equal(country.publishedAt, null);
  data.countries = [country];
  assert.deepEqual(publicGeographyFromDocuments(data), { countries: [], cities: [], districts: [] });
  assert.match(visibilityReason(data.cities[0], data) ?? "", /pays parent/);
  assert.equal(destinationInputSchema.safeParse({ ...raw, kind: "countries" }).success, false);
});

test("la compatibilité conserve la confidentialité, le gel des URL et les validations strictes", () => {
  const original = demonstration().cities[0]; const raw = legacyDocument(original);
  const decoded = decodeDestinationDocument("cities", raw.id, { ...raw, visibility: "private", publishedAt: undefined });
  assert.equal(decoded?.visibility, "private");
  assert.equal(decoded?.publishedAt, raw.updatedAt);
  for (const patch of [{ schemaVersion: 2 }, { kind: "countries" }, { coverImage: "https://example.test/photo.jpg" }, { countryId: "countries/forged" }, { status: "unknown" }, { isoCode: "JP" }, { admin: true }]) {
    assert.equal(decodeDestinationDocument("cities", raw.id, { ...raw, ...patch }), null);
  }
  assert.equal(decodeDestinationDocument("cities", "wrong-id", raw), null);
  assert.equal(decodeDestinationDocument("countries", raw.id, raw), null);
  assert.equal(decodeDestinationDocument("cities", original.id, { ...original, revision: undefined }), null);
  assert.equal(decodeDestinationDocument("cities", original.id, { ...original, summary: "" }), null);
  assert.deepEqual(decodeDestinationDocument("cities", original.id, original), original);
});
