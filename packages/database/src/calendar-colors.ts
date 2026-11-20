import { savedCalendarColorSchema } from '@nagi/shared';
import type { NagiDatabase } from './client';

export class CalendarColorService {
  constructor(private readonly db: NagiDatabase) {}

  async list() {
    const { data, error } = await this.db
      .from('user_calendar_colors')
      .select('id,hex_color,sort_order')
      .order('sort_order')
      .order('id')
      .limit(32);
    if (error) throw new Error('Impossible de charger vos couleurs.', { cause: error });
    return savedCalendarColorSchema.array().parse(data);
  }
  async add(hex: string) {
    const { data, error } = await this.db.rpc('save_user_calendar_color', { p_hex: hex });
    if (error) throw new Error('Impossible d’enregistrer cette couleur.', { cause: error });
    return savedCalendarColorSchema.parse(data);
  }
  async remove(id: string) {
    const { error } = await this.db.from('user_calendar_colors').delete().eq('id', id);
    if (error) throw new Error('Impossible de retirer cette couleur.', { cause: error });
  }
}
