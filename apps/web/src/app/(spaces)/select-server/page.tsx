import { ArrowUpRight, RefreshCw, UsersRound } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { DiscordConnectionError } from '@nagi/discord';
import { discoverSpaces, botInstallUrl } from '@/features/spaces/server';
import { ServerSelector } from '@/features/spaces/server-selector';
import { refreshSpaces } from '@/features/spaces/actions';
import { DiscordButton } from '@/components/shared/discord-button';
export default async function SelectServer({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  let spaces: Awaited<ReturnType<typeof discoverSpaces>> | undefined;
  let reconnect = false;
  let failed = false;
  try {
    spaces = await discoverSpaces();
  } catch (error) {
    reconnect = error instanceof DiscordConnectionError && error.reason === 'reconnect';
    failed = true;
  }
  const invite = botInstallUrl();
  return (
    <main id="main" className="selector-main">
      <div className="text-center">
        <p className="space-eyebrow mb-5">Un serveur. Toutes vos idées.</p>
        <h1 className="space-title">
          Choisissez votre espace<span className="text-primary">.</span>
        </h1>
        <p className="mt-5 text-sm leading-7 text-muted-foreground sm:text-base">
          Retrouvez vos amis et préparez vos prochaines aventures.
        </p>
      </div>
      {params.notice === 'access' && (
        <Alert className="mt-8 max-w-lg">
          Cet espace n’est plus accessible. Choisissez un serveur auquel vous appartenez et sur
          lequel Nagi est installé.
        </Alert>
      )}
      {params.notice === 'retry' && (
        <Alert className="mt-8 max-w-lg">
          L’actualisation a échoué. Réessayez dans quelques instants.
        </Alert>
      )}
      {failed ? (
        <div className="space-panel mt-12 w-full max-w-lg p-9 text-center">
          <h2 className="text-lg font-extrabold">
            {reconnect ? 'Retrouvons vos serveurs.' : 'Une petite pause côté Discord.'}
          </h2>
          <p className="my-5 text-sm leading-7 text-muted-foreground">
            {reconnect
              ? 'Autorisez Nagi à consulter vos serveurs Discord pour ouvrir vos espaces.'
              : 'Vos espaces sont momentanément indisponibles. Vous pouvez réessayer dans quelques instants.'}
          </p>
          {reconnect ? (
            <DiscordButton next="/select-server" />
          ) : (
            <form action={refreshSpaces}>
              <Button>
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </form>
          )}
        </div>
      ) : spaces?.guilds.length ? (
        <ServerSelector
          guilds={spaces.guilds}
          favorite={spaces.preferences?.default_guild_id ?? null}
        />
      ) : (
        <div className="space-panel mt-12 w-full max-w-lg p-9 text-center">
          <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-accent">
            <UsersRound className="size-7 text-primary-ink" strokeWidth={1.5} />
          </span>
          <h2 className="text-xl font-extrabold">Aucun espace disponible.</h2>
          <p className="mb-7 mt-3 text-sm leading-7 text-muted-foreground">
            Nagi n’est actuellement présent sur aucun de vos serveurs Discord.
          </p>
          <Button asChild>
            <a href={invite} target="_blank" rel="noopener noreferrer">
              Ajouter Nagi à un serveur
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      )}
      {!failed && (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <form action={refreshSpaces}>
            <Button variant="ghost" size="sm">
              <RefreshCw className="size-3.5" />
              Actualiser les espaces
            </Button>
          </form>
          {Boolean(spaces?.guilds.length) && (
            <Button asChild variant="ghost" size="sm">
              <a href={invite} target="_blank" rel="noopener noreferrer">
                Ajouter Nagi
                <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
