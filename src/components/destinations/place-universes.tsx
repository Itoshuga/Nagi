import { getPublicGeography } from "@/lib/geography/public";
import { DestinationTabs } from "@/components/discoveries/destination-tabs";
import { toDiscoveryCard } from "@/lib/discoveries";
import { contentSource, getDestinationContents } from "@/lib/contents/public";
import { selectedUniverse } from "@/lib/universe-navigation";
import Link from "next/link";
import type { LocalDestination } from "@/types/discoveries";

export async function PlaceUniverses({ name, scope, query = {} }: { name: string; scope: LocalDestination; query?: Record<string, string | string[] | undefined> }) {
  const geography = await getPublicGeography();
  const managed = contentSource() === "firestore";
  const selected = selectedUniverse(Array.isArray(query.onglet) ? query.onglet : query.onglet ? [query.onglet] : []);
  const result = await getDestinationContents(scope, selected, typeof query.apres === "string" ? query.apres : undefined);
  const all = managed ? result.items : (await Promise.all((["tourisme", "activites", "gastronomie", "adresses"] as const).map(async (type) => (await getDestinationContents(scope, type)).items))).flat();
  const cards = all.map((item) => toDiscoveryCard(item, scope, geography));
  return (
    <section className="destination-exploration section-shell" id="univers" aria-labelledby="universes-title">
      <div className="section-heading">
        <p className="eyebrow">Le carnet · {name}</p>
        <div><h2 id="universes-title">Quatre façons de découvrir.</h2><p className="section-introduction">Les lieux, les gestes, les saveurs et les rencontres : quatre regards pour approcher {name}.</p></div>
      </div>
      <DestinationTabs name={name} managed={managed} selection={{
        tourisme: cards.filter((item) => item.universe === "tourisme"),
        activites: cards.filter((item) => item.universe === "activites"),
        gastronomie: cards.filter((item) => item.universe === "gastronomie"),
        adresses: cards.filter((item) => item.universe === "adresses"),
      }} />
      {result.nextCursor && <Link className="return-link" href={`?onglet=${selected}&apres=${encodeURIComponent(result.nextCursor)}#univers`}>Découvertes suivantes →</Link>}
    </section>
  );
}
