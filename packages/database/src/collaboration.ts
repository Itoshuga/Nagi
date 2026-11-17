import { tripInputSchema, type TripInput } from '@nagi/shared';
import type { NagiDatabase } from './client';
export type Trip = import('./database.types').Database['public']['Tables']['trips']['Row'];

export class GuildPreferencesService {
  constructor(private readonly db: NagiDatabase) {}
  async get(userId: string) {
    const { data, error } = await this.db
      .from('user_guild_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error('Vos préférences sont indisponibles.', { cause: error });
    return data;
  }
  async select(userId: string, guildId: string, favorite = false) {
    const previous = await this.get(userId);
    // A switch changes the active space. Only a first choice or an explicit action changes the favorite.
    const values = {
      default_guild_id:
        favorite || !previous?.default_guild_id ? guildId : previous.default_guild_id,
      last_active_guild_id: guildId,
    };
    const result = previous
      ? await this.db.from('user_guild_preferences').update(values).eq('user_id', userId)
      : await this.db.from('user_guild_preferences').insert({ user_id: userId, ...values });
    if (result.error)
      throw new Error('Impossible de mémoriser cet espace.', { cause: result.error });
  }
}
export class TripService {
  constructor(private readonly db: NagiDatabase) {}
  async list(guildId: string, limit = 50) {
    const { data, error } = await this.db
      .from('trips')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error('Les voyages sont momentanément indisponibles.', { cause: error });
    return data;
  }
  async get(guildId: string, tripId: string) {
    const { data, error } = await this.db
      .from('trips')
      .select('*')
      .eq('guild_id', guildId)
      .eq('id', tripId)
      .maybeSingle();
    if (error) throw new Error('Impossible de charger ce voyage.', { cause: error });
    return data;
  }
  async create(guildId: string, userId: string, input: TripInput) {
    const values = tripInputSchema.parse(input);
    const { data, error } = await this.db
      .from('trips')
      .insert({ ...values, guild_id: guildId, created_by: userId })
      .select('*')
      .single();
    if (error) throw new Error('Impossible de créer le voyage. Réessayez.', { cause: error });
    return data;
  }
  async author(tripId: string) {
    const { data, error } = await this.db.rpc('trip_author_card', { p_trip_id: tripId });
    if (error) throw new Error('Impossible de charger l’auteur du voyage.');
    return data;
  }
  async items(tripId: string) {
    const { data, error } = await this.db
      .from('trip_items')
      .select('id, notes, entries(id, title, description)')
      .eq('trip_id', tripId)
      .order('sort_order');
    if (error) throw new Error('Impossible de charger les étapes.');
    return data;
  }
}
