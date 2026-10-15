import type { City, CityWithDistricts, Country, CountryWithCities, District, PublicGeography } from "../types/destinations";

export function getCountries(geography: PublicGeography): readonly Country[] {
  return geography.countries;
}

export function getCitiesByCountry(countryId: Country["id"], geography: PublicGeography): readonly City[] {
  return geography.cities.filter((city) => city.countryId === countryId);
}

export function getDistrictsByCity(cityId: City["id"], geography: PublicGeography): readonly District[] {
  return geography.districts.filter((district) => district.cityId === cityId);
}

export function getCountryBySlug(slug: string, geography: PublicGeography): CountryWithCities | undefined {
  const country = geography.countries.find((entry) => entry.slug === slug);
  return country ? { ...country, cities: getCitiesByCountry(country.id, geography) } : undefined;
}

export function getCityBySlug(countryId: Country["id"], slug: string, geography: PublicGeography): CityWithDistricts | undefined {
  const city = geography.cities.find((entry) => entry.countryId === countryId && entry.slug === slug);
  return city ? { ...city, districts: getDistrictsByCity(city.id, geography) } : undefined;
}

export function getDistrictBySlug(cityId: City["id"], slug: string, geography: PublicGeography): District | undefined {
  return geography.districts.find((entry) => entry.cityId === cityId && entry.slug === slug);
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

export function getCountryParams(geography: PublicGeography) {
  return geography.countries.map((country) => ({ country: country.slug }));
}

export function getCityParams(geography: PublicGeography) {
  return geography.countries.flatMap((country) => getCitiesByCountry(country.id, geography).map((city) => ({ country: country.slug, city: city.slug })));
}

export function getDistrictParams(geography: PublicGeography) {
  return geography.countries.flatMap((country) => getCitiesByCountry(country.id, geography).flatMap((city) =>
    getDistrictsByCity(city.id, geography).map((district) => ({ country: country.slug, city: city.slug, district: district.slug }))));
}
