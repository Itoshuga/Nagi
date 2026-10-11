import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./destinations.css";
import "../decouvertes/discoveries.css";

export default function DestinationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="destinations-layout" id="accueil">
      <SiteHeader interior />
      <main id="contenu" tabIndex={-1}>{children}</main>
      <SiteFooter interior />
    </div>
  );
}
