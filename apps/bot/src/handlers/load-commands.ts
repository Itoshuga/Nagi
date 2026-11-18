import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { NagiCommand } from '../types/command';

export class CommandLoadError extends Error {
  override name = 'CommandLoadError';
}

export function validateCommand(value: unknown, source: string): asserts value is NagiCommand {
  if (typeof value !== 'object' || value === null)
    throw new CommandLoadError(`Module invalide : ${source}`);
  const command = value as Record<string, unknown>;
  for (const key of ['name', 'description', 'category']) {
    if (typeof command[key] !== 'string' || !command[key].trim())
      throw new CommandLoadError(`${source}: ${key} obligatoire.`);
  }
  for (const key of ['isEnabled', 'isMaintenance', 'ownerOnly', 'adminOnly']) {
    if (typeof command[key] !== 'boolean')
      throw new CommandLoadError(`${source}: ${key} doit être un booléen.`);
  }
  for (const key of ['ephemeral', 'requiresProfile']) {
    if (command[key] !== undefined && typeof command[key] !== 'boolean')
      throw new CommandLoadError(`${source}: ${key} doit être un booléen.`);
  }
  if (command.requiresProfile === false && (command.ownerOnly || command.adminOnly))
    throw new CommandLoadError(`${source}: une commande protégée doit vérifier le profil Nagi.`);
  if (
    typeof command.execute !== 'function' ||
    !command.data ||
    typeof (command.data as NagiCommand['data']).toJSON !== 'function'
  ) {
    throw new CommandLoadError(`${source}: execute ou SlashCommandBuilder manquant.`);
  }
  // Builder validation must also succeed for disabled commands: never hide a broken module.
  let json;
  try {
    json = (command.data as NagiCommand['data']).toJSON();
  } catch (cause) {
    throw new CommandLoadError(`${source}: définition Slash invalide.`, { cause });
  }
  if (
    json.name !== command.name ||
    json.description !== command.description ||
    !/^[a-z0-9_-]{1,32}$/.test(json.name)
  ) {
    throw new CommandLoadError(`${source}: métadonnées et définition Slash incohérentes.`);
  }
}
async function scan(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new CommandLoadError(`Lien symbolique interdit dans commands : ${path}`);
    if (entry.isDirectory()) paths.push(...(await scan(path)));
    else if (/\.(ts|js|mjs)$/.test(entry.name) && !/\.(d|test|spec)\.ts$/.test(entry.name))
      paths.push(path);
  }
  return paths;
}
export interface CommandRegistry {
  all: ReadonlyMap<string, NagiCommand>;
  enabled: ReadonlyMap<string, NagiCommand>;
}
export async function loadCommands(directory: string): Promise<CommandRegistry> {
  const files = await scan(directory); // Any IO/import/validation failure aborts the entire deployment.
  // A successful empty scan is authoritative: deleting the last command removes it remotely.
  // Missing directories and broken modules throw before any Discord request is issued.
  const all = new Map<string, NagiCommand>();
  for (const file of files) {
    const { mtimeMs } = await stat(file);
    // tsx watch reloads source modules. Compiled JS uses a versioned URL for live resyncs.
    const url = `${pathToFileURL(file).href}${file.endsWith('.ts') ? '' : `?mtime=${mtimeMs}`}`;
    let module: { default?: unknown };
    try {
      module = await import(url);
    } catch (cause) {
      throw new CommandLoadError(`Impossible d’importer ${file}.`, { cause });
    }
    validateCommand(module.default, file);
    if (all.has(module.default.name))
      throw new CommandLoadError(`Commande dupliquée : ${module.default.name}`);
    all.set(module.default.name, module.default);
  }
  return { all, enabled: new Map([...all].filter(([, command]) => command.isEnabled)) };
}
