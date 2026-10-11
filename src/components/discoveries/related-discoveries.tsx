import { ArrowUpRight } from "lucide-react";
import type { Discovery } from "@/types/discoveries";
import { discoveryPath } from "@/lib/discoveries";
import { ContextLink } from "./context-link";

export function RelatedDiscoveries({ title, items, contexts }: { title: string; items: readonly Discovery[]; contexts: readonly string[] }) {
  if (!items.length) return null;
  return (
    <section className="discovery-sheet-related" aria-label={title}>
      <h2>{title}</h2>
      <ul>{items.map((item) => <li key={item.id}>
        <ContextLink href={discoveryPath(item)} allowedContexts={contexts}>{item.title}<ArrowUpRight size={15} aria-hidden="true" /></ContextLink>
      </li>)}</ul>
    </section>
  );
}
