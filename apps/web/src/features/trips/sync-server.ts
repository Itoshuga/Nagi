import 'server-only';
import { DiscordConnectionError } from '@nagi/discord';
import { snowflakeSchema } from '@nagi/shared';
import { discordServices } from '@/features/spaces/server';
import { sessionDatabase } from '@/lib/supabase/server';
import { ensureBackendStartup } from '@/lib/startup';

export class TripRequestError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message);
  }
}
/** No profile/preferences fetch on small mutations. The existing trusted Discord
 * snapshot is bounded to 30s; expired snapshots are verified with Discord again.
 * Every RPC separately enforces membership expiry, bot presence and trip rights. */
export async function tripRequestSession(guild: string) {
  const start = performance.now();
  if (!snowflakeSchema.safeParse(guild).success)
    throw new TripRequestError(404, 'forbidden', 'Espace introuvable.');
  const db = await sessionDatabase(true);
  const { data, error } = await db.auth.getClaims();
  if (!data?.claims.sub) {
    if (
      error &&
      ![400, 401, 403].includes(error.status ?? 0) &&
      error.name !== 'AuthSessionMissingError'
    )
      throw new TripRequestError(503, 'temporary', 'La vérification de session est indisponible.');
    throw new TripRequestError(401, 'forbidden', 'Reconnectez-vous pour retrouver ce voyage.');
  }
  const verified = performance.now();
  await ensureBackendStartup();
  try {
    await discordServices().memberships.authorize(data.claims.sub, guild);
  } catch (error) {
    if (error instanceof DiscordConnectionError) {
      if (error.reason === 'forbidden' || error.reason === 'reconnect')
        throw new TripRequestError(
          403,
          'forbidden',
          'Votre accès à cet espace doit être vérifié à nouveau.',
        );
    }
    throw new TripRequestError(503, 'temporary', 'La vérification Discord est indisponible.');
  }
  return {
    db,
    userId: data.claims.sub,
    timing: `auth;dur=${(verified - start).toFixed(1)}, membership;dur=${(performance.now() - verified).toFixed(1)}`,
  };
}
export function tripRequestFailure(error: unknown) {
  if (error instanceof TripRequestError)
    return {
      status: error.status,
      body: { ok: false, reason: error.reason, error: error.message },
    };
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const message =
    cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
  if (code === '42501')
    return {
      status: 403,
      body: {
        ok: false,
        reason: 'forbidden',
        error: 'Vous ne disposez plus des droits nécessaires sur ce voyage.',
      },
    };
  if (code === '40001')
    return {
      status: 409,
      body: {
        ok: false,
        reason: 'conflict',
        error: 'Cette donnée a été modifiée entre-temps. Les autres modifications sont conservées.',
      },
    };
  const known: Record<string, string> = {
    trip_duplicate: 'Ce lieu est déjà prévu. Confirmez une nouvelle visite.',
    trip_stop_duplicate: 'Ce lieu figure déjà parmi les arrêts.',
    trip_activity_has_stops: 'Cette activité contient déjà des arrêts.',
    trip_day_date: 'Choisissez une date libre dans la période du voyage.',
    trip_day_missing: 'Cette journée n’existe plus.',
    trip_activity_missing: 'Cette activité n’existe plus.',
    trip_entry_hidden: 'Cette fiche n’est plus disponible.',
    trip_stop_self: 'Choisissez un autre lieu que l’activité principale.',
  };
  if (known[message] || ['22023', '23503', '23505', '23514', '22P02'].includes(code))
    return {
      status: 422,
      body: {
        ok: false,
        reason: 'invalid',
        error:
          known[message] ??
          'Cette modification n’est plus valide. Vérifiez les valeurs et les dépendances.',
      },
    };
  return {
    status: 503,
    body: {
      ok: false,
      reason: 'temporary',
      error: 'La sauvegarde est momentanément indisponible. Vos modifications restent en attente.',
    },
  };
}
