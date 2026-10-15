"use client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { UnavailableMessage } from "@/components/destinations/unavailable-message";
import "./destinations/destinations.css";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <div className="destinations-layout" id="accueil"><SiteHeader interior /><main id="contenu" tabIndex={-1}><UnavailableMessage /><div className="section-shell"><button className="button button-secondary" onClick={retry}>Réessayer</button></div></main><SiteFooter interior /></div>;
}
