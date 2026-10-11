"use client";

import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { useRef, useState } from "react";
import { copy, destinations } from "@/data/fr";
import { formatIndex } from "@/lib/format";
import { TextLink } from "@/components/text-link";

export function Hero() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visited, setVisited] = useState<readonly number[]>([0]);
  const loadedImages = useRef(new Set<number>());
  const requestedIndex = useRef(0);
  const selected = destinations[selectedIndex];

  function selectDestination(index: number) {
    requestedIndex.current = index;
    setVisited((previous) => previous.includes(index) ? previous : [...previous, index]);
    if (loadedImages.current.has(index)) setSelectedIndex(index);
  }

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-sidebar">
        <span className="vertical-note">L’art de regarder ailleurs</span>
        <div className="destination-index">
          <p className="eyebrow">Carnet de voyage</p>
          <p className="country-label">Le Japon</p>
          <div className="destination-selector" role="group" aria-label="Destination mise en avant">
            {destinations.map((destination, index) => (
              <button key={destination.id} onClick={() => selectDestination(index)} aria-pressed={selectedIndex === index}>
                <span>{destination.name}</span>
                <span className="destination-number">{formatIndex(index)}</span>
              </button>
            ))}
          </div>
          <p className="sidebar-footnote">Un pays.<br />D’infinies façons de le voir.</p>
        </div>
        <a className="scroll-note" href="#decouvrir"><ArrowDown size={16} strokeWidth={1.25} aria-hidden="true" /><span>Au fil du voyage</span></a>
      </div>

      <figure className="hero-figure">
        <div className="hero-image-stack" id="destination-photograph">
          {destinations.map((destination, index) => visited.includes(index) && (
            <Image
              key={destination.id}
              src={destination.photograph.src}
              alt={destination.photograph.alt}
              fill
              sizes={destination.slug === "kyoto"
                ? "(max-width: 699px) min(210vw, 945px), 130vh"
                : "(max-width: 699px) 92vw, (max-width: 1023px) 53vw, 40vw"}
              loading="eager"
              fetchPriority={index === 0 ? "high" : "auto"}
              onLoad={() => {
                loadedImages.current.add(index);
                if (requestedIndex.current === index) setSelectedIndex(index);
              }}
              className={`hero-photo ${selectedIndex === index ? "is-selected" : ""}`}
              style={{ objectPosition: destination.photograph.position }}
              aria-hidden={selectedIndex !== index}
            />
          ))}
        </div>
        <figcaption><span>{selected.caption}</span><span>{formatIndex(selectedIndex)} / 03</span></figcaption>
      </figure>

      <div className="hero-editorial">
        <p className="eyebrow hero-eyebrow"><span className="small-sun" aria-hidden="true" />{copy.hero.eyebrow}</p>
        <h1 id="hero-title">{copy.hero.title}<br /><em>{copy.hero.titleAccent}</em></h1>
        <p className="hero-introduction">{copy.hero.introduction}</p>
        <div className="photo-gallery" role="group" aria-label="Choisir une photographie">
          {destinations.map((destination, index) => (
            <button
              key={destination.id}
              className="gallery-button"
              onClick={() => selectDestination(index)}
              aria-label={`Afficher ${destination.name}`}
              aria-pressed={selectedIndex === index}
              aria-controls="destination-photograph"
            >
              <Image src={destination.photograph.src} alt="" fill sizes="80px" loading="eager" style={{ objectPosition: destination.photograph.position }} />
            </button>
          ))}
        </div>
        <p className="gallery-caption" aria-live="polite" aria-atomic="true"><span>{formatIndex(selectedIndex)}</span>{selected.name} · {selected.mood}</p>
        <TextLink href="/destinations" className="hero-link">{copy.hero.cta}</TextLink>
      </div>
      <span className="hero-edition">Édition 001 — Japon</span>
    </section>
  );
}
