import { SlashCommandBuilder } from 'discord.js';
import { nagiEmbed } from '../../embeds';
import type { NagiCommand } from '../../types/command';
export default {
  name: 'ping',
  description: 'Vérifier le fonctionnement du bot',
  category: 'general',
  isEnabled: true,
  isMaintenance: false,
  ownerOnly: false,
  adminOnly: false,
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Vérifier le fonctionnement du bot'),
  async execute(interaction, { client }) {
    const latency = client.ws.ping;
    await interaction.editReply({
      embeds: [
        nagiEmbed('Nagi est opérationnel', 'Prêt à explorer, à votre rythme.').addFields({
          name: 'Latence Discord',
          value: latency < 0 ? 'Mesure en cours' : `${Math.round(latency)} ms`,
        }),
      ],
    });
  },
} satisfies NagiCommand;
