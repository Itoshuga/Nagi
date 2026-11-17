'use client';
import { Alert, Button } from '@nagi/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-6 py-24">
      <h1 className="mb-5 font-display text-3xl">Un instant, le temps de retrouver le chemin.</h1>
      <Alert>
        Les données ne sont pas disponibles pour le moment. Réessayez dans quelques instants.
      </Alert>
      <Button className="mt-6" onClick={reset}>
        Réessayer
      </Button>
    </main>
  );
}
