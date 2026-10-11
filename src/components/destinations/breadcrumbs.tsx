import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs section-shell" aria-label="Fil d’Ariane">
      <ol>
        <li><Link href="/">Accueil</Link></li>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <ChevronRight size={11} strokeWidth={1} aria-hidden="true" />
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
