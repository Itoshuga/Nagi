import Image from "next/image";
import { TextLink } from "@/components/text-link";
import type { Photograph } from "@/types/content";
import Link from "next/link";
import { ArrowDown } from "lucide-react";

interface PlaceHeroProps {
  name: string;
  eyebrow: string;
  mood: string;
  introduction: string;
  photograph: Photograph;
  caption: string;
  next: { href: string; label: string };
  secondary?: { href: string; label: string };
}

export function PlaceHero({ name, eyebrow, mood, introduction, photograph, caption, next, secondary }: PlaceHeroProps) {
  return (
    <section className="place-hero section-shell" aria-labelledby="place-title">
      <div className="place-hero-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="place-title">{name}</h1>
        <p className="place-mood">{mood}</p>
        <p className="place-introduction">{introduction}</p>
        <div className="place-actions">
          <Link className="button button-primary" href={next.href}>{next.label}<ArrowDown size={17} aria-hidden="true" /></Link>
          {secondary && <TextLink href={secondary.href}>{secondary.label}</TextLink>}
        </div>
      </div>
      <figure className="place-hero-figure">
        <div className="place-hero-image">
          <Image src={photograph.src} alt={photograph.alt} fill loading="eager" fetchPriority="high" sizes="(max-width: 760px) 115vw, 75vw" style={{ objectPosition: photograph.position }} />
        </div>
        <figcaption><span>{caption}</span><span>Nagi · Carnet de voyage</span></figcaption>
      </figure>
    </section>
  );
}
