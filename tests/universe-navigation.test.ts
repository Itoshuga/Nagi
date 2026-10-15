import { staticGeography } from "../fixtures/catalogue/context";
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedTabPath, destinationExplorationPath, destinationTabPath, keyboardUniverse, selectedUniverse } from "../src/lib/universe-navigation";
import { explorerPath, getNavigationContexts } from "../src/lib/discovery-geography";
import { universeSlugs } from "../src/types/discoveries";
import { discoveries } from "../fixtures/catalogue/discoveries";
import { toDiscoveryCard } from "../src/lib/discoveries";
import { isKnownGeographicRoute } from "../src/lib/geographic-routing";

test("un onglet partagé est reconnu et toute valeur absente, ambiguë ou invalide revient à Tourisme", () => {
  for (const slug of universeSlugs) {
    assert.equal(selectedUniverse(slug), slug);
    assert.equal(selectedUniverse([slug]), slug);
  }
  for (const value of [null, undefined, "", "Gastronomie", "inconnu", [], ["gastronomie", "adresses"], "https://example.com"]) assert.equal(selectedUniverse(value), "tourisme");
});

test("la navigation horizontale boucle et laisse les touches de défilement vertical disponibles", () => {
  assert.equal(keyboardUniverse("tourisme", "ArrowLeft"), "adresses");
  assert.equal(keyboardUniverse("adresses", "ArrowRight"), "tourisme");
  assert.equal(keyboardUniverse("activites", "ArrowRight"), "gastronomie");
  assert.equal(keyboardUniverse("gastronomie", "ArrowLeft"), "activites");
  for (const slug of universeSlugs) {
    assert.equal(keyboardUniverse(slug, "Home"), "tourisme");
    assert.equal(keyboardUniverse(slug, "End"), "adresses");
    for (const key of ["ArrowUp", "ArrowDown", "Tab"]) assert.equal(keyboardUniverse(slug, key), undefined);
  }
});

test("changer d’onglet conserve le chemin, les autres paramètres et l’ancre sans cumuler onglet", () => {
  const url = changedTabPath("/destinations/japon/kyoto", "?source=carnet&onglet=tourisme&onglet=adresses", "gastronomie", "#univers");
  assert.equal(url, "/destinations/japon/kyoto?source=carnet&onglet=gastronomie#univers");
  assert.equal(destinationTabPath("/destinations/japon/tokyo/asakusa", "adresses"), "/destinations/japon/tokyo/asakusa?onglet=adresses#univers");
});

test("relire les entrées précédente et suivante restitue leur onglet, sans état local divergent", () => {
  const history = ["/destinations/japon/kyoto"];
  for (const slug of ["gastronomie", "adresses"] as const) {
    const current = new URL(history[history.length - 1], "http://localhost");
    history.push(changedTabPath(current.pathname, current.search, slug, current.hash));
  }
  const read = (index: number) => selectedUniverse(new URL(history[index], "http://localhost").searchParams.getAll("onglet"));
  assert.equal(read(2), "adresses");
  assert.equal(read(1), "gastronomie");
  assert.equal(read(0), "tourisme");
  assert.equal(read(1), "gastronomie");
  assert.equal(read(2), "adresses");
});

test("les villes conservent leurs univers, avec ou sans quartiers", () => {
  const cases = [
    { kind: "city", id: "city-jp-tokyo", path: "/destinations/japon/tokyo", hasDistricts: true },
    { kind: "city", id: "city-jp-kyoto", path: "/destinations/japon/kyoto", hasDistricts: false },
    { kind: "district", id: "district-tokyo-asakusa", path: "/destinations/japon/tokyo/asakusa", hasDistricts: false },
  ] as const;
  const contexts = getNavigationContexts(staticGeography);
  for (const destination of cases) {
    const context = contexts.find((item) => item.key === destination.id);
    assert.ok(context);
    assert.equal(context.hasDistricts, destination.hasDistricts);
    for (const universe of universeSlugs) {
      const expected = `${destination.path}?onglet=${universe}#univers`;
      assert.equal(explorerPath(destination, universe, staticGeography), expected);
      assert.equal(destinationExplorationPath(context, universe), expected);
    }
  }
});

test("les cartes ne fabriquent pas de durée ou budget et montrent les données facultatives présentes", () => {
  const activity = discoveries.find((item) => item.universe === "activites");
  const address = discoveries.find((item) => item.universe === "adresses");
  const food = discoveries.find((item) => item.universe === "gastronomie");
  assert.ok(activity?.universe === "activites" && address?.universe === "adresses" && food?.universe === "gastronomie");
  assert.equal(toDiscoveryCard(activity, undefined, staticGeography).practicalDetails, undefined);
  assert.equal(toDiscoveryCard(address, undefined, staticGeography).practicalDetails, undefined);
  assert.deepEqual(toDiscoveryCard({ ...activity, duration: "Durée de test" }, undefined, staticGeography).practicalDetails, [{ label: "Durée indicative", value: "Durée de test" }]);
  assert.deepEqual(toDiscoveryCard({ ...address, budget: "Budget de test" }, undefined, staticGeography).practicalDetails, [{ label: "Budget indicatif", value: "Budget de test" }]);
  assert.equal(toDiscoveryCard(food, undefined, staticGeography).originalName, food.originalName);
});

test("le routage reconnaît les parents et les anciennes catégories sans accepter de segments incomplets", () => {
  for (const path of ["/destinations/japon/tokyo", "/destinations/japon/%74okyo", "/destinations/japon/fujiyoshida", "/destinations/japon/tokyo/asakusa", "/destinations/japon/tokyo/explorer/tourisme", "/destinations/japon/tokyo/asakusa/explorer/gastronomie"]) assert.equal(isKnownGeographicRoute(path, staticGeography), true, path);
  for (const path of ["/destinations/japon/inconnue", "/destinations/inconnu/tokyo", "/destinations/japon/kyoto/asakusa", "/destinations/japon/tokyo/explorer", "/destinations/japon/tokyo/explorer/inconnu", "/destinations/japon/tokyo/asakusa/explorer", "/destinations/japon/tokyo/asakusa/tourisme", "/destinations/japon/tokyo/%zz", "/destinations/japon/tokyo/explorer/adresses/suite"]) assert.equal(isKnownGeographicRoute(path, staticGeography), false, path);
});
