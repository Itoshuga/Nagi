import { protectedPhoto } from "@/lib/photos/urls";
import { getPlaceChildren } from "@/lib/geography/public";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Breadcrumbs } from "@/components/destinations/breadcrumbs";
import { cityPath, countryPath, getCitiesByCountry, getCountries } from "@/lib/destinations";
import { destinationMetadata } from "@/lib/destination-metadata";

export const metadata = destinationMetadata("Les destinations", "Choisir un horizon avec Nagi. Découvrez les pays, leurs villes et leurs quartiers dans un carnet de voyage culturel et sensible.", "/destinations");

export default async function DestinationsPage({ searchParams }: PageProps<"/destinations">) {
  const query = await searchParams;
  const page = await getPlaceChildren("countries", undefined, typeof query.apres === "string" ? query.apres : undefined, 12);
  const children = await Promise.all(page.geography.countries.map((country) => getPlaceChildren("cities", country.id, undefined, 6)));
  const geography = { ...page.geography, cities: children.flatMap((child) => child.geography.cities) };
  const countries = getCountries(geography);
  return (
    <>
      <Breadcrumbs items={[{ label: "Destinations" }]} />
      <header className="destination-directory-heading section-shell">
        <div><p className="eyebrow">Le carnet des destinations</p><h1>Votre prochaine <em>escale.</em></h1></div>
        <p>Un pays pour s’inspirer, une ville pour commencer.</p>
      </header>
      <div className="destination-directory section-shell">
        {countries.map((country, index) => {
          const cities = getCitiesByCountry(country.id, geography);
          const moreCities = children[index].nextCursor;
          return (
            <section className="destination-atlas" key={country.id} aria-labelledby={`country-${country.id}`}>
              <Link href={countryPath(country)} className="atlas-country" aria-label={`Explorer le carnet : ${country.name}`}>
                <Image unoptimized={protectedPhoto(country.photograph.src)} src={country.photograph.src} alt={country.photograph.alt} fill loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} sizes="(max-width: 960px) 92vw, (max-width: 1575px) 50vw, 810px" style={{ objectPosition: country.photograph.position }} />
                <div className="atlas-country-copy">
                  <p className="atlas-country-region">{country.region}</p>
                  <h2 id={`country-${country.id}`}>{country.name}</h2>
                  <span className="atlas-country-invitation">Explorer le carnet<ArrowUpRight size={20} strokeWidth={1.5} aria-hidden="true" /></span>
                </div>
              </Link>
              <nav className="atlas-cities" aria-labelledby={`cities-${country.id}`}>
                <div className="atlas-cities-heading">
                  <h3 id={`cities-${country.id}`}>Choisir une ville</h3>
                  <span>{cities.length} {cities.length > 1 ? "escales affichées" : "escale affichée"}</span>
                </div>
                <ul className="atlas-city-list">
                  {cities.map((city) => {
                    const photograph = city.discoveryPhotograph ?? city.featurePhotograph ?? city.photograph;
                    return <li key={city.id}>
                      <Link href={cityPath(country, city)} className="atlas-city" aria-label={`Découvrir ${city.name}`}>
                        <span className="atlas-city-photo"><Image unoptimized={protectedPhoto(photograph.src)} src={photograph.src} alt="" fill sizes="(max-width: 600px) 72px, 96px" style={{ objectPosition: photograph.position }} /></span>
                        <span className="atlas-city-copy">
                          <span className="atlas-city-name">{city.name}</span>
                          <span className="atlas-city-mood">{city.mood}</span>
                          <span className="atlas-city-context">{city.region}</span>
                        </span>
                        <ArrowUpRight className="atlas-city-arrow" size={20} strokeWidth={1.3} aria-hidden="true" />
                      </Link>
                    </li>;
                  })}
                </ul>
                {moreCities && <Link className="return-link" href={countryPath(country)}>Toutes les villes →</Link>}
                {cities.length === 0 && <p className="atlas-empty">Les premières escales de ce carnet se préparent.</p>}
              </nav>
            </section>
          );
        })}
        {page.invalidCursor && <p className="collection-empty">Cette page a expiré. <Link href="/destinations">Revenir aux destinations</Link>.</p>}
        {page.nextCursor && <Link className="return-link" href={`?apres=${encodeURIComponent(page.nextCursor)}`}>Pays suivants →</Link>}
        {countries.length === 0 && !page.invalidCursor && <p className="collection-empty">Notre carnet prépare ses premières escales. Revenez bientôt découvrir de nouveaux horizons.</p>}
        {countries.length > 0 && <p className="atlas-note"><span aria-hidden="true" />Le carnet grandit au fil des voyages. D’autres horizons suivront.</p>}
      </div>
    </>
  );
}
