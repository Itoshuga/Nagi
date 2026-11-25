import {
  BedDouble,
  Beer,
  BusFront,
  Coffee,
  FerrisWheel,
  Landmark,
  MapPin,
  Mountain,
  Palette,
  Plane,
  ShoppingBag,
  TrainFront,
  Trees,
  Utensils,
  Waves,
} from 'lucide-react';

// Fixed imports keep the placeholder independent of the searchable icon library.
const categories = [
  { kind: 'cafe', label: 'Café', match: /cafe|coffee|\btea\b|salon de the/, Icon: Coffee },
  { kind: 'bar', label: 'Bar', match: /\bbar\b|\bpub\b|brewery|brasserie|nightclub/, Icon: Beer },
  {
    kind: 'restaurant',
    label: 'Restaurant',
    match: /restaurant|food|dining|gastronom|utensil|bakery|boulanger|patisser/,
    Icon: Utensils,
  },
  {
    kind: 'hotel',
    label: 'Hôtel',
    match: /hotel|lodging|hebergement|hostel|auberge/,
    Icon: BedDouble,
  },
  { kind: 'museum', label: 'Musée', match: /museum|musee/, Icon: Landmark },
  { kind: 'gallery', label: 'Galerie', match: /gallery|galerie/, Icon: Palette },
  {
    kind: 'entertainment',
    label: 'Loisirs',
    match: /amusement|theme park|parc d.attractions|entertainment|loisir/,
    Icon: FerrisWheel,
  },
  {
    kind: 'park',
    label: 'Parc',
    match: /\bpark\b|\bparc\b|garden|jardin|nature|forest/,
    Icon: Trees,
  },
  {
    kind: 'beach',
    label: 'Bord de l’eau',
    match: /beach|plage|coast|waterfront|\blac\b|\blake\b/,
    Icon: Waves,
  },
  {
    kind: 'mountain',
    label: 'Montagne',
    match: /mountain|montagne|hiking|randonnee/,
    Icon: Mountain,
  },
  {
    kind: 'shop',
    label: 'Boutique',
    match:
      /shop|store|retail|mall|magasin|boutique|superette|commercial|produit|grocery|supermarket|supermarche/,
    Icon: ShoppingBag,
  },
  { kind: 'airport', label: 'Aéroport', match: /airport|aeroport|plane/, Icon: Plane },
  { kind: 'bus', label: 'Arrêt de bus', match: /\bbus\b|coach|autocar/, Icon: BusFront },
  {
    kind: 'station',
    label: 'Gare',
    match: /station|rail|gare|train|subway|metro/,
    Icon: TrainFront,
  },
  {
    kind: 'landmark',
    label: 'Site à visiter',
    match:
      /temple|shrine|sanctuaire|religious|religieu|church|eglise|monument|landmark|historic|historique|castle|palace|chateau|attraction|touris/,
    Icon: Landmark,
  },
];
const genericPlace = { kind: 'place', label: 'Lieu', Icon: MapPin };

/** A category pictogram when a venue has no usable photograph. */
export function PlacePlaceholder({ category }: { category?: string }) {
  const value =
    category?.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[_-]+/g, ' ').toLowerCase() ?? '';
  const { kind, label, Icon } = categories.find(({ match }) => match.test(value)) ?? genericPlace;
  return (
    <span
      role="img"
      aria-label={`Pictogramme : ${label}`}
      data-place-placeholder={kind}
      className="absolute inset-0 grid place-items-center bg-accent text-primary-ink/65"
    >
      <Icon aria-hidden="true" strokeWidth={1.6} className="h-auto w-[42%] max-w-16" />
    </span>
  );
}
