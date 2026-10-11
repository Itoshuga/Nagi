import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/landing/hero";
import { Discover } from "@/components/landing/discover";
import { Universes } from "@/components/landing/universes";
import { Spirit } from "@/components/landing/spirit";

export default function Home() {
  return (
    <div id="accueil">
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <Hero />
        <Discover />
        <Universes />
        <Spirit />
      </main>
      <SiteFooter />
    </div>
  );
}
