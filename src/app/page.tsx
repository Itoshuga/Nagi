import { getFeaturedGeography } from "@/lib/geography/public";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/landing/hero";
import { Discover } from "@/components/landing/discover";
import { Universes } from "@/components/landing/universes";
import { Spirit } from "@/components/landing/spirit";

export default async function Home() {
  const geography = await getFeaturedGeography();
  const country = geography.countries[0];
  const destinations = geography.cities.length ? geography.cities : country ? [{ ...country, caption: country.description }] : [];
  return (
    <div id="accueil">
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <Hero key={destinations.map((item) => item.id).join(":")} destinations={destinations} countryName={country?.name ?? ""} />
        <Discover />
        <Universes />
        <Spirit />
      </main>
      <SiteFooter />
    </div>
  );
}
