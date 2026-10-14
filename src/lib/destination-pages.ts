import { getPublicGeography } from "./geography/public";
import { notFound } from "next/navigation";
import { getCityBySlug, getCountryBySlug, getDistrictBySlug } from "./destinations";

export async function requireCountry(slug: string) {
  const country = getCountryBySlug(slug, await getPublicGeography());
  if (!country) notFound();
  return country;
}

export async function requireCity(params: { country: string; city: string }) {
  const country = await requireCountry(params.country);
  const city = getCityBySlug(country.id, params.city, await getPublicGeography());
  if (!city) notFound();
  return { country, city };
}

export async function requireDistrict(params: { country: string; city: string; district: string }) {
  const { country, city } = await requireCity(params);
  const district = getDistrictBySlug(city.id, params.district, await getPublicGeography());
  if (!district) notFound();
  return { country, city, district };
}
