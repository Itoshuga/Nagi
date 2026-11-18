import { profileCustomizationInput } from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Database } from './database.types';

export type SocialCustomization = Omit<
  Database['public']['Tables']['profile_customizations']['Row'],
  'user_id'
>;
export type SocialProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  customization: SocialCustomization;
  common_guilds: { id: string; name: string; icon_url: string | null }[];
  dream: {
    country_id: string;
    country: string;
    country_slug: string;
    iso_code: string | null;
    city_id: string | null;
    city: string | null;
    city_slug: string | null;
    cover: string | null;
  } | null;
  organized_count: number;
};
export type ProfileTrip = {
  id: string;
  guild_id: string;
  title: string;
  cover_image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  status: Database['public']['Enums']['trip_status'];
  destination: string | null;
};
export type ProfileIdentity = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export class ProfileWriteError extends Error {}

export class SocialProfileStore {
  constructor(
    private readonly db: NagiDatabase,
    private readonly applicationId: string,
  ) {}
  async resolve(handle: string) {
    const { data, error } = await this.db.rpc('resolve_social_profile', { p_handle: handle });
    if (error) throw new Error('Impossible de rechercher ce profil.', { cause: error });
    return data as { id: string; username: string; discord_synced_at: string | null } | null;
  }
  async read(viewer: string, target: string) {
    const { data, error } = await this.db.rpc('read_social_profile', {
      p_viewer: viewer,
      p_target: target,
      p_app: this.applicationId,
    });
    if (error) throw new Error('Impossible de charger ce profil.', { cause: error });
    return data as SocialProfile | null;
  }
  async trips(viewer: string, target: string, offset: number) {
    const { data, error } = await this.db.rpc('social_profile_trips', {
      p_viewer: viewer,
      p_target: target,
      p_app: this.applicationId,
      p_offset: offset,
    });
    if (error) throw new Error('Impossible de charger les voyages.', { cause: error });
    return data as ProfileTrip[];
  }
  async save(user: string, revision: number, input: unknown, banner: string | null) {
    const values = profileCustomizationInput.parse(input);
    if (
      banner &&
      (!banner.startsWith(`${user}/`) || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(banner))
    )
      throw new ProfileWriteError('Bannière invalide.');
    const { data, error } = await this.db.rpc('save_social_customization', {
      p_user: user,
      p_revision: revision,
      p_data: { ...values, banner_path: banner },
    });
    if (error) {
      if (error.message.includes('profile_conflict'))
        throw new ProfileWriteError(
          'Votre profil a changé depuis son ouverture. Rechargez-le avant de réessayer.',
        );
      if (error.message.includes('profile_destination'))
        throw new ProfileWriteError('Choisissez une destination publiée et une ville de ce pays.');
      throw new ProfileWriteError(
        'Impossible d’enregistrer votre profil. Vos saisies sont conservées.',
        {
          cause: error,
        },
      );
    }
    return data;
  }
}
