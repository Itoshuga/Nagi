import { Badge, Card, EmptyState } from '@nagi/ui';
import { listCategories, listContent, type ContentTable } from '@nagi/database';
import { sessionDatabase } from '@/lib/supabase/server';
import { CategoryDialog } from '@/features/categories/category-dialog';
const tables: Record<string, ContentTable> = {
  countries: 'countries',
  cities: 'cities',
  neighborhoods: 'neighborhoods',
  categories: 'categories',
  entries: 'entries',
  relations: 'entry_relations',
};
export async function ContentPanel({ section }: { section: string }) {
  const db = await sessionDatabase();
  const table = tables[section];
  if (!table) return null;
  const rows = table === 'categories' ? await listCategories(db) : await listContent(db, table);
  return (
    <div className="mt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {table === 'categories'
            ? 'Ordre de présentation des catégories.'
            : 'Jusqu’à 100 éléments récents.'}
        </p>
        {section === 'categories' && <CategoryDialog />}
      </div>
      {rows.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-normal">
                  {section === 'relations' ? 'Type de relation' : 'Nom'}
                </th>
                <th className="px-6 py-4 font-normal">
                  {section === 'categories' ? 'Position' : 'Détail'}
                </th>
                <th className="px-6 py-4 font-normal">Ajout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const item = row as unknown as Record<string, unknown>;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-5">
                      <p className="font-medium">{String(item.name ?? item.title ?? item.kind)}</p>
                      {item.slug ? (
                        <p className="mt-1 text-xs text-muted-foreground">{String(item.slug)}</p>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      {section === 'categories' ? (
                        String(item.position)
                      ) : section === 'cities' ? (
                        <Badge>
                          {item.neighborhoods_enabled ? 'Avec quartiers' : 'Sans quartiers'}
                        </Badge>
                      ) : section === 'entries' ? (
                        <Badge>{item.published ? 'Publiée' : 'Brouillon'}</Badge>
                      ) : section === 'relations' ? (
                        <Badge>{item.bidirectional ? 'Bidirectionnelle' : 'Orientée'}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{String(item.code ?? '—')}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-5 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(
                        new Date(row.created_at),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          title="Tout commence par une découverte."
          description="Aucun élément n’a encore été ajouté dans cette section."
        />
      )}
    </div>
  );
}
