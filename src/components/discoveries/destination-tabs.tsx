"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { universeDetails } from "@/data/universes";
import { universeSlugs, type DiscoveryCardData, type UniverseSlug } from "@/types/discoveries";
import { changedTabPath, destinationTabPath, keyboardUniverse, selectedUniverse } from "@/lib/universe-navigation";
import { CatalogueBrowser } from "./catalogue-browser";

export function DestinationTabs({ name, selection, q, hasMore }: { name: string; selection: Record<UniverseSlug, readonly DiscoveryCardData[]>; q: string; hasMore: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = selectedUniverse(params.getAll("onglet"));
  const tabRefs = useRef<Partial<Record<UniverseSlug, HTMLAnchorElement | null>>>({});

  function selectTab(universe: UniverseSlug) {
    if (selected === universe) return;
    const query = new URLSearchParams(params.toString()); query.delete("apres");
    startTransition(() => router.push(changedTabPath(pathname, query.toString(), universe, "#univers"), { scroll: false }));
  }

  return <div className="destination-tabs" aria-busy={pending}>
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
      ><span>{universeDetails[slug].name}</span></a>)}
    </div>
    {universeSlugs.map((slug) => <div key={slug} role="tabpanel" id={`panel-${slug}`} aria-labelledby={`tab-${slug}`} tabIndex={0} hidden={selected !== slug} className="destination-tabpanel">
      {selected === slug && <>
        <div className="tab-introduction"><p className="tab-lead">{universeDetails[slug].lead}</p><p>{universeDetails[slug].description}</p></div>
        <CatalogueBrowser key={`${slug}:${q}`} items={selection[slug]} name={name} query={q} hasMore={hasMore} empty={universeDetails[slug].empty} />
      </>}
    </div>)}
  </div>;
}
