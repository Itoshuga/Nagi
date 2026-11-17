'use server';
import { revalidatePath } from 'next/cache';
import { requestSync } from '@nagi/database';
import { commandScope } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
export async function enqueueSync(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const env = serverEnv();
  try {
    await requestSync(
      await sessionDatabase(),
      env.DISCORD_APPLICATION_ID,
      commandScope(env),
      'admin',
    );
    revalidatePath('/admin/bot');
    return {
      ok: true,
      message: 'Demande enregistrée. Le bot la traitera dès qu’il sera disponible.',
    };
  } catch {
    return { ok: false, message: 'La demande n’a pas pu être enregistrée. Réessayez.' };
  }
}
