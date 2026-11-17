'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  Bot,
  Building2,
  Command,
  FileText,
  Globe2,
  Layers,
  LayoutGrid,
  Link2,
  MapPin,
  Settings2,
  Users,
} from 'lucide-react';
import { cn } from '@nagi/ui';
import { Logo } from '@/components/shared/logo';
import { adminNavigation } from '@/features/admin/navigation';
const icons = {
  overview: LayoutGrid,
  countries: Globe2,
  cities: Building2,
  neighborhoods: MapPin,
  categories: Layers,
  entries: FileText,
  relations: Link2,
  bot: Bot,
  commands: Command,
  users: Users,
  settings: Settings2,
};
export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="space-y-7">
      {adminNavigation.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[.15em] text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const Icon = icons[item.icon as keyof typeof icons];
              const exact = pathname === item.href;
              const active =
                exact || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={exact ? 'page' : active ? 'location' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors',
                      active
                        ? 'bg-accent font-medium text-primary-ink'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.6} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
export function AdminSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card px-5 py-7 lg:flex">
      <div className="mb-10 px-3">
        <Logo href="/admin" />
        <p className="mt-2 text-[10px] tracking-wide text-muted-foreground">
          ESPACE ADMINISTRATION
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <AdminNavigation />
      </div>
      <Link
        href="/app"
        className="mt-6 flex items-center justify-between border-t border-border px-3 pt-5 text-xs text-muted-foreground hover:text-primary-ink"
      >
        Retour à Nagi
        <ArrowUpRight className="size-3.5" />
      </Link>
    </aside>
  );
}
export function MobileAdminNavigation() {
  return (
    <details className="border-b border-border bg-card px-6 py-3 lg:hidden">
      <summary className="text-sm text-muted-foreground">Navigation de l’administration</summary>
      <div className="py-6">
        <AdminNavigation />
      </div>
    </details>
  );
}
