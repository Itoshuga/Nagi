import { requireAdmin } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <div className="admin-shell"><AdminSidebar /><div className="admin-workspace"><AdminHeader email={user.email} /><main id="contenu" className="admin-main" tabIndex={-1}>{children}</main><footer className="admin-footer"><span>Nagi · Administration</span><span>À chaque détail, une attention.</span></footer></div></div>;
}
