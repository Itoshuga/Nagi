import Link from 'next/link';
import { Logo } from '@/components/shared/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { requireViewer } from '@/features/auth/session';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <div className="min-h-svh">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
          <div className="flex items-center gap-10">
            <Logo href="/app" />
            <nav
              aria-label="Navigation principale"
              className="hidden items-center gap-6 text-sm sm:flex"
            >
              <Link
                href="/app#destinations"
                className="text-muted-foreground hover:text-primary-ink"
              >
                Destinations
              </Link>
              <Link href="/app/profile" className="text-muted-foreground hover:text-primary-ink">
                Mon profil
              </Link>
            </nav>
          </div>
          <UserMenu viewer={viewer} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        {children}
      </main>
    </div>
  );
}
