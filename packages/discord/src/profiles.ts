import { SocialProfileStore } from '@nagi/database';
import { DiscordConnectionError } from './api';
import type { GuildMembershipService } from './membership';

/** Both sides are refreshed using the existing short-lived, trusted Discord snapshots. */
export class SocialProfileAccess {
  constructor(
    private readonly store: SocialProfileStore,
    private readonly memberships: Pick<GuildMembershipService, 'discover'>,
  ) {}
  async verify(viewer: string, target: string) {
    if (viewer === target) {
      try {
        await this.memberships.discover(viewer);
      } catch {
        /* Own customization remains accessible during Discord outages. */
      }
    } else {
      try {
        await Promise.all([this.memberships.discover(viewer), this.memberships.discover(target)]);
      } catch (error) {
        if (
          error instanceof DiscordConnectionError &&
          ['reconnect', 'forbidden'].includes(error.reason)
        )
          return false;
        throw error;
      }
    }
    return true;
  }
  async read(viewer: string, target: string) {
    if (!(await this.verify(viewer, target))) return null;
    // The database independently checks both memberships, their expiry and current bot presence.
    return this.store.read(viewer, target);
  }
}
