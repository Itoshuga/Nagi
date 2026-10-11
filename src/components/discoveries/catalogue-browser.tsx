"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import type { DiscoveryCardData } from "@/types/discoveries";
import { filterDiscoveryCards } from "@/lib/discovery-filter";
import { DiscoveryCard } from "./discovery-card";

export function CatalogueBrowser({ items, name }: { items: readonly DiscoveryCardData[]; name: string }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const results = filterDiscoveryCards(items, query, tag);
  const tags = [...new Set(items.flatMap((item) => item.tags))].filter((value) => items.some((item) => !item.tags.includes(value)));
  const hasControls = items.length >= 4;
  return <>
    {hasControls && <div className="catalogue-controls">
      <div className="catalogue-search"><label htmlFor="catalogue-query">Rechercher dans ce carnet</label><div><Search size={17} strokeWidth={1.2} aria-hidden="true" /><input type="search" id="catalogue-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Un nom, une envie…`} autoComplete="off" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche"><X size={16} aria-hidden="true" /></button>}</div></div>
      {tags.length > 1 && <div className="catalogue-filter"><label htmlFor="catalogue-tag">Filtrer par thème</label><select id="catalogue-tag" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Tous les thèmes</option>{tags.map((value) => <option value={value} key={value}>{value}</option>)}</select></div>}
    </div>}
    <p className="catalogue-count" role="status" aria-live="polite">{results.length} {results.length > 1 ? "découvertes" : "découverte"} · {name}</p>
    {results.length > 0 ? <div className="discovery-grid">{results.map((item) => <DiscoveryCard key={item.id} item={item} />)}</div> : <div className="catalogue-empty"><p className="eyebrow">Un autre regard</p><h3>Aucune découverte pour cette recherche.</h3><p>Essayez un autre mot ou retrouvez l’ensemble de la sélection.</p><button type="button" className="button button-secondary reset-catalogue" onClick={() => { setQuery(""); setTag(""); }}>Réinitialiser les filtres</button></div>}
  </>;
}
