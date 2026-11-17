import { Skeleton } from '@nagi/ui';
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement de l’espace">
      <Skeleton className="mb-10 h-56 w-full rounded-[2rem]" />
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
