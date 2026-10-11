import { Breadcrumbs } from "@/components/destinations/breadcrumbs";
import { PlaceHero } from "@/components/destinations/place-hero";
import { PlaceCollection } from "@/components/destinations/place-collection";
import { ReturnLink } from "@/components/destinations/return-link";
import { cityPath, getCountryParams } from "@/lib/destinations";
import { requireCountry } from "@/lib/destination-pages";
import { destinationMetadata } from "@/lib/destination-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCountryParams();
}

export async function generateMetadata({ params }: PageProps<"/destinations/[country]">) {
  const country = requireCountry((await params).country);
  return destinationMetadata(country.name, country.description);
}

export default async function CountryPage({ params }: PageProps<"/destinations/[country]">) {
  const country = requireCountry((await params).country);
  return (
    <>
      <Breadcrumbs items={[{ label: "Destinations", href: "/destinations" }, { label: country.name }]} />
      <PlaceHero name={country.name} eyebrow={`Le pays / ${country.region}`} mood={country.mood} introduction={country.introduction} photograph={country.photograph} caption={`${country.name} — Une première fenêtre sur le voyage`} next={{ href: "#villes", label: "Découvrir les villes" }} />
      <dl className="country-presentation section-shell">{country.presentation.map((item) => <div key={item.label}><dt className="eyebrow">{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      <PlaceCollection id="villes" eyebrow={`${country.name} / Les escales`} title="Une ville, un autre rythme." introduction="Des grandes avenues aux rues plus tranquilles, choisissez l’escale qui vous ressemble." items={country.cities.map((city) => ({
        id: city.id, name: city.name, label: city.region, mood: city.mood, description: city.description,
        photograph: city.discoveryPhotograph ?? city.featurePhotograph ?? city.photograph, href: cityPath(country, city),
      }))} />
      <ReturnLink href="/destinations">Tous les pays</ReturnLink>
    </>
  );
}
