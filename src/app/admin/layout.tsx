import type { Metadata } from "next";
import "./admin.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Administration — Nagi", template: "%s — Nagi" },
  description: "L’espace d’administration de Nagi.",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root">{children}</div>;
}
