'use client';
import { Button } from '@nagi/ui';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="selector-main text-center">
      <h1 className="space-title">Vos espaces attendront un instant.</h1>
      <p className="my-6 text-sm text-muted-foreground">
        Impossible de les charger pour le moment.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
