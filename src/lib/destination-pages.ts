import { getPlaceChildren, getRouteGeography } from "./geography/public";
import { notFound } from "next/navigation";
import { getCityBySlug, getCountryBySlug, getDistrictBySlug } from "./destinations";

export async function requireCountry(slug: string, cursor?: string) {
  const geography = await getRouteGeography(slug);
  const country = getCountryBySlug(slug, geography);
  if (!country) notFound();
  const page = await getPlaceChildren("cities", country.id, cursor);
  return { ...country, cities: page.geography.cities, nextCursor: page.nextCursor, invalidCursor: page.invalidCursor };
}
export async function requireCity(params: { country: string; city: string }, cursor?: string) {
  const geography = await getRouteGeography(params.country, params.city);
  const country = getCountryBySlug(params.country, geography);
  const city = country && getCityBySlug(country.id, params.city, geography);
  if (!country || !city) notFound();
  const page = await getPlaceChildren("districts", city.id, cursor);
  return { country, city: { ...city, districts: page.geography.districts }, geography: { ...geography, districts: page.geography.districts }, nextCursor: page.nextCursor, invalidCursor: page.invalidCursor };
}
export async function requireDistrict(params: { country: string; city: string; district: string }) {
  const geography = await getRouteGeography(params.country, params.city, params.district);
  const country = getCountryBySlug(params.country, geography);
  const city = country && getCityBySlug(country.id, params.city, geography);
  const district = city && getDistrictBySlug(city.id, params.district, geography);
  if (!country || !city || !district) notFound();
  return { country, city, district, geography };
}
