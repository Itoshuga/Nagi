import { getPublicGeography } from "@/lib/geography/public";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/landing/hero";
import { Discover } from "@/components/landing/discover";
import { Universes } from "@/components/landing/universes";
import { Spirit } from "@/components/landing/spirit";

export default async function Home() {
  const geography = await getPublicGeography();
  const country = geography.countries.find((item) => item.id === "country-jp") ?? geography.countries[0];
  const cities = geography.cities.filter((city) => city.countryId === country?.id);
  const featured = ["city-jp-kyoto", "city-jp-tokyo", "city-jp-fujiyoshida"].flatMap((id) => { const city = cities.find((city) => city.id === id); return city ? [city] : []; });
  return (
    <div id="accueil">
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <Hero destinations={featured.length ? featured : cities.slice(0, 3)} countryName={country?.name ?? ""} />
        <Discover />
        <Universes />
        <Spirit />
      </main>
      <SiteFooter />
    </div>
  );
}
