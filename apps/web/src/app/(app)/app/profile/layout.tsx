import { AccountHeader } from '@/components/layout/account-header';
import { requireViewer } from '@/features/auth/session';
import { discoverSpaces } from '@/features/spaces/server';
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  let spaces: Awaited<ReturnType<typeof discoverSpaces>> | null = null;
  try {
    spaces = await discoverSpaces();
  } catch {
    // The personal account remains accessible when its optional Discord context is unavailable.
  }
  return (
    <>
      <AccountHeader
        viewer={viewer}
        guilds={spaces?.guilds ?? []}
        defaultGuildId={spaces?.preferences?.default_guild_id ?? null}
        lastActiveGuildId={spaces?.preferences?.last_active_guild_id ?? null}
      />
      <main id="main" className="app-container app-content py-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
