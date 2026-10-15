import { PhotoCredit } from "../discoveries/photo-credit";
import { protectedPhoto } from "@/lib/photos/urls";
import { getFeaturedGeography } from "@/lib/geography/public";
import Image from "next/image";
import Link from "next/link";
import { copy } from "@/data/fr";
import { formatIndex } from "@/lib/format";
import { cityPath, countryPath } from "@/lib/destinations";

export async function Discover() {
  const geography = await getFeaturedGeography();
  const country = geography.countries[0];
  if (!country) return null;
  const orderedDestinations = geography.cities.length ? geography.cities.map((city) => ({ ...city, href: cityPath(country, city) })) : [{ ...country, href: countryPath(country) }];

  return (
    <section className="discover-section section-shell" id="decouvrir" aria-labelledby="discover-title">
      <div className="section-heading">
        <p className="eyebrow">{copy.discover.eyebrow}</p>
        <div><h2 id="discover-title">{copy.discover.title}</h2><p className="section-introduction">{copy.discover.introduction}</p></div>
      </div>
      <div className="destination-spread">
        {orderedDestinations.map((destination, index) => {
          const photograph = destination.photograph;
          return (
          <article className={`destination-story destination-story-${index + 1}`} key={destination.id}>
            <Link href={destination.href} className="destination-story-link" aria-label={`Découvrir ${destination.name}`}>
            <figure className="destination-image">
              <Image unoptimized={protectedPhoto(photograph.src)} src={photograph.src} alt={photograph.alt} fill sizes="(max-width: 699px) 82vw, 32vw" style={{ objectPosition: photograph.position }} />
              <figcaption className="image-note">{destination.region}</figcaption>
            </figure>
            <div className="destination-title"><h3>{destination.name}</h3><span>{formatIndex(index)}</span></div>
            <p className="destination-mood">{destination.mood}</p>
            <p className="destination-description">{destination.description}</p>
            </Link>
            <PhotoCredit photograph={photograph} />
          </article>
          );
        })}
      </div>
      <div className="section-endnote"><span>Notre première escale</span><span>{country.name}, au-delà de la carte postale.</span></div>
    </section>
  );
}
