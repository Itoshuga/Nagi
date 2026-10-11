import { DestinationTabs } from "@/components/discoveries/destination-tabs";
import { getDiscoveriesForDestination, toDiscoveryCard } from "@/lib/discoveries";
import type { LocalDestination } from "@/types/discoveries";

export function PlaceUniverses({ name, scope }: { name: string; scope: LocalDestination }) {
  const cards = getDiscoveriesForDestination(scope).map((item) => toDiscoveryCard(item, scope));
  return (
    <section className="destination-exploration section-shell" id="univers" aria-labelledby="universes-title">
      <div className="section-heading">
        <p className="eyebrow">Le carnet · {name}</p>
        <div><h2 id="universes-title">Quatre façons de découvrir.</h2><p className="section-introduction">Les lieux, les gestes, les saveurs et les rencontres : quatre regards pour approcher {name}.</p></div>
      </div>
      <DestinationTabs name={name} selection={{
        tourisme: cards.filter((item) => item.universe === "tourisme"),
        activites: cards.filter((item) => item.universe === "activites"),
        gastronomie: cards.filter((item) => item.universe === "gastronomie"),
        adresses: cards.filter((item) => item.universe === "adresses"),
      }} />
    </section>
  );
}
