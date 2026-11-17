import { Skeleton } from '@nagi/ui';
export default function Loading() {
  return (
    <main id="main" className="selector-main" aria-label="Chargement des espaces" aria-busy="true">
      <Skeleton className="h-12 w-3/4 max-w-lg" />
      <Skeleton className="mt-6 h-4 w-2/3 max-w-sm" />
      <div className="mt-16 flex flex-wrap justify-center gap-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-5">
            <Skeleton className="size-28 rounded-full sm:size-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </main>
  );
}
