import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { DiscoveryCardData } from "@/types/discoveries";
import { DiscoveryImage } from "./discovery-image";
import { ContextLink } from "./context-link";

export function DiscoveryCard({ item, contexts }: { item: DiscoveryCardData; contexts?: readonly string[] }) {
  const content = <>
    <DiscoveryImage photograph={item.photograph} title={item.title} />
    <div className="discovery-card-copy">
      {item.imageNote && <p className="card-photo-note">{item.imageNote}</p>}
      <p className="eyebrow">{item.typeLabel}</p>
      <h3>{item.title}</h3>
      {item.originalName && <p className="card-original-name" lang="ja">{item.originalName}</p>}
      <p className="discovery-location"><MapPin size={15} strokeWidth={1.5} aria-hidden="true" />{item.locationLabel}</p>
      <p className="discovery-summary">{item.summary}</p>
      {item.practicalDetails && <dl className="card-practical">{item.practicalDetails.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
      <div className="discovery-tags">{item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <span className="card-invitation">Voir la fiche<ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" /></span>
    </div>
  </>;
  return <article className="discovery-card">{contexts ? <ContextLink href={item.href} allowedContexts={contexts} ariaLabel={`Voir la fiche : ${item.title}`}>{content}</ContextLink> : <Link href={item.href} aria-label={`Voir la fiche : ${item.title}`}>{content}</Link>}</article>;
}
