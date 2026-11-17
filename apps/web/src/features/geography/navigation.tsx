import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@nagi/ui';
import { destinationPageSize } from '@nagi/database';
import { withQuery, type Breadcrumb } from './model';

export function Breadcrumbs({ links }: { links: Breadcrumb[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {links.map(({ label, href }, index) => (
          <li key={`${index}-${label}`} className="inline-flex min-w-0 items-center gap-2">
            {index > 0 && (
              <ChevronRight aria-hidden="true" className="size-3 shrink-0 opacity-60" />
            )}
            {href ? (
              <Link className="break-words hover:text-foreground hover:underline" href={href}>
                {label}
              </Link>
            ) : (
              <span aria-current="page" className="break-words font-medium text-foreground">
                {label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CatalogPagination({
  path,
  page,
  count,
  query = {},
}: {
  path: string;
  page: number;
  count: number;
  query?: Record<string, string | undefined>;
}) {
  const max = Math.max(1, Math.ceil(count / destinationPageSize));
  if (max === 1 && page === 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs tabular-nums text-muted-foreground">
        {page > max ? 'Cette page ne contient plus de résultats.' : `Page ${page} sur ${max}`}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="secondary" size="sm">
            <Link href={withQuery(path, { ...query, page: Math.min(page - 1, max) })}>
              <ChevronLeft className="size-4" /> Précédente
            </Link>
          </Button>
        )}
        {page < max && (
          <Button asChild variant="secondary" size="sm">
            <Link href={withQuery(path, { ...query, page: page + 1 })}>
              Suivante <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </nav>
  );
}
