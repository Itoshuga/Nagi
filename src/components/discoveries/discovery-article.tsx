import { getPublicContentBundle } from "@/lib/contents/public";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/destinations/breadcrumbs";
import { universeDetails } from "@/data/universes";
import { getActivitiesForVenue, getAddressesForSpecialty, getAssociatedVenue, getDiscoveryGeography, getSpecialtiesForAddress, discoveryType } from "@/lib/discoveries";
import { explorerPath, getNavigationContexts, resolveGeography } from "@/lib/discovery-geography";
import { cityPath, countryPath } from "@/lib/destinations";
import type { Discovery } from "@/types/discoveries";
import type { PublicGeography } from "@/types/destinations";
import { notFound } from "next/navigation";
import { DiscoveryImage } from "./discovery-image";
import { PhotoCredit } from "./photo-credit";
import { PracticalInformation } from "./practical-information";
import { RelatedDiscoveries } from "./related-discoveries";
import { ContextReturn } from "./context-return";

export async function DiscoveryArticle({ item: initial, preview }: { item: Discovery; preview?: { geography: PublicGeography; catalogue: Discovery[] } }) {
  const bundle = preview ? { item: initial, catalogue: preview.catalogue, geography: preview.geography } : await getPublicContentBundle(initial.universe, initial.slug);
  if (!bundle.item) notFound();
  const geography = bundle.geography;
  const item = bundle.item; const catalogue = bundle.catalogue;
  const universe = universeDetails[item.universe];
  const geographies = getDiscoveryGeography(item).flatMap((reference) => {
    const value = resolveGeography(reference, geography);
    return value ? [value] : [];
  });
  const primary = geographies.find((scope) => scope.reference.kind !== "country" && !scope.hasDistricts)
    ?? geographies.find((scope) => scope.reference.kind !== "country") ?? geographies[0];
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Destinations", href: "/destinations" },
    ...(primary ? [{ label: primary.country.name, href: countryPath(primary.country) }] : []),
    ...(primary?.city ? [{ label: primary.city.name, href: cityPath(primary.country, primary.city) }] : []),
    ...(primary?.district ? [{ label: primary.district.name, href: primary.path }] : []),
    ...(primary && primary.reference.kind !== "country" ? [{ label: universe.name, href: explorerPath(primary.reference, item.universe, geography) }] : []),
    { label: item.title },
  ];
  const contexts = getNavigationContexts(geography);
  const contextIds = contexts.map((context) => context.key);
  const venue = item.universe === "activites" ? getAssociatedVenue(item, catalogue) : undefined;
  const related = item.universe === "gastronomie" ? getAddressesForSpecialty(item.id, catalogue)
    : item.universe === "adresses" ? [...getSpecialtiesForAddress(item.id, catalogue), ...getActivitiesForVenue(item.id, catalogue)]
    : item.universe === "activites" ? [...(venue ? [venue] : []), ...catalogue.filter((candidate) => candidate.id === item.organizer?.id)]
    : getActivitiesForVenue(item.id, catalogue);
  const relatedTitle = item.universe === "gastronomie" ? "Où goûter"
    : item.universe === "adresses" ? "Spécialités & expériences"
    : item.universe === "activites" ? "Lieux & organisateurs" : "À vivre ici";
  const officialUrl = item.universe === "tourisme" ? item.officialUrl
    : item.universe === "adresses" ? item.website
    : item.universe === "activites" && item.format === "offered-experience" ? item.bookingUrl : undefined;
  const externalUrl = officialUrl ?? item.sources[0]?.url;
  const bookingUrl = item.universe === "adresses" || item.universe === "activites" && item.format === "offered-experience" ? item.bookingUrl : undefined;

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
          <PhotoCredit photograph={item.photograph} />
        </figcaption>}
      </figure>
    </article>
    <section className="discovery-story section-shell" aria-label="Le carnet en détail">
      <div className="discovery-story-text"><h2>À découvrir</h2>{item.description.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {item.sections?.map((section) => <section key={section.title}><h2>{section.title}</h2><p className="discovery-preserve-lines">{section.text}</p></section>)}
      {!item.sections && item.universe === "gastronomie" && <section><h2>Origine & histoire</h2>{item.history.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<h2>Variantes</h2><p>{item.variants.join(" · ")}</p></section>}
      {!!item.tags.length && <p className="discovery-story-tags">{item.tags.join(" · ")}</p>}
      <PracticalInformation item={item} complete />
      {bookingUrl && bookingUrl !== externalUrl && <p><a href={bookingUrl}>Consulter les modalités de réservation</a></p>}
      {!!item.sources.length && <section><h2>Pour aller plus loin</h2><ul>{item.sources.map((source) => <li key={`${source.label}-${source.url}`}><a href={source.url}>{source.label}</a></li>)}</ul>{item.verifiedAt && <p>Informations vérifiées le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(item.verifiedAt))}.</p>}</section>}
      </div>
    </section>
    </>
  );
}
