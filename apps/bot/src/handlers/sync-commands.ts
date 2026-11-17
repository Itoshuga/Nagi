import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { CommandRegistry } from './load-commands';

export interface DiscordRegistryApi {
  get(scope: string, signal: AbortSignal): Promise<unknown>;
  replace(
    scope: string,
    commands: RESTPostAPIChatInputApplicationCommandsJSONBody[],
    signal: AbortSignal,
  ): Promise<unknown>;
}
export function createDiscordRegistryApi(applicationId: string, token: string): DiscordRegistryApi {
  const rest = new REST({ version: '10', timeout: 15000, retries: 3 }).setToken(token);
  function route(scope: string) {
    if (scope === 'global') return Routes.applicationCommands(applicationId);
    if (!/^guild:\d{17,20}$/.test(scope)) throw new Error('Scope Discord invalide.');
    return Routes.applicationGuildCommands(applicationId, scope.slice(6));
  }
  return {
    get: (scope, signal) => rest.get(route(scope), { signal }),
    replace: (scope, body, signal) => rest.put(route(scope), { body, signal }),
  };
}
const fields = [
  'type',
  'name',
  'description',
  'name_localizations',
  'description_localizations',
  'options',
  'default_member_permissions',
  'nsfw',
  'contexts',
  'integration_types',
] as const;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function normalized(command: Record<string, unknown>, scope: string) {
  const result: Record<string, unknown> = {
    type: 1,
    options: [],
    default_member_permissions: null,
    nsfw: false,
  };
  for (const key of fields) {
    const value = command[key];
    if (value !== undefined && value !== null) result[key] = value;
  }
  // Discord can return defaults omitted by the builder.
  if (scope.startsWith('guild:')) {
    delete result.contexts;
    delete result.integration_types;
  } else {
    result.contexts ??= [0, 1, 2];
    result.integration_types ??= [0];
  }
  return result;
}
function fingerprint(commands: unknown[], scope: string) {
  return stable(
    commands
      .map((command) => normalized(command as Record<string, unknown>, scope))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  );
}
export async function synchronizeCommands(
  api: DiscordRegistryApi,
  scope: string,
  registry: CommandRegistry,
  signal: AbortSignal,
) {
  if (scope !== 'global' && !/^guild:\d{17,20}$/.test(scope))
    throw new Error('Scope Discord invalide.');
  const desired = [...registry.enabled.values()].map((command) => command.data.toJSON());
  const remote = await api.get(scope, signal);
  if (!Array.isArray(remote)) throw new Error('Registre Discord distant invalide.');
  // This application owns its complete command registry in the selected scope.
  // PUT is atomic, removes obsolete/disabled commands and avoids duplicate registrations.
  const changed = fingerprint(remote, scope) !== fingerprint(desired, scope);
  signal.throwIfAborted();
  if (changed) await api.replace(scope, desired, signal);
  return { changed, count: desired.length };
}
