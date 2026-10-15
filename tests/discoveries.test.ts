import { staticGeography } from "../fixtures/catalogue/context";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoveries } from "../fixtures/catalogue/discoveries";
import { getActivitiesForVenue, getAddressesForSpecialty, getAssociatedVenue, getDiscoveriesForDestination, getDiscoveryById, getDiscoveryBySlug, getDiscoveryGeography, getPublishedDiscoveries, getSimilarDiscoveries, getSpecialtiesForAddress, discoveryPath, toDiscoveryCard } from "../src/lib/discoveries";
import { belongsToDestination, explorerPath, getLocalDestinations, resolveGeography } from "../src/lib/discovery-geography";
import { filterDiscoveryCards } from "../src/lib/discovery-filter";
import type { Discovery, FoodDiscovery } from "../src/types/discoveries";

test("les identifiants, slugs et références du catalogue sont cohérents", () => {
  assert.equal(new Set(discoveries.map((item) => item.id)).size, discoveries.length);
  assert.equal(new Set(discoveries.map((item) => `${item.universe}/${item.slug}`)).size, discoveries.length);
  for (const item of discoveries) {
    assert.match(item.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(item.title && item.summary && item.description.length && item.tags.length);
    assert.ok(Number.isFinite(Date.parse(item.createdAt)) && Date.parse(item.updatedAt) >= Date.parse(item.createdAt));
    for (const scope of getDiscoveryGeography(item)) assert.ok(resolveGeography(scope, staticGeography), `${item.id} : ${scope.id}`);
    for (const photo of [item.photograph, ...(item.gallery ?? [])].filter((photo) => photo !== undefined)) {
      assert.ok(photo.alt);
      assert.ok(existsSync(join(process.cwd(), "public", photo.src)), photo.src);
    }
    for (const source of item.sources) assert.equal(new URL(source.url).protocol, "https:");
    if (item.universe === "adresses") {
      assert.equal(new Set(item.specialtyIds).size, item.specialtyIds.length);
      for (const id of item.specialtyIds) assert.equal(getDiscoveryById(id, discoveries)?.universe, "gastronomie");
    }
    if (item.universe === "activites" && item.venue) {
      const venue = getAssociatedVenue(item, discoveries);
      assert.ok(venue && "location" in venue);
      assert.deepEqual(item.location, venue.location);
    }
  }
});

test("Tokyo agrège les contenus directs et de quartier une seule fois", () => {
  const result = getDiscoveriesForDestination({ kind: "city", id: "city-jp-tokyo" }, undefined, discoveries, staticGeography);
  assert.ok(result.some((item) => item.id === "address-maisen"));
  assert.ok(result.some((item) => item.id === "place-sensoji"));
  assert.equal(result.filter((item) => item.id === "food-tonkatsu").length, 1);
  assert.equal(new Set(result.map((item) => item.id)).size, result.length);
  assert.ok(result.every((item) => item.id !== "place-fushimi-inari"));
});

test("le quartier n’hérite pas arbitrairement des contenus de la ville ou du pays", () => {
  const asakusa = getDiscoveriesForDestination({ kind: "district", id: "district-tokyo-asakusa" }, undefined, discoveries, staticGeography);
  assert.ok(asakusa.some((item) => item.id === "place-sensoji"));
  assert.ok(!asakusa.some((item) => ["address-maisen", "place-ueno-park", "food-tonkatsu"].includes(item.id)));
  assert.equal(belongsToDestination({ kind: "country", id: "country-jp" }, { kind: "city", id: "city-jp-tokyo" }, staticGeography), false);
  assert.equal(belongsToDestination({ kind: "district", id: "district-tokyo-asakusa" }, { kind: "country", id: "country-jp" }, staticGeography), true);
  assert.deepEqual(getDiscoveriesForDestination({ kind: "city", id: "city-inconnue" }, undefined, discoveries, staticGeography), []);
});

test("une spécialité a une seule fiche canonique dans plusieurs villes", () => {
  const tokyo = getDiscoveriesForDestination({ kind: "city", id: "city-jp-tokyo" }, "gastronomie", discoveries, staticGeography);
  const osaka = getDiscoveriesForDestination({ kind: "city", id: "city-jp-osaka" }, "gastronomie", discoveries, staticGeography);
  const first = tokyo.find((item) => item.id === "food-okonomiyaki");
  const second = osaka.find((item) => item.id === "food-okonomiyaki");
  assert.ok(first && second);
  assert.equal(first, second);
  assert.equal(discoveryPath(first), "/decouvertes/gastronomie/okonomiyaki");
});

test("les relations spécialités ↔ établissements sont dérivées de la même source", () => {
  assert.deepEqual(getAddressesForSpecialty("food-tonkatsu", discoveries).map((item) => item.id), ["address-bairin", "address-maisen"]);
  assert.deepEqual(getSpecialtiesForAddress("address-kamiya", discoveries).map((item) => item.id), ["food-monjayaki", "food-okonomiyaki"]);
  for (const item of discoveries) if (item.universe === "adresses") for (const specialty of getSpecialtiesForAddress(item.id, discoveries)) assert.ok(getAddressesForSpecialty(specialty.id, discoveries).some((address) => address.id === item.id));
  assert.deepEqual(getAddressesForSpecialty("inconnu", discoveries), []);
  assert.deepEqual(getSpecialtiesForAddress("food-tonkatsu", discoveries), []);
});

test("une activité retrouve son lieu et le lieu retrouve son activité", () => {
  const activities = getActivitiesForVenue("place-ueno-park", discoveries);
  assert.equal(activities.length, 1);
  assert.equal(getAssociatedVenue(activities[0], discoveries)?.id, "place-ueno-park");
  assert.equal(activities[0].format, "editorial-idea");
  for (const item of discoveries) if (item.universe === "activites" && item.format === "editorial-idea") assert.equal(item.bookingUrl, undefined);
});

test("Fujiyoshida fonctionne sans quartier et les catégories vides restent vides", () => {
  const scope = { kind: "city", id: "city-jp-fujiyoshida" } as const;
  assert.deepEqual(getDiscoveriesForDestination(scope, "tourisme", discoveries, staticGeography).map((item) => item.id), ["place-honcho"]);
  assert.deepEqual(getDiscoveriesForDestination(scope, "adresses", discoveries, staticGeography), []);
  assert.equal(explorerPath(scope, "tourisme", staticGeography), "/destinations/japon/fujiyoshida?onglet=tourisme#univers");
});

test("les brouillons ne fuient ni dans les routes ni dans les relations", () => {
  const catalogue: Discovery[] = discoveries.map((item) => item.id === "address-bairin" || item.id === "food-tonkatsu" ? { ...item, status: "draft" } : item);
  assert.equal(getDiscoveryBySlug("adresses", "ginza-bairin", catalogue), undefined);
  assert.equal(getDiscoveryById("food-tonkatsu", catalogue), undefined);
  assert.ok(!getPublishedDiscoveries(catalogue).some((item) => item.status === "draft"));
  assert.deepEqual(getAddressesForSpecialty("food-tonkatsu", catalogue), []);
  assert.deepEqual(getSpecialtiesForAddress("address-maisen", catalogue), []);
  assert.ok(!getDiscoveriesForDestination({ kind: "city", id: "city-jp-tokyo" }, undefined, catalogue, staticGeography).some((item) => item.status === "draft"));
});

test("recherche sans accents, plusieurs mots, tags combinés et remise à zéro", () => {
  const cards = getPublishedDiscoveries(discoveries).map((item) => toDiscoveryCard(item, undefined, staticGeography));
  assert.deepEqual(filterDiscoveryCards(cards, "senso ji", "Culturel").map((item) => item.id), ["place-sensoji"]);
  assert.deepEqual(filterDiscoveryCards(cards, "ceremonie", "Gestes").map((item) => item.id), ["activity-tea"]);
  assert.ok(filterDiscoveryCards(cards, "Tokyo", "Restaurant").every((item) => item.universe === "adresses"));
  assert.deepEqual(filterDiscoveryCards(cards, "impossible123", ""), []);
  assert.equal(filterDiscoveryCards(cards, "", "").length, cards.length);
});

test("les données facultatives et les relations vides restent consultables", () => {
  const maisen = getDiscoveryBySlug("adresses", "maisen-aoyama", discoveries);
  assert.ok(maisen?.universe === "adresses");
  assert.equal(maisen.photograph, undefined);
  assert.equal(maisen.openingHours, undefined);
  assert.equal(maisen.waitingTime, undefined);
  assert.equal(maisen.gallery, undefined);
  assert.deepEqual(getAddressesForSpecialty("food-taiyaki", discoveries), []);
  const food = getDiscoveryById("food-okonomiyaki", discoveries) as FoodDiscovery;
  const countryOnly = { ...food, id: "food-country-only", destinations: [{ kind: "country", id: "country-jp" }] } as const;
  assert.equal(getDiscoveriesForDestination({ kind: "country", id: "country-jp" }, "gastronomie", [countryOnly], staticGeography).length, 1);
  assert.equal(getDiscoveriesForDestination({ kind: "city", id: "city-jp-tokyo" }, "gastronomie", [countryOnly], staticGeography).length, 0);
});

test("les liens et suggestions restent typés, locaux et sans auto-référence", () => {
  for (const scope of getLocalDestinations(staticGeography)) {
    const destination = resolveGeography(scope, staticGeography);
    assert.ok(destination);
    if (destination.district) assert.notEqual(destination.district.slug, "explorer", "Le segment explorer est réservé aux catégories.");
  }
  const item = getDiscoveryById("place-sensoji", discoveries);
  assert.ok(item);
  const similar = getSimilarDiscoveries(item, 3, discoveries, staticGeography);
  assert.ok(similar.some((candidate) => candidate.id === "place-kaminarimon"));
  assert.ok(similar.every((candidate) => candidate.id !== item.id && candidate.universe === item.universe));
  assert.equal(toDiscoveryCard(item, { kind: "district", id: "district-tokyo-asakusa" }, staticGeography).href, "/decouvertes/tourisme/senso-ji?depuis=district-tokyo-asakusa&univers=tourisme");
  assert.equal(getDiscoveryBySlug("gastronomie", "senso-ji", discoveries), undefined);
  assert.equal(getDiscoveryBySlug("invalide", "tonkatsu", discoveries), undefined);
});
