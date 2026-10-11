import { notFound } from "next/navigation";
import { getCityBySlug, getCountryBySlug, getDistrictBySlug } from "./destinations";

export function requireCountry(slug: string) {
  const country = getCountryBySlug(slug);
  if (!country) notFound();
  return country;
}

export function requireCity(params: { country: string; city: string }) {
  const country = requireCountry(params.country);
  const city = getCityBySlug(country.id, params.city);
  if (!city) notFound();
  return { country, city };
}

export function requireDistrict(params: { country: string; city: string; district: string }) {
  const { country, city } = requireCity(params);
  const district = getDistrictBySlug(city.id, params.district);
  if (!district) notFound();
  return { country, city, district };
}
