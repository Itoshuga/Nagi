import Image from "next/image";
import Link from "next/link";
import { copy, destinations } from "@/data/fr";
import { formatIndex } from "@/lib/format";
import { cityPath, getCountryBySlug } from "@/lib/destinations";

export function Discover() {
  const orderedDestinations = [destinations[1], destinations[0], destinations[2]];
  const country = getCountryBySlug("japon");
  if (!country) return null;

  return (
    <section className="discover-section section-shell" id="decouvrir" aria-labelledby="discover-title">
      <div className="section-heading">
        <p className="eyebrow">{copy.discover.eyebrow}</p>
        <div><h2 id="discover-title">{copy.discover.title}</h2><p className="section-introduction">{copy.discover.introduction}</p></div>
      </div>
      <div className="destination-spread">
        {orderedDestinations.map((destination, index) => {
          const photograph = destination.discoveryPhotograph ?? destination.photograph;
          return (
          <article className={`destination-story destination-story-${destination.slug}`} key={destination.id}>
            <Link href={cityPath(country, destination)} className="destination-story-link" aria-label={`Découvrir ${destination.name}`}>
            <figure className="destination-image">
              <Image src={photograph.src} alt={photograph.alt} fill sizes={destination.discoveryPhotograph ? "(max-width: 699px) 145vw, 65vw" : "(max-width: 699px) 82vw, 32vw"} style={{ objectPosition: photograph.position }} />
              <figcaption className="image-note">{destination.region}</figcaption>
            </figure>
            <div className="destination-title"><h3>{destination.name}</h3><span>{formatIndex(index)}</span></div>
            <p className="destination-mood">{destination.mood}</p>
            <p className="destination-description">{destination.description}</p>
            </Link>
          </article>
          );
        })}
      </div>
      <div className="section-endnote"><span>Notre première escale</span><span>Le Japon, au-delà de la carte postale.</span></div>
    </section>
  );
}
