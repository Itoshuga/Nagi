import type { UniverseSlug } from "../types/discoveries";

export const universeDetails: Record<UniverseSlug, { name: string; lead: string; description: string; empty: string }> = {
  tourisme: { name: "Tourisme", lead: "Prendre le temps de regarder.", description: "Jardins, temples et lieux singuliers : les escales qui donnent un visage à la destination.", empty: "De nouveaux lieux viendront enrichir ce carnet. En attendant, poursuivez la découverte à votre rythme." },
  activites: { name: "Activités", lead: "Entrer dans l’expérience.", description: "Un geste, une matière, une autre façon d’être présent. Des idées pour aller au-delà de la visite.", empty: "Les premières expériences de cette destination sont encore à découvrir. Les autres univers vous attendent." },
  gastronomie: { name: "Gastronomie", lead: "Un territoire à savourer.", description: "Les spécialités, leurs histoires et leurs variations. Un petit répertoire de curiosités gourmandes.", empty: "Les spécialités de cette destination rejoindront bientôt ces pages. Le carnet continue dans les autres univers." },
  adresses: { name: "Adresses", lead: "Trouver une porte à pousser.", description: "Des établissements identifiés, reliés aux spécialités qu’ils proposent. De quoi prolonger la découverte à table.", empty: "Aucune adresse n’est encore renseignée ici. Retrouvez les spécialités et les lieux déjà présents dans le carnet." },
};
