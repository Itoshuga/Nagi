'use client';
import type { ComponentProps } from 'react';
import {
  Coffee,
  Hotel,
  Landmark,
  MapPin,
  Plane,
  ShoppingBag,
  TrainFront,
  Trees,
  Utensils,
} from 'lucide-react';
import { EntryImage } from '@/features/media/image';
/** Native category placeholder; no extra request or invented provider photograph. */
export function PlaceImage({
  source,
  category,
  ...props
}: ComponentProps<typeof EntryImage> & { source?: string; category?: string }) {
  const value = category?.toLowerCase() ?? '';
  const Icon = /restaurant|food|dining/.test(value)
    ? Utensils
    : /cafe|café|coffee/.test(value)
      ? Coffee
      : /hotel|hôtel|lodging/.test(value)
        ? Hotel
        : /museum|musée|temple|monument/.test(value)
          ? Landmark
          : /park|parc|garden/.test(value)
            ? Trees
            : /shop|mall|shopping|magasin/.test(value)
              ? ShoppingBag
              : /station|rail|gare/.test(value)
                ? TrainFront
                : /airport|aéroport/.test(value)
                  ? Plane
                  : MapPin;
  return (
    <EntryImage
      {...props}
      fallback={
        source === 'mapbox' ? (
          <Icon aria-hidden="true" className="size-1/3 max-w-14 text-primary-ink opacity-45" />
        ) : undefined
      }
    />
  );
}
