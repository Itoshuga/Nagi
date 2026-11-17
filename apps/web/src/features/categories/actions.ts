'use server';
import { revalidatePath } from 'next/cache';
import { createCategory } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
export interface CategoryState {
  ok: boolean;
  message: string;
}
export async function addCategory(_state: CategoryState, form: FormData): Promise<CategoryState> {
  const viewer = await requireAdmin();
  try {
    await createCategory(
      await sessionDatabase(),
      { discordId: viewer.discord_id, role: viewer.role },
      {
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
        position: Number(form.get('position') ?? 0),
      },
    );
    revalidatePath('/admin/categories');
    return { ok: true, message: 'La catégorie a été ajoutée.' };
  } catch {
    return {
      ok: false,
      message: 'Création impossible. Vérifiez les champs et choisissez un slug unique.',
    };
  }
}
