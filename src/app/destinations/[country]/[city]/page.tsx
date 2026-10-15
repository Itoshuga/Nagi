import Link from "next/link";
import { getRouteGeography } from "@/lib/geography/public";
import { Breadcrumbs } from "@/components/destinations/breadcrumbs";
import { PlaceHero } from "@/components/destinations/place-hero";
import { PlaceCollection } from "@/components/destinations/place-collection";
import { PlaceUniverses } from "@/components/destinations/place-universes";
import { ReturnLink } from "@/components/destinations/return-link";
import { countryPath, cityPath, districtPath, getCountryBySlug, getCityBySlug } from "@/lib/destinations";
import { requireCity } from "@/lib/destination-pages";
import { destinationMetadata } from "@/lib/destination-metadata";
import { connection } from "next/server";

export async function generateMetadata({ params }: PageProps<"/destinations/[country]/[city]">) {
  const values = await params;
  const geography = await getRouteGeography(values.country, values.city);
  const country = getCountryBySlug(values.country, geography);
  const city = country && getCityBySlug(country.id, values.city, geography);
  // La page déclenche notFound() dans sa frontière ; ne pas interrompre
  // le rendu du document depuis les métadonnées d’une route dynamique.
  if (!country || !city) return { title: "Destination introuvable — Nagi", robots: { index: false } };
  return destinationMetadata(`${city.name}, ${country.name}`, city.description, cityPath(country, city));
}

export default async function CityPage({ params, searchParams }: PageProps<"/destinations/[country]/[city]">) {
  await connection();
  const query = await searchParams;
  const { country, city, nextCursor, invalidCursor } = await requireCity(await params, typeof query.quartiers === "string" ? query.quartiers : undefined);
  const hasDistricts = city.districts.length > 0;
  return (
    <>
      <Breadcrumbs items={[{ label: "Destinations", href: "/destinations" }, { label: country.name, href: countryPath(country) }, { label: city.name }]} />
      <PlaceHero name={city.name} eyebrow={[country.name, city.region].filter(Boolean).join(" / ")} mood={city.mood} introduction={city.introduction} photograph={city.featurePhotograph ?? city.photograph} caption={city.caption} next={hasDistricts ? { href: "#quartiers", label: "Parcourir les quartiers" } : { href: "#univers", label: `Explorer ${city.name}` }} />
      {hasDistricts ? <PlaceCollection id="quartiers" eyebrow={`${city.name} / Les quartiers`} title="Changer de rue, changer d’allure." introduction="Choisissez un quartier pour découvrir ses lieux à visiter, ses activités, ses spécialités et ses bonnes adresses." items={city.districts.map((district) => ({
        id: district.id, name: district.name, label: `${city.name}, ${country.name}`, mood: district.mood, description: district.description,
        photograph: district.photograph, href: districtPath(country, city, district),
      }))} /> : null}
      {invalidCursor && <p className="collection-empty">Cette page a expiré. <Link href={cityPath(country, city)}>Revenir à la ville</Link>.</p>}
      {nextCursor && <Link className="return-link" href={`?${new URLSearchParams({ quartiers: nextCursor, ...(typeof query.onglet === "string" ? { onglet: query.onglet } : {}), ...(typeof query.q === "string" ? { q: query.q } : {}) })}#quartiers`}>Quartiers suivants →</Link>}
      <PlaceUniverses name={city.name} scope={{ kind: "city", id: city.id }} query={query} />
      <ReturnLink href={countryPath(country)}>Toutes les villes · {country.name}</ReturnLink>
    </>
  );
}
