import {
  BedDouble,
  Bike,
  BookOpen,
  Camera,
  Coffee,
  Compass,
  Flower2,
  Footprints,
  Heart,
  Landmark,
  MapPin,
  Mountain,
  Music2,
  Palette,
  ShoppingBag,
  ShoppingBasket,
  Sun,
  Tent,
  Theater,
  Ticket,
  Train,
  Trees,
  Utensils,
  Waves,
} from 'lucide-react';
import type { CatalogIconName } from '@nagi/shared';

const icons = {
  compass: Compass,
  landmark: Landmark,
  footprints: Footprints,
  utensils: Utensils,
  'shopping-basket': ShoppingBasket,
  'map-pin': MapPin,
  mountain: Mountain,
  camera: Camera,
  coffee: Coffee,
  trees: Trees,
  tent: Tent,
  bike: Bike,
  waves: Waves,
  train: Train,
  palette: Palette,
  music: Music2,
  shopping: ShoppingBag,
  ticket: Ticket,
  bed: BedDouble,
  book: BookOpen,
  flower: Flower2,
  theater: Theater,
  heart: Heart,
  sun: Sun,
} satisfies Record<CatalogIconName, typeof Compass>;

export function CategoryIcon({ name, color }: { name: string; color: string }) {
  const Icon = Object.hasOwn(icons, name) ? icons[name as CatalogIconName] : Compass;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground ring-1 ring-inset ring-border">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-xl opacity-25"
        style={{ backgroundColor: color }}
      />
      <Icon className="relative size-[18px]" aria-hidden="true" />
    </span>
  );
}
