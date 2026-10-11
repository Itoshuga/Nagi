import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/destinations/breadcrumbs";
import { universeDetails } from "@/data/universes";
import { getActivitiesForVenue, getAddressesForSpecialty, getAssociatedVenue, getDiscoveryGeography, getSpecialtiesForAddress, discoveryType } from "@/lib/discoveries";
import { explorerPath, getNavigationContexts, resolveGeography } from "@/lib/discovery-geography";
import { cityPath, countryPath } from "@/lib/destinations";
import type { Discovery } from "@/types/discoveries";
import { DiscoveryImage } from "./discovery-image";
import { PhotoCredit } from "./photo-credit";
import { PracticalInformation } from "./practical-information";
import { RelatedDiscoveries } from "./related-discoveries";
import { ContextReturn } from "./context-return";

export function DiscoveryArticle({ item }: { item: Discovery }) {
  const universe = universeDetails[item.universe];
  const geographies = getDiscoveryGeography(item).flatMap((reference) => {
    const value = resolveGeography(reference);
    return value ? [value] : [];
  });
  const primary = geographies.find((scope) => scope.reference.kind !== "country" && !scope.hasDistricts)
    ?? geographies.find((scope) => scope.reference.kind !== "country") ?? geographies[0];
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Destinations", href: "/destinations" },
    ...(primary ? [{ label: primary.country.name, href: countryPath(primary.country) }] : []),
    ...(primary?.city ? [{ label: primary.city.name, href: cityPath(primary.country, primary.city) }] : []),
    ...(primary?.district ? [{ label: primary.district.name, href: primary.path }] : []),
    ...(primary && primary.reference.kind !== "country" && !primary.hasDistricts ? [{ label: universe.name, href: explorerPath(primary.reference, item.universe) }] : []),
    { label: item.title },
  ];
  const contexts = getNavigationContexts();
  const contextIds = contexts.map((context) => context.key);
  const venue = item.universe === "activites" ? getAssociatedVenue(item) : undefined;
  const related = item.universe === "gastronomie" ? getAddressesForSpecialty(item.id)
    : item.universe === "adresses" ? getSpecialtiesForAddress(item.id)
    : item.universe === "activites" ? (venue ? [venue] : [])
    : getActivitiesForVenue(item.id);
  const relatedTitle = item.universe === "gastronomie" ? "Où goûter"
    : item.universe === "adresses" ? "À la carte"
    : item.universe === "activites" ? "Le lieu" : "À vivre ici";
  const officialUrl = item.universe === "tourisme" ? item.officialUrl
    : item.universe === "adresses" ? item.website
    : item.universe === "activites" && item.format === "offered-experience" ? item.bookingUrl : undefined;
  const externalUrl = officialUrl ?? item.sources[0]?.url;

  return (
    <>
    <Breadcrumbs items={breadcrumbs} />
    <article className={`discovery-sheet section-shell discovery-sheet-${item.universe}`}>
      <div className="discovery-sheet-copy">
        <ContextReturn contexts={contexts} universe={item.universe} universeName={universe.name} fallbackId={primary?.reference.id} compact />
        <header className="discovery-sheet-heading">
          <p className="eyebrow">{universe.name} · {discoveryType(item)}</p>
          <h1>{item.title}</h1>
          {item.universe === "gastronomie" && <p className="discovery-sheet-original" lang="ja">{item.originalName}</p>}
          <p className="discovery-sheet-location">
            {item.universe === "gastronomie" ? item.origins : primary && <Link href={primary.path}>{primary.label}</Link>}
          </p>
        </header>
        <p className="discovery-sheet-summary">{item.summary}</p>
        <PracticalInformation item={item} />
        <RelatedDiscoveries title={relatedTitle} items={related} contexts={contextIds} />
        {externalUrl && <a className="discovery-sheet-external" href={externalUrl}>
          {officialUrl ? "Consulter le site officiel" : "En savoir plus"}
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>}
      </div>
      <figure className="discovery-sheet-visual">
        <DiscoveryImage photograph={item.photograph} title={item.title} priority sizes="(max-width: 760px) 92vw, 55vw" />
        {item.photograph && <figcaption className="discovery-sheet-caption">
          {item.photographCaption && <span>{item.photographCaption}</span>}
          <PhotoCredit src={item.photograph.src} />
        </figcaption>}
      </figure>
    </article>
    </>
  );
}
