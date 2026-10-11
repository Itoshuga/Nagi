import { copy } from "@/data/fr";
import { UniverseGrid } from "@/components/universe-grid";

export function Universes() {
  return (
    <section className="universes-section section-shell" id="univers" aria-labelledby="universes-title">
      <div className="section-heading">
        <p className="eyebrow">{copy.universes.eyebrow}</p>
        <div><h2 id="universes-title">{copy.universes.title}</h2><p className="section-introduction">{copy.universes.introduction}</p></div>
      </div>
      <UniverseGrid />
    </section>
  );
}
