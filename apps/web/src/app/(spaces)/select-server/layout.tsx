import { Logo } from '@/components/shared/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { requireViewer } from '@/features/auth/session';
import '../../spaces.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vos espaces Discord' };
export default async function SelectorLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <div className="nagi-space selector-shell">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <Logo />
        <UserMenu viewer={viewer} />
      </header>
      {children}
      <footer className="px-6 py-6 text-center text-[11px] text-muted-foreground">
        Vos serveurs Discord. Votre espace, ensemble.
      </footer>
    </div>
  );
}
