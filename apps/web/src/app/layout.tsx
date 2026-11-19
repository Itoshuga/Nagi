import type { Metadata, Viewport } from 'next';
import { Toaster } from '@nagi/ui';
import { SpaceNavigation } from '@/features/spaces/space-navigation';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Nagi — À votre rythme', template: '%s · Nagi' },
  description:
    'Découvrez, organisez et partagez les destinations, les expériences et les adresses qui méritent le détour.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#73A6DF' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-primary px-5 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Aller au contenu
        </a>
        <SpaceNavigation>{children}</SpaceNavigation>
        <Toaster />
      </body>
    </html>
  );
}
