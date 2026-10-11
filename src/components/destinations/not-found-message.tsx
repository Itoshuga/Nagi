import { TextLink } from "@/components/text-link";

export function NotFoundMessage() {
  return (
    <section className="destination-not-found section-shell" aria-labelledby="not-found-title">
      <p className="eyebrow">404 / Un détour imprévu</p>
      <h1 id="not-found-title">Cet horizon reste<br /><em>à dessiner.</em></h1>
      <p>Cette destination ne figure pas dans notre carnet, ou son adresse a changé. Retrouvez les escales déjà ouvertes à la découverte.</p>
      <TextLink href="/destinations">Explorer les destinations</TextLink>
      <TextLink href="/">Revenir à l’accueil</TextLink>
    </section>
  );
}
