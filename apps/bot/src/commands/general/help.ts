import { SlashCommandBuilder } from 'discord.js';
import { canExecute } from '@nagi/permissions';
import { nagiEmbed } from '../../embeds';
import type { NagiCommand } from '../../types/command';
export default {
  name: 'help',
  description: 'Découvrir les commandes accessibles',
  category: 'general',
  isEnabled: true,
  isMaintenance: false,
  ownerOnly: false,
  adminOnly: false,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Découvrir les commandes accessibles'),
  async execute(interaction, { commands, actor }) {
    const groups = new Map<string, string[]>();
    for (const command of commands.values()) {
      if (!command.isEnabled || !canExecute(actor, command)) continue;
      const group = groups.get(command.category) ?? [];
      group.push(
        `**/${command.name}** — ${command.description}${command.isMaintenance ? ' · Maintenance' : ''}`,
      );
      groups.set(command.category, group);
    }
    const embed = nagiEmbed(
      'Un petit guide pour explorer',
      'Les commandes disponibles avec vos permissions Nagi.',
    );
    // Discord embeds have hard limits. Split groups rather than risking an invalid response.
    let totalLength = 0;
    for (const [name, lines] of groups) {
      let chunk = '';
      for (const line of lines) {
        if (totalLength + line.length > 4500) break;
        totalLength += line.length;
        if ((chunk + line).length > 1000) {
          if (embed.data.fields && embed.data.fields.length >= 20) break;
          embed.addFields({ name, value: chunk });
          chunk = '';
        }
        chunk += `${line}\n`;
      }
      if (chunk && (embed.data.fields?.length ?? 0) < 20) embed.addFields({ name, value: chunk });
    }
    await interaction.editReply({ embeds: [embed] });
  },
} satisfies NagiCommand;
