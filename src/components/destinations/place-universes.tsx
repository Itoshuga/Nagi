import { getPublicGeography } from "@/lib/geography/public";
import { DestinationTabs } from "@/components/discoveries/destination-tabs";
import { getDiscoveriesForDestination, toDiscoveryCard, visibleDiscoveryCatalogue } from "@/lib/discoveries";
import type { LocalDestination } from "@/types/discoveries";

export async function PlaceUniverses({ name, scope }: { name: string; scope: LocalDestination }) {
  const geography = await getPublicGeography();
  const cards = getDiscoveriesForDestination(scope, undefined, visibleDiscoveryCatalogue(geography), geography).map((item) => toDiscoveryCard(item, scope, geography));
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
