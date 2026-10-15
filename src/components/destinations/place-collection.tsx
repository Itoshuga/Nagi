import { protectedPhoto } from "@/lib/photos/urls";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatIndex } from "@/lib/format";
import type { Photograph } from "@/types/content";

export interface PlaceCard {
  id: string;
  name: string;
  label: string;
  mood: string;
  description: string;
  photograph: Photograph;
  href: string;
}

interface PlaceCollectionProps {
  id: string;
  eyebrow: string;
  title: string;
  introduction: string;
  items: readonly PlaceCard[];
}

export function PlaceCollection({ id, eyebrow, title, introduction, items }: PlaceCollectionProps) {
  return (
    <section className="place-collection section-shell" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <div><h2 id={`${id}-title`}>{title}</h2><p className="section-introduction">{introduction}</p></div>
      </div>
      {items.length > 0 ? (
        <div className="place-grid">
          {items.map((item, index) => (
            <article className="place-card" key={item.id}>
              <Link href={item.href} aria-label={`Découvrir ${item.name}`}>
                <figure className="place-card-image">
                  <Image unoptimized={protectedPhoto(item.photograph.src)} src={item.photograph.src} alt={item.photograph.alt} fill sizes="(max-width: 760px) 110vw, 60vw" style={{ objectPosition: item.photograph.position }} />
                  <figcaption>{item.label}</figcaption>
                </figure>
                <div className="place-card-copy">
                  <div className="place-card-number"><span>{formatIndex(index)}</span><ArrowUpRight size={21} strokeWidth={1.2} aria-hidden="true" /></div>
                  <h3>{item.name}</h3>
                  <p className="place-card-mood">{item.mood}</p>
                  <p className="place-card-description">{item.description}</p>
                  <span className="place-card-invitation">Découvrir {item.name}</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      ) : <p className="collection-empty">Ce carnet s’ouvre bientôt sur de nouvelles escales. Prenez le temps d’explorer les destinations déjà présentes.</p>}
    </section>
  );
}
