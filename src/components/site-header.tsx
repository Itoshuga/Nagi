"use client";

import { Menu, X, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { navigation } from "@/data/fr";
import { formatIndex } from "@/lib/format";

export function SiteHeader({ interior = false }: { interior?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  function openMenu() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

  return (
    <header className={`site-header${interior ? " site-header-interior section-shell" : ""}`}>
      <Link className="wordmark" href={interior ? "/" : "#accueil"} aria-label="Nagi, accueil">nagi<span>.</span></Link>
      <div className="header-actions">
      <Link href="/destinations" className="header-destinations">Destinations</Link>
      <button className="menu-toggle" onClick={openMenu} aria-label="Ouvrir le menu" aria-controls="site-menu" aria-expanded={isOpen}>
        <span>Menu</span>
        <Menu size={21} strokeWidth={1.25} aria-hidden="true" />
      </button>
      </div>
      <dialog
        id="site-menu"
        className="menu-dialog"
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = event.currentTarget.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("button, a[href]");
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
          }
        }}
        aria-labelledby="menu-title"
      >
        <div className="menu-topline">
          <span className="eyebrow" id="menu-title">À travers Nagi</span>
          <button className="icon-button" onClick={closeMenu} aria-label="Fermer le menu" autoFocus>
            <X size={22} strokeWidth={1.25} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Navigation principale">
          <Link href="/" onClick={closeMenu}><span className="menu-number">00</span><span>Accueil</span><ArrowUpRight size={19} strokeWidth={1.5} aria-hidden="true" /></Link>
          {navigation.map((item, index) => (
            <Link href={interior && item.href.startsWith("#") ? `/${item.href}` : item.href} onClick={closeMenu} key={item.href}>
              <span className="menu-number">{formatIndex(index)}</span>
              <span>{item.label}</span>
              <ArrowUpRight size={19} strokeWidth={1.25} aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <p className="menu-signoff">Le voyage commence par la curiosité.</p>
      </dialog>
    </header>
  );
}
