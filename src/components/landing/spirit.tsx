import Image from "next/image";
import { copy } from "@/data/fr";
import { TextLink } from "@/components/text-link";

export function Spirit() {
  return (
    <section className="spirit-section section-shell" id="esprit" aria-labelledby="spirit-title">
      <figure className="spirit-figure">
        <div className="spirit-image"><Image src="/images/editorial-garden.jpg" alt="Un jardin japonais paisible où les arbres et les pierres entourent un pavillon de bois" fill sizes="(max-width: 699px) 110vw, 73vw" /></div>
        <figcaption>Prêter attention à ce qui est déjà là.</figcaption>
      </figure>
      <div className="spirit-copy">
        <p className="eyebrow">{copy.spirit.eyebrow}</p>
        <h2 id="spirit-title">{copy.spirit.title}<br /><em>{copy.spirit.titleAccent}</em></h2>
        {copy.spirit.paragraphs.map((paragraph) => <p className="spirit-paragraph" key={paragraph}>{paragraph}</p>)}
        <p className="spirit-closing">{copy.spirit.closing}</p>
        <TextLink href="/destinations/japon">Ouvrir le carnet japonais</TextLink>
      </div>
    </section>
  );
}
