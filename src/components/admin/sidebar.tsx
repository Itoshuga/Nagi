"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { ArrowUpRight, Coffee, CookingPot, Earth, Images, Landmark, LayoutDashboard, MapPin, Menu, Settings, Sparkles, X } from "lucide-react";

const items = [
  { label: "Vue d’ensemble", icon: LayoutDashboard, href: "/admin" },
  { label: "Pays", icon: Earth, href: "/admin/countries" },
  { label: "Villes & Quartiers", icon: MapPin, href: "/admin/cities" },
  { label: "Tourisme", icon: Landmark },
  { label: "Activités", icon: Sparkles },
  { label: "Gastronomie", icon: CookingPot },
  { label: "Adresses", icon: Coffee },
  { label: "Médiathèque", icon: Images },
  { label: "Paramètres", icon: Settings, href: "/admin/settings" },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <nav aria-label="Administration"><p className="admin-nav-label">Votre espace</p><ul className="admin-nav">{items.map(({ label, icon: Icon, href }) => <li key={label}>{href ? <Link href={href} aria-current={(pathname === href || href !== "/admin" && pathname.startsWith(`${href}/`)) ? "page" : undefined} onClick={close}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></Link> : <span className="admin-nav-unavailable" aria-disabled="true"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span><small>Bientôt</small></span>}</li>)}</ul></nav>;
}

function Brand() {
  return <Link href="/admin" className="admin-brand" aria-label="Nagi — administration">nagi<span className="admin-brand-dot">.</span><span className="admin-brand-caption">Le carnet, côté coulisses</span></Link>;
}

export function AdminSidebar() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <aside className="admin-sidebar"><Brand /><Navigation /><div className="admin-sidebar-bottom"><p>Un regard attentif.<br />Un voyage qui se construit.</p><Link href="/">Voir le site <ArrowUpRight size={16} aria-hidden="true" /></Link></div></aside>
    <div className="admin-mobile-bar"><Brand /><button className="admin-button admin-button-quiet" type="button" onClick={() => dialog.current?.showModal()} aria-label="Ouvrir la navigation" aria-haspopup="dialog"><Menu size={22} /></button></div>
    <dialog ref={dialog} className="admin-mobile-dialog" aria-labelledby="admin-menu-title"><div className="admin-mobile-dialog-heading"><p id="admin-menu-title">Navigation</p><button className="admin-button admin-button-quiet" type="button" aria-label="Fermer la navigation" onClick={() => dialog.current?.close()}><X size={22} /></button></div><Navigation close={() => dialog.current?.close()} /><Link className="admin-back-link" href="/">Voir le site <ArrowUpRight size={16} aria-hidden="true" /></Link></dialog>
  </>;
}
