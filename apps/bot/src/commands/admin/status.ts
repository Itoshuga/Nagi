import { SlashCommandBuilder } from 'discord.js';
import { getBotRuntime } from '@nagi/database';
import { nagiEmbed } from '../../embeds';
import type { NagiCommand } from '../../types/command';
export default {
  name: 'status',
  description: 'Consulter le statut des services Nagi',
  category: 'admin',
  isEnabled: true,
  isMaintenance: false,
  ownerOnly: false,
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Consulter le statut des services Nagi'),
  async execute(interaction, { client, db, commands, applicationId, scope }) {
    let database = 'Indisponible';
    let lastSync = 'Aucune synchronisation';
    try {
      const runtime = await getBotRuntime(db, applicationId, scope);
      database = 'Connecté';
      if (runtime?.last_sync_at)
        lastSync = `<t:${Math.floor(Date.parse(runtime.last_sync_at) / 1000)}:R>`;
    } catch {
      /* Report genuine connection failure without technical details. */
    }
    await interaction.editReply({
      embeds: [
        nagiEmbed('État de Nagi').addFields(
          { name: 'Discord', value: client.isReady() ? 'Connecté' : 'Reconnexion', inline: true },
          {
            name: 'Uptime',
            value: `${Math.floor((client.uptime ?? 0) / 60000)} min`,
            inline: true,
          },
          { name: 'Supabase', value: database, inline: true },
          { name: 'Commandes chargées', value: String(commands.size), inline: true },
          { name: 'Dernière synchronisation', value: lastSync },
        ),
      ],
    });
  },
} satisfies NagiCommand;
