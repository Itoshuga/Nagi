import Link from 'next/link';
import { ArrowUpRight, Building2, FileText, Globe2, Users } from 'lucide-react';
import { Badge, Button, Card } from '@nagi/ui';
import { getOverview } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
export const metadata = { title: 'Administration' };
export default async function Overview() {
  await requireAdmin();
  const stats = await getOverview(await sessionDatabase());
  return (
    <>
      <p className="mb-3 text-[10px] uppercase tracking-[.2em] text-primary-ink">
        Un regard sur Nagi
      </p>
      <h1 className="display-title font-display">Vue d’ensemble</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Votre espace pour faire grandir les découvertes.
      </p>
      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pays', value: stats.countries, Icon: Globe2, href: 'countries' },
          { label: 'Villes', value: stats.cities, Icon: Building2, href: 'cities' },
          { label: 'Fiches', value: stats.entries, Icon: FileText, href: 'entries' },
          { label: 'Utilisateurs', value: stats.profiles, Icon: Users, href: 'users' },
        ].map(({ label, value, Icon, href }) => (
          <Card key={label}>
            <div className="flex justify-between text-muted-foreground">
              <p className="text-xs">{label}</p>
              <Icon className="size-4" strokeWidth={1.5} />
            </div>
            <p className="mt-8 text-4xl font-light tracking-tight tabular-nums">{value}</p>
            <Link
              href={`/admin/${href}`}
              className="mt-6 flex items-center gap-1 text-xs text-primary-ink"
            >
              Consulter
              <ArrowUpRight className="size-3" />
            </Link>
          </Card>
        ))}
      </div>
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-6 py-8">
        <div>
          <Badge>Discord</Badge>
          <h2 className="mt-4 text-lg font-medium">Un même univers, deux points d’entrée.</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            Consultez la présence du bot et le registre de commandes partagé avec votre serveur.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/admin/bot">
            Voir le bot
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </Card>
    </>
  );
}
