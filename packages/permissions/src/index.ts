import type { Role } from '@nagi/shared';

export interface Actor {
  discordId: string;
  role: Role;
}
export interface CommandAccess {
  ownerOnly: boolean;
  adminOnly: boolean;
}
export function hasGuildAdministration(permissions: string, owner = false): boolean {
  if (owner) return true;
  if (!/^\d{1,30}$/.test(permissions)) return false;
  return (BigInt(permissions) & 40n) !== 0n;
}
export function isAdmin(role: Role): boolean {
  return role === 'admin' || role === 'owner';
}
export function canExecute(actor: Actor, command: CommandAccess): boolean {
  if (command.ownerOnly) return actor.role === 'owner';
  return !command.adminOnly || isAdmin(actor.role);
}
export function assertAdmin(actor: Actor): void {
  if (!isAdmin(actor.role)) throw new Error('Accès administrateur requis.');
}
export function resolveRole(
  discordId: string,
  persisted: Role | null | undefined,
  ownerIds: readonly string[],
): Role {
  if (ownerIds.includes(discordId)) return 'owner';
  // Owner is controlled by the server allowlist, never a stale database value.
  return persisted === 'admin' ? 'admin' : 'user';
}
