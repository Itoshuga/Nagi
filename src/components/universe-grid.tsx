import { Landmark, Hand, Soup, Coffee } from "lucide-react";
import { universes } from "@/data/fr";
import { formatIndex } from "@/lib/format";

const icons = { landmark: Landmark, hand: Hand, bowl: Soup, coffee: Coffee };

export function UniverseGrid() {
  return (
    <div className="universe-grid">
      {universes.map((universe, index) => {
        const Icon = icons[universe.icon];
        const content = <>
          <div className="universe-topline"><span>{formatIndex(index)}</span><Icon size={26} strokeWidth={1} aria-hidden="true" /></div>
          <h3>{universe.name}</h3>
          <p className="universe-subtitle">{universe.subtitle}</p>
          <p className="universe-description">{universe.description}</p>
        </>;
        return (
          <article className="universe" key={universe.name}>
            {content}
          </article>
        );
      })}
    </div>
  );
}
