import { assertAdmin, resolveRole, type Actor } from '@nagi/permissions';
import { categoryInputSchema, type CategoryInput } from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type BotRuntime = Database['public']['Tables']['bot_runtime']['Row'];
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
