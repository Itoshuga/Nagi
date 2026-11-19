import {
  destinationNamePattern,
  sortTripDays,
  tripInputSchema,
  tripSettingsSchema,
  type TripEdit,
  type TripInput,
  type TripSettings,
} from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Json } from './database.types';
import type { ProfileIdentity } from './profiles';
import { catalogEntriesById } from './catalog';
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
  async createPlan(
    guildId: string,
    userId: string,
    id: string,
    input: TripSettings,
    cover: string | null,
  ) {
    const values = tripSettingsSchema.parse(input);
    const { data, error } = await this.db
      .from('trips')
      .insert({ ...values, id, guild_id: guildId, created_by: userId, cover_image_url: cover })
      .select('*')
      .single();
    if (error) throw new Error('Impossible de créer le voyage.', { cause: error });
    return data;
  }
  async cards(
    guildId: string,
    filters: {
      search?: string;
      status?: Trip['status'] | 'upcoming';
      page?: number;
      limit?: number;
    } = {},
  ) {
    let query = this.db
      .from('trips')
      .select(
        '*,destination:countries(id,name,slug,is_published,cover_image_url),days:trip_days(count),items:trip_items(count)',
        { count: 'exact' },
      )
      .eq('guild_id', guildId);
    if (filters.search) query = query.ilike('title', destinationNamePattern(filters.search));
    if (filters.status === 'upcoming') query = query.in('status', ['draft', 'planned']);
    else if (filters.status) query = query.eq('status', filters.status);
    const limit = filters.limit ?? 18;
    const from = ((filters.page ?? 1) - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + limit - 1);
    if (error?.code === 'PGRST103' && from > 0) return { rows: [], count: count ?? 0 };
    if (error) throw new Error('Les voyages sont momentanément indisponibles.', { cause: error });
    return { rows: data, count: count ?? 0 };
  }
  async plan(guildId: string, tripId: string, catalog: NagiDatabase) {
    const result = await this.db
      .from('trips')
      .select(
        '*,destination:countries(id,name,is_published,cover_image_url,iso_code),days:trip_days(*),items:trip_items(*),organizers:trip_organizers(user_id)',
      )
      .eq('guild_id', guildId)
      .eq('id', tripId)
      .maybeSingle();
    if (result.error)
      throw new Error('Impossible de charger l’itinéraire.', { cause: result.error });
    if (!result.data) return null;
    const { items, days, ...trip } = result.data;
    const [entries, people] = await Promise.all([
      catalogEntriesById(catalog, [...new Set(items.map((item) => item.entry_id))]),
      this.db.rpc('trip_contributor_cards', { p_trip: tripId }),
    ]);
    if (people.error) throw new Error('Impossible de charger les collaborateurs.');
    return {
      ...trip,
      people: people.data as ProfileIdentity[],
      days: sortTripDays(days),
      items: items
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((item) => ({ ...item, entry: entries.get(item.entry_id) ?? null })),
    };
  }
  async editableTrips(guildId: string, userId: string, isGuildAdmin = false) {
    const result = await this.db
      .from('trips')
      .select(
        'id,title,status,collaboration_mode,days:trip_days(*),organizers:trip_organizers(user_id)',
      )
      .eq('guild_id', guildId)
      .order('title')
      .order('id');
    if (result.error)
      throw new Error('Impossible de charger les voyages de cet espace.', { cause: result.error });
    return result.data
      .filter(
        (trip) =>
          trip.collaboration_mode === 'all_members' ||
          trip.organizers.some((o) => o.user_id === userId) ||
          (isGuildAdmin && trip.organizers.length === 0),
      )
      .map((trip) => ({
        id: trip.id,
        title: trip.title,
        status: trip.status,
        days: sortTripDays(trip.days),
      }));
  }
  async organizerCards(tripId: string) {
    const { data, error } = await this.db.rpc('trip_organizer_cards', { p_trip: tripId });
    if (error) throw new Error('Impossible de charger les organisateurs.', { cause: error });
    return data as {
      id: string;
      discord_id: string;
      username: string;
      name: string;
      avatar: string | null;
    }[];
  }
  async edit(
    guildId: string,
    tripId: string,
    version: number,
    change:
      | TripEdit
      | { operation: 'settings'; data: TripSettings & { cover_image_url?: string | null } }
      | { operation: 'delete_trip'; data: Record<string, never> },
  ) {
    const result = await this.db.rpc('edit_trip_plan', {
      p_guild: guildId,
      p_trip: tripId,
      p_version: version,
      p_operation: change.operation,
      p_data: change.data as Json,
    });
    if (result.error) throw new Error('Impossible de modifier le voyage.', { cause: result.error });
    return result.data;
  }
  async author(tripId: string) {
    const { data, error } = await this.db.rpc('trip_author_card', { p_trip_id: tripId });
    if (error) throw new Error('Impossible de charger l’auteur du voyage.');
    return data as ProfileIdentity | null;
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
export type TripCard = Awaited<ReturnType<TripService['cards']>>['rows'][number];
export type TripPlan = NonNullable<Awaited<ReturnType<TripService['plan']>>>;
export type TripPlanItem = TripPlan['items'][number];
export type TripPlannerDay = TripPlan['days'][number];
export type EditableTrip = Awaited<ReturnType<TripService['editableTrips']>>[number];
