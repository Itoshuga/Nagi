import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@nagi/ui';
import { getViewer } from '@/features/auth/session';
import { Logo } from '@/components/shared/logo';
import { FadeIn } from '@/components/shared/fade-in';
import { DiscordButton } from '@/components/shared/discord-button';
import './landing.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: { absolute: 'Nagi — Votre univers, à votre façon' },
  description: 'Un espace pour vos découvertes, vos idées et tout ce qui vous ressemble.',
};

export default async function Home() {
  const viewer = await getViewer();
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Logo />
        <p className="landing-header-note">Discord Bot &amp; Web App</p>
      </header>
      <main id="main" className="landing-main">
        <FadeIn className="landing-copy">
          <p className="landing-eyebrow">
            <span aria-hidden="true" />
            Faites comme chez vous.
          </p>
          <h1 className="landing-title">
            Votre univers.
            <span>À votre façon.</span>
          </h1>
          <p className="landing-description">
            Un espace pour vos découvertes, vos idées et tout ce qui vous ressemble.
          </p>
          <div className="landing-actions">
            {viewer ? (
              <Button size="lg" className="landing-cta" asChild>
                <Link href="/app">
                  Accéder à Nagi
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <DiscordButton className="landing-cta" />
            )}
            <p className="landing-sign-in-note">Votre compte Discord, et c’est tout.</p>
          </div>
        </FadeIn>
        <FadeIn className="landing-visual">
          <div className="landing-character" aria-hidden="true">
            <Image
              src="/nagi-logo.png"
              alt=""
              width={500}
              height={500}
              sizes="(max-width: 767px) 290px, (max-width: 1100px) 360px, 480px"
              className="landing-character-image"
              priority
            />
          </div>
        </FadeIn>
      </main>
      <footer className="landing-bottom">
        <span>Nagi.</span>
        <span className="landing-legal-label">
          Mentions Légales &amp; Politique de Confidentialité
        </span>
      </footer>
    </div>
  );
}
