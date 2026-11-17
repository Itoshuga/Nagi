import { BookOpen, Globe2, MapPin } from 'lucide-react';
import { Badge } from '@nagi/ui';
import { requireGuild, spaceServices } from '@/features/spaces/server';
export const metadata = { title: 'Découvrir' };
export default async function Discover({ params }: { params: Promise<{ guildId: string }> }) {
  await requireGuild((await params).guildId);
  const catalog = await (await spaceServices()).catalog.browse();
  return (
    <>
      <p className="space-eyebrow mb-4">Le catalogue mondial Nagi</p>
      <h1 className="space-title">
        Et si on allait voir ailleurs<span className="text-primary">?</span>
      </h1>
      <p className="mb-10 mt-5 max-w-xl text-sm leading-7 text-muted-foreground">
        Les destinations et les lieux référencés par l’équipe Nagi. Bientôt, vous pourrez les
        intégrer aux itinéraires de votre groupe.
      </p>
      {catalog.countries.length ? (
        <section>
          <h2 className="mb-5 text-xl font-extrabold">Les destinations</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.countries.map((country) => (
              <article className="space-panel p-6" key={country.id}>
                <Globe2 className="mb-7 size-6 text-primary-ink" strokeWidth={1.5} />
                <p className="text-xs text-muted-foreground">{country.code ?? 'Destination'}</p>
                <h3 className="mt-2 text-xl font-extrabold">{country.name}</h3>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="space-panel flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <BookOpen className="mb-5 size-8 text-primary-ink" strokeWidth={1.5} />
          <h2 className="text-xl font-extrabold">Les découvertes se préparent.</h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            Les premières destinations apparaîtront ici au fil des publications de l’équipe Nagi.
          </p>
        </div>
      )}
      {catalog.entries.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-5 text-xl font-extrabold">À découvrir</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.entries.map((entry) => (
              <article className="space-panel p-6" key={entry.id}>
                <Badge>{entry.categories?.name}</Badge>
                <h3 className="mt-5 text-lg font-extrabold">{entry.title}</h3>
                <p className="mt-3 line-clamp-3 text-sm leading-7 text-muted-foreground">
                  {entry.description}
                </p>
                <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {entry.cities?.name}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
