import { DestinationTabs } from "@/components/discoveries/destination-tabs";
import { toDiscoveryCard } from "@/lib/discoveries";
import { getDestinationContents } from "@/lib/contents/public";
import { selectedUniverse } from "@/lib/universe-navigation";
import Link from "next/link";
import type { LocalDestination } from "@/types/discoveries";

export async function PlaceUniverses({ name, scope, query = {} }: { name: string; scope: LocalDestination; query?: Record<string, string | string[] | undefined> }) {
  const selected = selectedUniverse(Array.isArray(query.onglet) ? query.onglet : query.onglet ? [query.onglet] : []);
  const q = typeof query.q === "string" ? query.q.slice(0, 120).trim() : "";
  const result = await getDestinationContents(scope, selected, typeof query.apres === "string" ? query.apres : undefined, q);
  const cards = result.items.map((item) => toDiscoveryCard(item, scope, result.geography));
  const next = new URLSearchParams({ onglet: selected });
  if (result.nextCursor) next.set("apres", result.nextCursor);
  if (q) next.set("q", q);
  if (typeof query.quartiers === "string") next.set("quartiers", query.quartiers);
  return (
    <section className="destination-exploration section-shell" id="univers" aria-labelledby="universes-title">
      <div className="section-heading"><p className="eyebrow">Le carnet · {name}</p><div><h2 id="universes-title">Quatre façons de découvrir.</h2><p className="section-introduction">Les lieux, les gestes, les saveurs et les rencontres : quatre regards pour approcher {name}.</p></div></div>
      {result.invalidCursor && <p role="alert">Cette page a expiré. <Link href={`?onglet=${selected}#univers`}>Revenir à la sélection</Link>.</p>}
      <DestinationTabs name={name} q={q} hasMore={Boolean(result.nextCursor)} selection={{ tourisme: cards.filter((item) => item.universe === "tourisme"), activites: cards.filter((item) => item.universe === "activites"), gastronomie: cards.filter((item) => item.universe === "gastronomie"), adresses: cards.filter((item) => item.universe === "adresses") }} />
      {result.nextCursor && <Link className="return-link" href={`?${next}#univers`}>Découvertes suivantes →</Link>}
    </section>
  );
}
