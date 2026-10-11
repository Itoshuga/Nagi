import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cities, countries, districts } from "../src/data/geography";
import {
  cityPath, countryPath, districtPath, getCitiesByCountry, getCityBySlug,
  getCountries, getCountryBySlug, getDistrictBySlug, getDistrictsByCity,
  getCityParams, getCountryParams, getDistrictParams,
} from "../src/lib/destinations";

test("les identifiants sont uniques et les relations ne comportent aucun orphelin", () => {
  const entities = [...countries, ...cities, ...districts];
  assert.equal(new Set(entities.map((entity) => entity.id)).size, entities.length);
  for (const city of cities) assert.ok(countries.some((country) => country.id === city.countryId));
  for (const district of districts) assert.ok(cities.some((city) => city.id === district.cityId));
  assert.equal(new Set(countries.map((country) => country.slug)).size, countries.length);
  for (const country of countries) {
    const children = getCitiesByCountry(country.id);
    assert.equal(new Set(children.map((city) => city.slug)).size, children.length);
  }
  for (const city of cities) {
    const children = getDistrictsByCity(city.id);
    assert.equal(new Set(children.map((district) => district.slug)).size, children.length);
  }
});

test("le catalogue permet le parcours Japon → Tokyo → ses cinq quartiers", () => {
  assert.equal(getCountries().length, 1);
  const japan = getCountryBySlug("japon");
  assert.ok(japan);
  assert.deepEqual(japan.cities.map((city) => city.slug), ["tokyo", "kyoto", "osaka", "fujiyoshida"]);
  const tokyo = getCityBySlug(japan.id, "tokyo");
  assert.ok(tokyo);
  assert.deepEqual(tokyo.districts.map((district) => district.slug), ["shinjuku", "ueno", "asakusa", "shibuya", "ginza"]);
  assert.ok(tokyo.description.length > 0, "la ville conserve son propre contenu malgré ses quartiers");
  const asakusa = getDistrictBySlug(tokyo.id, "asakusa");
  assert.ok(asakusa);
  assert.equal(countryPath(japan), "/destinations/japon");
  assert.equal(cityPath(japan, tokyo), "/destinations/japon/tokyo");
  assert.equal(districtPath(japan, tokyo, asakusa), "/destinations/japon/tokyo/asakusa");
});

test("Fujiyoshida existe indépendamment de tout quartier", () => {
  const city = getCityBySlug("country-jp", "fujiyoshida");
  assert.ok(city);
  assert.deepEqual(city.districts, []);
  assert.ok(city.introduction.length > 0);
});

test("un slug valide ne peut pas être retrouvé sous un parent incorrect", () => {
  assert.equal(getCountryBySlug("inconnu"), undefined);
  assert.equal(getCityBySlug("country-inconnu", "tokyo"), undefined);
  assert.equal(getCityBySlug("country-jp", "inconnue"), undefined);
  assert.equal(getDistrictBySlug("city-jp-kyoto", "asakusa"), undefined);
  assert.equal(getDistrictBySlug("city-jp-fujiyoshida", "shinjuku"), undefined);
  assert.equal(getDistrictBySlug("city-jp-tokyo", "inconnu"), undefined);
  assert.deepEqual(getCitiesByCountry("inconnu"), []);
  assert.deepEqual(getDistrictsByCity("inconnue"), []);
});

test("chaque paramètre statique se résout dans sa hiérarchie", () => {
  assert.equal(getCountryParams().length, countries.length);
  assert.equal(getCityParams().length, cities.length);
  assert.equal(getDistrictParams().length, districts.length);
  for (const params of getDistrictParams()) {
    const country = getCountryBySlug(params.country);
    assert.ok(country);
    const city = getCityBySlug(country.id, params.city);
    assert.ok(city);
    assert.ok(getDistrictBySlug(city.id, params.district));
  }
});

test("les visuels et descriptions des destinations sont disponibles localement", () => {
  for (const place of [...countries, ...cities, ...districts]) {
    assert.match(place.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(place.description && place.introduction && place.photograph.alt);
    assert.ok(existsSync(join(process.cwd(), "public", place.photograph.src)), place.photograph.src);
  }
});
