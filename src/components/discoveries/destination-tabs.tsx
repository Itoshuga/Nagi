"use client";

import { useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { universeDetails } from "@/data/universes";
import { universeSlugs, type DiscoveryCardData, type UniverseSlug } from "@/types/discoveries";
import { changedTabPath, destinationTabPath, keyboardUniverse, selectedUniverse } from "@/lib/universe-navigation";
import { CatalogueBrowser } from "./catalogue-browser";

export function DestinationTabs({ name, selection }: { name: string; selection: Record<UniverseSlug, readonly DiscoveryCardData[]> }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = selectedUniverse(params.getAll("onglet"));
  const tabRefs = useRef<Partial<Record<UniverseSlug, HTMLAnchorElement | null>>>({});

  function selectTab(universe: UniverseSlug) {
    if (selected === universe) return;
    // Next synchronise useSearchParams avec l’historique natif, sans requête
    // de navigation ni défilement vers l’ancre lors du changement d’onglet.
    window.history.pushState(null, "", changedTabPath(pathname, window.location.search, universe, window.location.hash));
  }

  return <div className="destination-tabs">
    <div role="tablist" aria-label={`Les univers de ${name}`} aria-orientation="horizontal" className="destination-tablist">
      {universeSlugs.map((slug) => <a
        key={slug} ref={(element) => { tabRefs.current[slug] = element; }}
        id={`tab-${slug}`} href={destinationTabPath(pathname, slug)} role="tab"
        aria-selected={selected === slug} aria-controls={`panel-${slug}`} tabIndex={selected === slug ? 0 : -1}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          selectTab(slug);
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const next = keyboardUniverse(slug, event.key);
          if (next) {
            event.preventDefault();
            selectTab(next);
            tabRefs.current[next]?.focus({ preventScroll: true });
            tabRefs.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
          } else if (event.key === " ") {
            event.preventDefault();
            selectTab(slug);
          }
        }}
      ><span>{universeDetails[slug].name}</span><span className="tab-count" aria-hidden="true">{selection[slug].length}</span></a>)}
    </div>
    {universeSlugs.map((slug) => <div key={slug} role="tabpanel" id={`panel-${slug}`} aria-labelledby={`tab-${slug}`} tabIndex={0} hidden={selected !== slug} className="destination-tabpanel">
      {selected === slug && <>
        <div className="tab-introduction"><p className="tab-lead">{universeDetails[slug].lead}</p><p>{universeDetails[slug].description}</p></div>
        {selection[slug].length > 0 ? <CatalogueBrowser key={slug} items={selection[slug]} name={name} /> : <div className="catalogue-empty"><p className="eyebrow">{name} · {universeDetails[slug].name}</p><h3>Une page encore à écrire.</h3><p>{universeDetails[slug].empty}</p></div>}
      </>}
    </div>)}
  </div>;
}
