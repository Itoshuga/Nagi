'use client';
import Link from 'next/link';
import { Button } from '@nagi/ui';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="space-title">Un instant, on reprend.</h1>
      <p className="my-6 text-sm text-muted-foreground">
        Impossible de charger cet espace pour le moment.
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <Button asChild variant="secondary">
          <Link href="/select-server">Mes espaces</Link>
        </Button>
      </div>
    </div>
  );
}
