import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Breadcrumbs } from "@/components/destinations/breadcrumbs";
import { cityPath, countryPath, getCitiesByCountry, getCountries, getDistrictsByCity } from "@/lib/destinations";
import { destinationMetadata } from "@/lib/destination-metadata";

export const metadata = destinationMetadata("Les destinations", "Choisir un horizon avec Nagi. Découvrez le Japon, ses villes et ses quartiers dans un carnet de voyage culturel et sensible.", "/destinations");

export default function DestinationsPage() {
  const countries = getCountries();
  return (
    <>
      <Breadcrumbs items={[{ label: "Destinations" }]} />
      <header className="destination-directory-heading section-shell">
        <div><p className="eyebrow">Le carnet des destinations</p><h1>Votre prochaine <em>escale.</em></h1></div>
        <p>Un pays pour s’inspirer, une ville pour commencer.</p>
      </header>
      <div className="destination-directory section-shell">
        {countries.map((country, index) => {
          const cities = getCitiesByCountry(country.id);
          return (
            <section className="destination-atlas" key={country.id} aria-labelledby={`country-${country.id}`}>
              <Link href={countryPath(country)} className="atlas-country" aria-label={`Explorer le carnet : ${country.name}`}>
                <Image src={country.photograph.src} alt={country.photograph.alt} fill loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} sizes="(max-width: 960px) 92vw, (max-width: 1575px) 50vw, 810px" style={{ objectPosition: country.photograph.position }} />
                <div className="atlas-country-copy">
                  <p className="atlas-country-region">{country.region}</p>
                  <h2 id={`country-${country.id}`}>{country.name}</h2>
                  <span className="atlas-country-invitation">Explorer le carnet<ArrowUpRight size={20} strokeWidth={1.5} aria-hidden="true" /></span>
                </div>
              </Link>
              <nav className="atlas-cities" aria-labelledby={`cities-${country.id}`}>
                <div className="atlas-cities-heading">
                  <h3 id={`cities-${country.id}`}>Choisir une ville</h3>
                  <span>{cities.length} {cities.length > 1 ? "escales" : "escale"}</span>
                </div>
                <ul className="atlas-city-list">
                  {cities.map((city) => {
                    const photograph = city.discoveryPhotograph ?? city.featurePhotograph ?? city.photograph;
                    const districtCount = getDistrictsByCity(city.id).length;
                    return <li key={city.id}>
                      <Link href={cityPath(country, city)} className="atlas-city" aria-label={`Découvrir ${city.name}${districtCount > 0 ? ` et ses ${districtCount} quartiers` : ""}`}>
                        <span className="atlas-city-photo"><Image src={photograph.src} alt="" fill sizes="(max-width: 600px) 72px, 96px" style={{ objectPosition: photograph.position }} /></span>
                        <span className="atlas-city-copy">
                          <span className="atlas-city-name">{city.name}</span>
                          <span className="atlas-city-mood">{city.mood}</span>
                          <span className="atlas-city-context">{districtCount > 0 ? `${districtCount} quartiers à explorer` : city.region}</span>
                        </span>
                        <ArrowUpRight className="atlas-city-arrow" size={20} strokeWidth={1.3} aria-hidden="true" />
                      </Link>
                    </li>;
                  })}
                </ul>
                {cities.length === 0 && <p className="atlas-empty">Les premières escales de ce carnet se préparent.</p>}
              </nav>
            </section>
          );
        })}
        {countries.length === 0 && <p className="collection-empty">Notre carnet prépare ses premières escales. Revenez bientôt découvrir de nouveaux horizons.</p>}
        {countries.length > 0 && <p className="atlas-note"><span aria-hidden="true" />Le carnet grandit au fil des voyages. D’autres horizons suivront.</p>}
      </div>
    </>
  );
}
