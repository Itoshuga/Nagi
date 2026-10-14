import { getPublicGeography } from "@/lib/geography/public";
import { Breadcrumbs } from "@/components/destinations/breadcrumbs";
import { PlaceHero } from "@/components/destinations/place-hero";
import { PlaceUniverses } from "@/components/destinations/place-universes";
import { ReturnLink } from "@/components/destinations/return-link";
import { cityPath, countryPath, districtPath, getCountryBySlug, getCityBySlug, getDistrictBySlug } from "@/lib/destinations";
import { requireDistrict } from "@/lib/destination-pages";
import { destinationMetadata } from "@/lib/destination-metadata";
import { connection } from "next/server";

export async function generateMetadata({ params }: PageProps<"/destinations/[country]/[city]/[district]">) {
  const values = await params;
  const geography = await getPublicGeography();
  const country = getCountryBySlug(values.country, geography);
  const city = country && getCityBySlug(country.id, values.city, geography);
  const district = city && getDistrictBySlug(city.id, values.district, geography);
  if (!country || !city || !district) return { title: "Destination introuvable — Nagi", robots: { index: false } };
  return destinationMetadata(`${district.name}, ${city.name}, ${country.name}`, district.description, districtPath(country, city, district));
}

export default async function DistrictPage({ params }: PageProps<"/destinations/[country]/[city]/[district]">) {
  await connection();
  const { country, city, district } = await requireDistrict(await params);
  return (
    <>
      <Breadcrumbs items={[{ label: "Destinations", href: "/destinations" }, { label: country.name, href: countryPath(country) }, { label: city.name, href: cityPath(country, city) }, { label: district.name }]} />
      <PlaceHero name={district.name} eyebrow={`${country.name} / ${city.name} / Le quartier`} mood={district.mood} introduction={district.introduction} photograph={district.photograph} caption={`${district.name} — ${city.name}, ${country.name}`} next={{ href: "#univers", label: "Découvrir les quatre univers" }} />
      <PlaceUniverses name={district.name} scope={{ kind: "district", id: district.id }} />
      <ReturnLink href={cityPath(country, city)}>Tous les quartiers · {city.name}</ReturnLink>
    </>
  );
}
