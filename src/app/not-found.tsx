import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NotFoundMessage } from "@/components/destinations/not-found-message";
import "./destinations/destinations.css";

export default function NotFound() {
  return <div className="destinations-layout" id="accueil"><SiteHeader interior /><main id="contenu" tabIndex={-1}><NotFoundMessage /></main><SiteFooter interior /></div>;
}
