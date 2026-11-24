import { AdminSidebar, MobileAdminNavigation } from '@/components/layout/admin-sidebar';
import { UserMenu } from '@/components/layout/user-menu';
import { requireAdmin } from '@/features/auth/session';
import { ImageResolverProvider } from '@/features/images/components';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  return (
    <ImageResolverProvider key={viewer.id} url="/api/images">
      <div className="min-h-svh lg:pl-60">
        <AdminSidebar />
        <header className="flex h-20 items-center justify-between border-b border-border px-6 sm:px-10">
          <span className="text-xs text-muted-foreground">
            Nagi{' '}
            <span aria-hidden="true" className="px-3 text-border">
              /
            </span>{' '}
            Administration
          </span>
          <UserMenu viewer={viewer} />
        </header>
        <MobileAdminNavigation />
        <main id="main" className="mx-auto max-w-7xl px-6 py-9 sm:px-10 sm:py-12">
          {children}
        </main>
      </div>
    </ImageResolverProvider>
  );
}
