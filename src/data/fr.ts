import type { Universe } from "@/types/content";
import { cities, countries } from "@/data/geography";

// Les contenus sont regroupés par langue ; aucune bibliothèque i18n n'est
// nécessaire tant que la page n'existe qu'en français.
export const navigation = [
  { href: "/destinations", label: "Explorer les destinations" },
  { href: "#univers", label: "Les univers" },
  { href: "#esprit", label: "L’esprit Nagi" },
] as const;

// Sélection éditoriale de la landing, dérivée du même catalogue que les pages.
export const destinations = ["kyoto", "tokyo", "fujiyoshida"].flatMap((slug) => {
  const city = cities.find((entry) => entry.countryId === "country-jp" && entry.slug === slug);
  if (!city) return [];
  const country = countries.find((entry) => entry.id === city.countryId);
  return [{ ...city, region: `${city.region}, ${country?.name ?? ""}` }];
});
export const universes: readonly Universe[] = [
  {
    name: "Tourisme",
    slug: "tourisme",
    subtitle: "Regarder autrement",
    description: "Des lieux emblématiques aux jardins discrets, prendre le temps de regarder ce qui nous entoure.",
    icon: "landmark",
  },
  {
    name: "Activités",
    slug: "activites",
    subtitle: "Faire l’expérience",
    description: "Rencontrer un savoir-faire, s’essayer à un geste, laisser une culture se raconter autrement.",
    icon: "hand",
  },
  {
    name: "Gastronomie",
    slug: "gastronomie",
    subtitle: "Goûter un territoire",
    description: "Une recette transmise, un ingrédient de saison. Découvrir les histoires qui se partagent à table.",
    icon: "bowl",
  },
  {
    name: "Adresses",
    slug: "adresses",
    subtitle: "Trouver son escale",
    description: "Un café de quartier, une table accueillante, un salon de thé où l’on voudrait rester un peu.",
    icon: "coffee",
  },
];

export const copy = {
  metadata: {
    title: "Nagi — Le monde se découvre dans les détails",
    description: "Un regard curieux et sensible sur le monde. Explorez le Japon à travers ses lieux, ses savoir-faire, sa gastronomie et ses adresses, avec Nagi.",
  },
  hero: {
    eyebrow: "Un premier horizon · Japon",
    title: "Le Japon,",
    titleAccent: "à pas feutrés.",
    introduction: "Il est des voyages qui commencent par un regard. Le nôtre se pose sur le Japon, entre présence et silence.",
    cta: "Explorer les destinations",
  },
  discover: {
    eyebrow: "01 / Les destinations",
    title: "Un pays, mille nuances.",
    introduction: "Trois escales japonaises, trois sensibilités. Et autant de façons de se laisser surprendre.",
  },
  universes: {
    eyebrow: "02 / Les univers de Nagi",
    title: "Suivre sa curiosité.",
    introduction: "Un lieu se découvre aussi dans ce que l’on y fait, ce que l’on y goûte et celles et ceux que l’on y croise.",
  },
  spirit: {
    eyebrow: "03 / L’esprit Nagi",
    title: "Le monde se découvre",
    titleAccent: "dans les détails.",
    paragraphs: [
      "Une rue que l’on n’avait pas prévue. Un bol de thé encore chaud. La lumière qui traverse un jardin. Ce sont parfois les plus petites choses qui nous font sentir ailleurs.",
      "Nagi est né de cette envie : regarder de plus près. Un guide culturel pour les voyageurs curieux, qui relie les lieux aux gestes, les saveurs aux histoires. Le Japon ouvre ce carnet. D’autres horizons suivront.",
    ],
    closing: "Moins de listes à cocher. Plus de choses à ressentir.",
  },
  footer: {
    description: "Un regard sensible sur le monde.",
    copyright: "© 2026 Nagi",
    note: "Le voyage commence par la curiosité.",
  },
} as const;

