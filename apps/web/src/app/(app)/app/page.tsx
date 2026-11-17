import { redirect } from 'next/navigation';
import { DiscordConnectionError } from '@nagi/discord';
import { discoverSpaces } from '@/features/spaces/server';
export default async function AppHome() {
  let spaces: Awaited<ReturnType<typeof discoverSpaces>>;
  try {
    spaces = await discoverSpaces();
  } catch (error) {
    if (error instanceof DiscordConnectionError && error.reason === 'reconnect')
      redirect('/login?error=discord&next=/app');
    redirect('/select-server');
  }
  const favorite = spaces.preferences?.default_guild_id;
  redirect(
    favorite && spaces.guilds.some((guild) => guild.id === favorite)
      ? `/app/${favorite}`
      : '/select-server',
  );
}
