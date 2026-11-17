import { canExecute, type Actor } from '@nagi/permissions';
import type { NagiCommand } from '../types/command';
export type AccessDecision = 'allowed' | 'disabled' | 'forbidden' | 'maintenance';
export function commandAccess(command: NagiCommand, actor: Actor): AccessDecision {
  if (!command.isEnabled) return 'disabled';
  if (!canExecute(actor, command)) return 'forbidden';
  if (command.isMaintenance) return 'maintenance';
  return 'allowed';
}
