import { CircleAlert, CircleCheck, LoaderCircle, type LucideIcon } from "lucide-react";

export function AdminNotice({ children, kind = "error", id }: { children: React.ReactNode; kind?: "error" | "success" | "info"; id?: string }) {
  const Icon = kind === "success" ? CircleCheck : CircleAlert;
  return <div id={id} className={`admin-notice admin-notice-${kind}`} role={kind === "error" ? "alert" : "status"}><Icon size={18} aria-hidden="true" /><div>{children}</div></div>;
}

export function AdminSpinner({ label = "Chargement…" }: { label?: string }) {
  return <span className="admin-spinner" role="status"><LoaderCircle size={18} aria-hidden="true" />{label}</span>;
}

export function AdminPageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <div className="admin-page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{children}</p></div>;
}

export function AdminEmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return <div className="admin-empty"><span className="admin-icon-tile"><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></span><h3>{title}</h3><p>{children}</p><span className="admin-badge">À venir</span></div>;
}
