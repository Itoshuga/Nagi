'use client';
import { Alert, Button } from '@nagi/ui';
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div>
      <h1 className="display-title mb-6 font-display">Données indisponibles</h1>
      <Alert>
        Nagi ne parvient pas à charger cette section. Vérifiez la connexion à Supabase et réessayez.
      </Alert>
      <Button variant="secondary" className="mt-6" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
