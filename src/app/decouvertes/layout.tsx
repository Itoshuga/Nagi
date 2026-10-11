import { SiteHeader } from "@/components/site-header";
import "../destinations/destinations.css";
import "./discoveries.css";

export default function DiscoveriesLayout({ children }: { children: React.ReactNode }) {
  return <div className="destinations-layout discovery-layout" id="accueil"><SiteHeader interior /><main id="contenu" tabIndex={-1}>{children}</main></div>;
}
