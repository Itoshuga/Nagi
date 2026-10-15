import { TextLink } from "../text-link";
export function UnavailableMessage() {
  return <section className="destination-not-found section-shell" aria-labelledby="unavailable-title"><p className="eyebrow">Le carnet · Une courte pause</p><h1 id="unavailable-title">Le voyage reprend<br /><em>dans un instant.</em></h1><p>Les destinations et les découvertes sont momentanément indisponibles. Réessayez dans un instant.</p><TextLink href="/">Revenir à l’accueil</TextLink></section>;
}
