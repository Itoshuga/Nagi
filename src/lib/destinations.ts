import { cities, countries, districts } from "../data/geography";
import type { City, CityWithDistricts, Country, CountryWithCities, District } from "../types/destinations";

export function getCountries(): readonly Country[] {
  return countries;
}

export function getCitiesByCountry(countryId: Country["id"]): readonly City[] {
  return cities.filter((city) => city.countryId === countryId);
}

export function getDistrictsByCity(cityId: City["id"]): readonly District[] {
  return districts.filter((district) => district.cityId === cityId);
}

export function getCountryBySlug(slug: string): CountryWithCities | undefined {
  const country = countries.find((entry) => entry.slug === slug);
  return country ? { ...country, cities: getCitiesByCountry(country.id) } : undefined;
}

export function getCityBySlug(countryId: Country["id"], slug: string): CityWithDistricts | undefined {
  const city = cities.find((entry) => entry.countryId === countryId && entry.slug === slug);
  return city ? { ...city, districts: getDistrictsByCity(city.id) } : undefined;
}

export function getDistrictBySlug(cityId: City["id"], slug: string): District | undefined {
  return districts.find((entry) => entry.cityId === cityId && entry.slug === slug);
}

export function countryPath(country: Pick<Country, "slug">): string {
  return `/destinations/${encodeURIComponent(country.slug)}`;
}

export function cityPath(country: Pick<Country, "slug">, city: Pick<City, "slug">): string {
  return `${countryPath(country)}/${encodeURIComponent(city.slug)}`;
}

export function districtPath(country: Pick<Country, "slug">, city: Pick<City, "slug">, district: Pick<District, "slug">): string {
  return `${cityPath(country, city)}/${encodeURIComponent(district.slug)}`;
}

export function getCountryParams() {
  return countries.map((country) => ({ country: country.slug }));
}

export function getCityParams() {
  return countries.flatMap((country) => getCitiesByCountry(country.id).map((city) => ({ country: country.slug, city: city.slug })));
}

export function getDistrictParams() {
  return countries.flatMap((country) => getCitiesByCountry(country.id).flatMap((city) =>
    getDistrictsByCity(city.id).map((district) => ({ country: country.slug, city: city.slug, district: district.slug }))));
}
