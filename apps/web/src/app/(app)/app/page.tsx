import Link from 'next/link';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState } from '@nagi/ui';
import { listCountries } from '@nagi/database';
import { isAdmin } from '@nagi/permissions';
import { sessionDatabase } from '@/lib/supabase/server';
import { requireViewer } from '@/features/auth/session';
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const [viewer, db, params] = await Promise.all([
    requireViewer(),
    sessionDatabase(),
    searchParams,
  ]);
  const countries = await listCountries(db);
  return (
    <>
      {params.notice === 'forbidden' && (
        <Alert className="mb-8">L’administration est réservée aux utilisateurs autorisés.</Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-4 text-[10px] font-medium uppercase tracking-[.22em] text-primary-ink">
            Votre espace d’exploration
          </p>
          <h1 className="display-title font-display">Bonjour, {viewer.display_name}.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">
            Les plus beaux voyages commencent par une envie. Retrouvez ici les destinations et les
            découvertes de Nagi, au fil de leur publication.
          </p>
        </div>
        {isAdmin(viewer.role) && (
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin">
              Administration
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
      <section id="destinations" className="mt-14 scroll-mt-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-tight">Destinations</h2>
          <Badge>{countries.length} pays</Badge>
        </div>
        {countries.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {countries.map((country) => (
              <Card key={country.id}>
                <MapPin className="mb-10 size-5 text-primary-ink" strokeWidth={1.5} />
                <p className="text-xs text-muted-foreground">{country.code ?? 'Destination'}</p>
                <h3 className="mt-2 font-display text-2xl">{country.name}</h3>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Le monde s’ouvre bientôt à vous."
            description="Les premières destinations prendront place ici, au fil des découvertes partagées par l’équipe Nagi."
          />
        )}
      </section>
    </>
  );
}
