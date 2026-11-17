import type {
  ChatInputCommandInteraction,
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Actor } from '@nagi/permissions';
import type { NagiDatabase } from '@nagi/database';

export interface CommandContext {
  client: Client;
  db: NagiDatabase;
  actor: Actor;
  commands: ReadonlyMap<string, NagiCommand>;
  applicationId: string;
  scope: string;
}
export interface NagiCommand {
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
  isMaintenance: boolean;
  ownerOnly: boolean;
  adminOnly: boolean;
  data: { toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;
}
