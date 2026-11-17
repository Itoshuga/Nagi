import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Alert, Card } from '@nagi/ui';
import { safeNext } from '@nagi/shared';
import { Logo } from '@/components/shared/logo';
import { DiscordButton } from '@/components/shared/discord-button';
import { getViewer } from '@/features/auth/session';
export const metadata: Metadata = { title: 'Connexion' };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if ((await getViewer()) && params.error !== 'discord') redirect(safeNext(params.next));
  return (
    <main id="main" className="hero flex flex-col items-center justify-center px-6 py-16">
      <Logo />
      <Card className="mt-10 w-full max-w-md px-8 py-10 text-center">
        <p className="text-xs uppercase tracking-[.2em] text-primary-ink">Bienvenue chez vous</p>
        <h1 className="mt-5 font-display text-4xl tracking-tight">Le voyage commence ici.</h1>
        <p className="mb-8 mt-4 text-sm leading-7 text-muted-foreground">
          Connectez votre compte Discord pour retrouver votre espace Nagi.
        </p>
        {params.error && (
          <Alert className="mb-6 text-left">
            {params.error === 'discord'
              ? 'Reconnectez Discord pour autoriser l’accès à vos serveurs et retrouver vos espaces.'
              : 'La connexion n’a pas abouti. Vérifiez votre autorisation Discord et réessayez.'}
          </Alert>
        )}
        <div className="flex justify-center">
          <DiscordButton next={safeNext(params.next)} />
        </div>
        <p className="mt-6 text-xs leading-6 text-muted-foreground">
          Une connexion sécurisée via Discord.
          <br />
          Aucun mot de passe à retenir.
        </p>
      </Card>
      <Link
        href="/"
        className="mt-8 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Retour à l’accueil
      </Link>
    </main>
  );
}
