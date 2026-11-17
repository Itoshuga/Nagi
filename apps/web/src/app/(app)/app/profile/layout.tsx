import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { requireViewer } from '@/features/auth/session';
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-8">
        <Logo href="/app" />
        <UserMenu viewer={viewer} />
      </header>
      <main id="main" className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
        <Link
          href="/app"
          className="mb-9 inline-flex items-center gap-2 text-xs text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Mes espaces
        </Link>
        {children}
      </main>
    </>
  );
}
