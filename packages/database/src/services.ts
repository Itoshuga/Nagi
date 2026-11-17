import { assertAdmin, resolveRole, type Actor } from '@nagi/permissions';
import {
  categoryInputSchema,
  entryInputSchema,
  relationInputSchema,
  type CategoryInput,
} from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type BotRuntime = Database['public']['Tables']['bot_runtime']['Row'];
export type ContentTable =
  'countries' | 'cities' | 'neighborhoods' | 'categories' | 'entries' | 'entry_relations';

export async function findActor(
  db: NagiDatabase,
  discordId: string,
  owners: readonly string[],
): Promise<Actor> {
  // Fail closed when Supabase is unavailable, including for privileged commands.
  const { data, error } = await db
    .from('profiles')
    .select('role')
    .eq('discord_id', discordId)
    .maybeSingle();
  if (error) throw new Error('Impossible de vérifier les permissions Nagi.', { cause: error });
  return { discordId, role: resolveRole(discordId, data?.role, owners) };
}
export async function listCountries(db: NagiDatabase) {
  const { data, error } = await db.from('countries').select('*').order('name');
  if (error) throw new Error('Impossible de charger les destinations.', { cause: error });
  return data;
}
export async function listContent(db: NagiDatabase, table: ContentTable) {
  const { data, error } = await db
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error('Impossible de charger le contenu.', { cause: error });
  return data;
}
export async function listCategories(db: NagiDatabase) {
  const { data, error } = await db.from('categories').select('*').order('position').order('name');
  if (error) throw new Error('Impossible de charger les catégories.', { cause: error });
  return data;
}
export async function createCategory(db: NagiDatabase, actor: Actor, input: CategoryInput) {
  assertAdmin(actor);
  const values = categoryInputSchema.parse(input);
  const { data, error } = await db.from('categories').insert(values).select().single();
  if (error)
    throw new Error('Impossible de créer cette catégorie. Vérifiez son slug.', { cause: error });
  return data;
}
export async function createEntry(db: NagiDatabase, actor: Actor, input: unknown) {
  assertAdmin(actor);
  const values = entryInputSchema.parse(input);
  const city = await db.from('cities').select('country_id').eq('id', values.city_id).single();
  if (city.error)
    throw new Error('Impossible de charger la ville de cette fiche.', { cause: city.error });
  const { data, error } = await db
    .from('entries')
    .insert({ ...values, country_id: city.data.country_id })
    .select()
    .single();
  if (error)
    throw new Error('Impossible de créer cette fiche. Vérifiez sa localisation et son slug.', {
      cause: error,
    });
  return data;
}
export async function createRelation(db: NagiDatabase, actor: Actor, input: unknown) {
  assertAdmin(actor);
  const values = relationInputSchema.parse(input);
  if (values.bidirectional && values.source_id > values.target_id) {
    [values.source_id, values.target_id] = [values.target_id, values.source_id];
  }
  const type = await db.from('relation_types').select('id').eq('slug', values.kind).single();
  if (type.error)
    throw new Error('Impossible de trouver le type de relation.', { cause: type.error });
  const { data, error } = await db
    .from('entry_relations')
    .insert({ ...values, relation_type_id: type.data.id })
    .select()
    .single();
  if (error) throw new Error('Impossible de créer cette relation.', { cause: error });
  return data;
}
export async function getOverview(db: NagiDatabase) {
  const tables = ['countries', 'cities', 'entries', 'profiles'] as const;
  const results = await Promise.all(
    tables.map((table) => db.from(table).select('*', { count: 'exact', head: true })),
  );
  const failed = results.find((result) => result.error || result.count === null);
  if (failed) throw new Error('Impossible de charger les indicateurs.', { cause: failed.error });
  return Object.fromEntries(tables.map((table, i) => [table, results[i]?.count ?? 0])) as Record<
    (typeof tables)[number],
    number
  >;
}
export async function getBotRuntime(
  db: NagiDatabase,
  applicationId: string,
  scope: string,
): Promise<BotRuntime | null> {
  const { data, error } = await db
    .from('bot_runtime')
    .select('*')
    .eq('application_id', applicationId)
    .eq('scope', scope)
    .maybeSingle();
  if (error) throw new Error('Statut Discord indisponible.', { cause: error });
  return data;
}
export async function requestSync(
  db: NagiDatabase,
  applicationId: string,
  scope: string,
  reason: 'web-startup' | 'bot-startup' | 'admin',
) {
  const { data, error } = await db.rpc('enqueue_bot_sync', {
    p_application_id: applicationId,
    p_scope: scope,
    p_reason: reason,
  });
  if (error)
    throw new Error('Impossible de mettre la synchronisation en attente.', { cause: error });
  return data;
}
export async function configureOwners(db: NagiDatabase, ids: string[]) {
  const { error } = await db.rpc('configure_owners', { p_ids: ids });
  if (error) throw new Error('Impossible de configurer les propriétaires Nagi.', { cause: error });
}
