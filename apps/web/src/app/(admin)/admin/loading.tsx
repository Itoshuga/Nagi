import { Skeleton } from '@nagi/ui';
export default function Loading() {
  return (
    <div role="status" aria-label="Chargement de l’administration" className="space-y-7">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
