import 'server-only';
import { cache } from 'react';
import { after } from 'next/server';
import { SocialProfileStore } from '@nagi/database';
import { SocialProfileAccess } from '@nagi/discord';
import { requireViewer } from '@/features/auth/session';
import { discordServices } from '@/features/spaces/server';
import { serviceDatabase } from '@/lib/supabase/server';
import { discordEnv } from '@/lib/env';

export const profileServices = cache(() => {
  const store = new SocialProfileStore(serviceDatabase(), discordEnv().DISCORD_APPLICATION_ID);
  return { store, access: new SocialProfileAccess(store, discordServices().memberships) };
});
export const authorizedProfile = cache(async (target: string) => {
  const viewer = await requireViewer();
  const profile = await profileServices().access.read(viewer.id, target);
  if (!profile) return null;
  after(() => refreshProfileIdentity(target));
  return profile;
});

async function refreshProfileIdentity(target: string) {
  // Visual identity can refresh after the response. Access is checked before rendering.
  const db = serviceDatabase();
  const { data } = await db
    .from('profiles')
    .select('discord_id,discord_synced_at')
    .eq('id', target)
    .maybeSingle();
  if (
    data &&
    (!data.discord_synced_at || Date.now() - Date.parse(data.discord_synced_at) > 300000)
  ) {
    try {
      const services = discordServices();
      const identity = await services.users.current(await services.tokens.accessToken(target));
      if (identity.id !== data.discord_id) throw new Error('Identité Discord incohérente.');
      await db.rpc('refresh_social_identity', {
        p_user: target,
        p_discord: data.discord_id,
        p_profile: identity,
      });
    } catch {
      /* Existing verified identity remains visible; membership authorization was not bypassed. */
    }
  }
}

export function profileBannerUrl(userId: string, path: string | null) {
  const version = path?.match(/\/([0-9a-f-]{36})\.webp$/)?.[1];
  return version ? `/app/profile-banner/${userId}/${version}` : null;
}
