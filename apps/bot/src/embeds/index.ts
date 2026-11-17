import { EmbedBuilder } from 'discord.js';
export function nagiEmbed(title: string, description?: string) {
  const embed = new EmbedBuilder()
    .setColor(0x73a6df)
    .setTitle(title)
    .setFooter({ text: 'Nagi · À votre rythme' })
    .setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}
export function maintenanceEmbed() {
  return nagiEmbed(
    'Commande temporairement indisponible',
    'Cette fonctionnalité est actuellement en maintenance. Merci de réessayer ultérieurement.',
  ).setColor(0xa87a36);
}
