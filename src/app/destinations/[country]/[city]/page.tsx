import { Breadcrumbs } from "@/components/destinations/breadcrumbs";
import { PlaceHero } from "@/components/destinations/place-hero";
import { PlaceCollection } from "@/components/destinations/place-collection";
import { PlaceUniverses } from "@/components/destinations/place-universes";
import { ReturnLink } from "@/components/destinations/return-link";
import { countryPath, cityPath, districtPath, getCountryBySlug, getCityBySlug } from "@/lib/destinations";
import { requireCity } from "@/lib/destination-pages";
import { destinationMetadata } from "@/lib/destination-metadata";
import { connection } from "next/server";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata({ params }: PageProps<"/destinations/[country]/[city]">) {
  const values = await params;
  const country = getCountryBySlug(values.country);
  const city = country && getCityBySlug(country.id, values.city);
  // La page déclenche notFound() dans sa frontière ; ne pas interrompre
  // le rendu du document depuis les métadonnées d’une route dynamique.
  if (!country || !city) return { title: "Destination introuvable — Nagi", robots: { index: false } };
  return destinationMetadata(`${city.name}, ${country.name}`, city.description, cityPath(country, city));
}

export default async function CityPage({ params, searchParams }: PageProps<"/destinations/[country]/[city]">) {
  await connection();
  const { country, city } = requireCity(await params);
  const hasDistricts = city.districts.length > 0;
  if (hasDistricts && "onglet" in await searchParams) permanentRedirect(`${cityPath(country, city)}#quartiers`);
  return (
    <>
      <Breadcrumbs items={[{ label: "Destinations", href: "/destinations" }, { label: country.name, href: countryPath(country) }, { label: city.name }]} />
      <PlaceHero name={city.name} eyebrow={`${country.name} / ${city.region}`} mood={city.mood} introduction={city.introduction} photograph={city.featurePhotograph ?? city.photograph} caption={city.caption} next={hasDistricts ? { href: "#quartiers", label: "Parcourir les quartiers" } : { href: "#univers", label: `Explorer ${city.name}` }} />
      {hasDistricts ? <PlaceCollection id="quartiers" eyebrow={`${city.name} / Les quartiers`} title="Changer de rue, changer d’allure." introduction="Choisissez un quartier pour découvrir ses lieux à visiter, ses activités, ses spécialités et ses bonnes adresses." items={city.districts.map((district) => ({
        id: district.id, name: district.name, label: `${city.name}, ${country.name}`, mood: district.mood, description: district.description,
        photograph: district.photograph, href: districtPath(country, city, district),
      }))} /> : <PlaceUniverses name={city.name} scope={{ kind: "city", id: city.id }} />}
      <ReturnLink href={countryPath(country)}>Toutes les villes · {country.name}</ReturnLink>
    </>
  );
}
