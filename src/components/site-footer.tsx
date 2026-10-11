import { ArrowUp } from "lucide-react";
import Link from "next/link";
import { copy, navigation } from "@/data/fr";
import { destinationPhotographs } from "@/data/destination-photographs";
import { discoveryPhotographs } from "@/data/discovery-photographs";

export function SiteFooter({ interior = false }: { interior?: boolean }) {
  return (
    <footer className="site-footer section-shell">
      <div className="footer-main">
        <div><Link className="wordmark footer-wordmark" href={interior ? "/" : "#accueil"} aria-label="Nagi, retour à l’accueil">nagi<span>.</span></Link><p className="footer-description">{copy.footer.description}</p></div>
        <nav aria-label="Navigation de pied de page">{navigation.map((item) => <Link href={interior && item.href.startsWith("#") ? `/${item.href}` : item.href} key={item.href}>{item.label}</Link>)}</nav>
        <a className="back-to-top" href="#accueil" aria-label="Revenir en haut de la page"><ArrowUp size={21} strokeWidth={1.25} aria-hidden="true" /></a>
      </div>
      <div className="footer-bottom"><span>{copy.footer.copyright}</span><span>{copy.footer.note}</span>
        <details className="photo-credits">
          <summary>Crédits photographiques</summary>
          <div className="credits-content">
            <p>Des regards qui rendent ce voyage possible.</p>
            <ul>
              <li><a href="https://unsplash.com/photos/a-japanese-garden-seen-through-a-sliding-door-toftUrCCSQs">Kyoto, à travers la fenêtre — PJH</a></li>
              <li><a href="https://unsplash.com/photos/japanese-garden-with-lush-greenery-s0R5z-vh_74">Kyoto, le jardin — PJH</a></li>
              <li><a href="https://unsplash.com/photos/a-narrow-dark-alley-lit-up-at-night-4qQB7UYqz_A">Tokyo — TINYGLOBE</a></li>
              <li><a href="https://unsplash.com/photos/snow-capped-mountain-looms-over-a-japanese-street-UaYJFXPUtkQ">Fujiyoshida — Sarmat Batagov</a></li>
              <li><a href="https://unsplash.com/photos/tranquil-japanese-garden-with-rocks-and-lush-greenery-6P8aeEMQYzY">Le jardin Choontei — Mateo Krossler</a></li>
              {Object.values(destinationPhotographs).map((photo) => <li key={photo.id}><a href={photo.sourceUrl}>{photo.id.charAt(0).toUpperCase() + photo.id.slice(1)} — {photo.author}</a></li>)}
              {Object.values(discoveryPhotographs).filter((photo) => photo.src.startsWith("/images/discoveries/")).map((photo) => <li key={photo.src}><a href={photo.sourceUrl}>{"creditTitle" in photo ? photo.creditTitle : photo.alt} — {photo.author}</a> · <a href={photo.licenseUrl}>{photo.license}</a></li>)}
            </ul>
            <p>Photographies d’origine sous <a href="https://unsplash.com/license">licence Unsplash</a>. Les autres licences sont précisées ci-dessus. Images redimensionnées et recadrées à l’affichage.</p>
          </div>
        </details>
      </div>
    </footer>
  );
}
