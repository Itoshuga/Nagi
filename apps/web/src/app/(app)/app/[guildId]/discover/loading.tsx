import { Skeleton } from '@nagi/ui';

export default function LoadingDiscover() {
  return (
    <div role="status" aria-label="Chargement des destinations">
      <Skeleton className="mb-5 h-12 w-60 max-w-full" />
      <Skeleton className="mb-9 h-5 w-96 max-w-full" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="aspect-[4/3]" />
      </div>
    </div>
  );
}
