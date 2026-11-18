import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { checkDatabase, milliseconds } from '../../services/health';
import type { NagiCommand } from '../../types/command';
export default {
  name: 'ping',
  description: 'Aye Sir ! Latences et état de santé de Nagi et de ses services',
  category: 'general',
  isEnabled: true,
  isMaintenance: false,
  ownerOnly: false,
  adminOnly: false,
  ephemeral: false,
  requiresProfile: false,
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Aye Sir ! Latences et état de santé de Nagi et de ses services'),
  async execute(interaction, { client, db, applicationId, scope, acknowledgementLatencyMs }) {
    const database = await checkDatabase(db, applicationId, scope);
    const ready = client.isReady();
    const healthy = ready && database.ok;
    const gatewayLatency = milliseconds(client.ws.ping);
    const apiLatency = milliseconds(acknowledgementLatencyMs);
    const discordStatus = !ready
      ? '> Statut `🟠 Reconnexion`.'
      : gatewayLatency === 'Non mesurée'
        ? '> Statut `🟢 Connecté` · mesure de latence en cours.'
        : `> A répondu \`🟢 Connecté\` en **${gatewayLatency}**.`;
    const databaseStatus = database.ok
      ? `> A répondu \`🟢 Connecté\` en **${milliseconds(database.latencyMs)}**.`
      : `> Statut \`${database.timedOut ? '🔴 Délai dépassé' : '🔴 Indisponible'}\` après **${milliseconds(database.latencyMs)}**.`;
    const embed = new EmbedBuilder()
      .setColor(healthy ? 0x73a6df : 0xa87a36)
      .setTitle('Aye Sir !! Nagi au rapport.')
      .setDescription(
        [
          healthy
            ? 'J’ai inspecté toutes les machines et bonne nouvelle !\nÇa ronronne comme il faut !'
            : 'J’ai inspecté les machines et il y a un petit souci.\nUn voyant clignote, mais je reste sur le coup !',
          `Discord.\n${discordStatus}`,
          `API Discord.\n${apiLatency === 'Non mesurée' ? '> Délai de l’accusé de réception non mesuré.' : `> **${apiLatency}** avant l’accusé de réception.`}`,
          `Supabase.\n${databaseStatus}`,
        ].join('\n\n'),
      );
    const avatar = client.user?.displayAvatarURL({ extension: 'png', size: 128 });
    if (avatar) embed.setThumbnail(avatar);
    const requestedDate = interaction.createdAt.toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const requestedTime = interaction.createdAt.toLocaleTimeString('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    embed.setFooter({
      text: `Demandé par @${interaction.user.username} • ${requestedDate}, ${requestedTime}`,
      iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 64 }),
    });
    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
} satisfies NagiCommand;
