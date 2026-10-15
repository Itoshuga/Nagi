"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { DiscoveryCardData } from "@/types/discoveries";
import { filterDiscoveryCards } from "@/lib/discovery-filter";
import { DiscoveryCard } from "./discovery-card";

export function CatalogueBrowser({ items, name, query, empty, hasMore }: { items: readonly DiscoveryCardData[]; name: string; query: string; empty: string; hasMore: boolean }) {
  const [q, setQuery] = useState(query); const [tag, setTag] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const results = filterDiscoveryCards(items, "", tag);
  const tags = [...new Set(items.flatMap((item) => item.tags))];
  function search(value: string) {
    const next = new URLSearchParams(params.toString()); next.delete("apres");
    if (value.trim()) next.set("q", value.trim()); else next.delete("q");
    startTransition(() => router.push(`${pathname}?${next}#univers`, { scroll: false }));
  }
  return <div aria-busy={pending}>
    <div className="catalogue-controls">
      <form className="catalogue-search" onSubmit={(event) => { event.preventDefault(); search(q); }}><label htmlFor="catalogue-query">Rechercher un titre dans ce carnet</label><div><Search size={17} strokeWidth={1.2} aria-hidden="true" /><input type="search" id="catalogue-query" value={q} maxLength={120} onChange={(event) => setQuery(event.target.value)} placeholder="Le début d’un titre…" autoComplete="off" /><button type="submit" disabled={pending} aria-label="Lancer la recherche"><Search size={17} /></button></div></form>
      {tags.length > 1 && <div className="catalogue-filter"><label htmlFor="catalogue-tag">Thème sur cette page</label><select id="catalogue-tag" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Tous les thèmes</option>{tags.map((value) => <option value={value} key={value}>{value}</option>)}</select></div>}
    </div>
    <p className="catalogue-count" role="status" aria-live="polite">{results.length} {results.length > 1 ? "découvertes affichées" : "découverte affichée"} sur cette page · {name}</p>
    {results.length ? <div className="discovery-grid">{results.map((item) => <DiscoveryCard key={item.id} item={item} />)}</div> : <div className="catalogue-empty"><p className="eyebrow">{name}</p><h3>{query || tag ? "Aucune découverte pour cette recherche." : hasMore ? "Poursuivre la découverte." : "Une page encore à écrire."}</h3><p>{query || tag ? "Essayez le début d’un autre titre ou retrouvez la sélection." : hasMore ? "Aucune fiche visible sur cette page. Continuez avec les découvertes suivantes." : empty}</p>{(query || tag) && <button type="button" className="button button-secondary reset-catalogue" onClick={() => { setQuery(""); setTag(""); search(""); }}>Réinitialiser les filtres</button>}</div>}
  </div>;
}
