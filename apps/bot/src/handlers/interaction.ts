import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { findActor } from '@nagi/database';
import { maintenanceEmbed, nagiEmbed } from '../embeds';
import { commandAccess } from '../middlewares/access';
import { errorDetails, log } from '../utils/logger';
import type { CommandContext, NagiCommand } from '../types/command';

export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  commands: ReadonlyMap<string, NagiCommand>,
  context: Omit<CommandContext, 'actor' | 'commands'>,
  owners: readonly string[],
) {
  const command = commands.get(interaction.commandName);
  const unrestricted = command && !command.adminOnly && !command.ownerOnly;
  const publicReply =
    unrestricted && command.ephemeral === false && command.isEnabled && !command.isMaintenance;
  // Acknowledge before database/network work to respect Discord's three-second deadline.
  const acknowledgementStarted = performance.now();
  await interaction.deferReply(publicReply ? {} : { flags: MessageFlags.Ephemeral });
  const acknowledgementLatencyMs = performance.now() - acknowledgementStarted;
  try {
    if (!command) {
      await interaction.editReply({
        embeds: [
          nagiEmbed(
            'Commande indisponible',
            'Le registre de commandes est en cours de mise à jour.',
          ),
        ],
      });
      return;
    }
    const actor =
      unrestricted && command.requiresProfile === false
        ? { discordId: interaction.user.id, role: 'user' as const }
        : await findActor(context.db, interaction.user.id, owners);
    const decision = commandAccess(command, actor);
    if (decision !== 'allowed') {
      await interaction.editReply({
        embeds: [
          decision === 'maintenance'
            ? maintenanceEmbed()
            : nagiEmbed(
                'Accès indisponible',
                decision === 'forbidden'
                  ? 'Cette commande nécessite des permissions Nagi supplémentaires.'
                  : 'Cette commande est désactivée.',
              ),
        ],
      });
      return;
    }
    await command.execute(interaction, { ...context, commands, actor, acknowledgementLatencyMs });
  } catch (error) {
    log('interaction.failed', { command: interaction.commandName, ...errorDetails(error) });
    await interaction
      .editReply({
        embeds: [
          nagiEmbed(
            'Une erreur est survenue',
            'Nagi ne peut pas traiter cette demande pour le moment. Réessayez dans quelques instants.',
          ),
        ],
      })
      .catch(() => undefined);
  }
}
