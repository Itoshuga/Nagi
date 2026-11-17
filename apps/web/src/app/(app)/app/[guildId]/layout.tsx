import { requireGuild } from '@/features/spaces/server';
import { ServerHeader } from '@/features/spaces/server-header';
export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild, guilds, viewer, preferences } = await requireGuild(guildId);
  return (
    <div key={guildId}>
      <ServerHeader
        guild={guild}
        guilds={guilds}
        viewer={viewer}
        favorite={preferences?.default_guild_id ?? null}
      />
      <main id="main" className="app-container app-content py-10 sm:py-14">
        {children}
      </main>
    </div>
  );
}
