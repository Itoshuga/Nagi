'use client';
import type { EntryCardRow } from '@nagi/database';
import type { CatalogPlace } from '@nagi/shared';
import type { ReactNode } from 'react';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { nagiCatalogPlace } from '@/features/integrations/mapbox/model';
/** One native card for editorial entries, external results and user-authored places. */
export function CatalogPlaceCard({
  entry,
  place,
  onClick,
  label,
  children,
}: {
  entry: EntryCardRow;
  place?: CatalogPlace;
  onClick?: () => void;
  label?: string;
  children?: ReactNode;
}) {
  const display = place ?? nagiCatalogPlace(entry);
  return (
    <button
      type="button"
      className="trip-picker-preview"
      data-external-place-card={place?.source === 'mapbox' || undefined}
      onClick={onClick}
      aria-label={label ?? `Aperçu de ${display.title}`}
      onKeyDown={(event) => {
        if (!place || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const cards = [
            ...event.currentTarget
              .closest('ul')!
              .querySelectorAll<HTMLButtonElement>('[data-external-place-card]'),
          ],
          index = cards.indexOf(event.currentTarget);
        cards[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? cards.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length
        ]?.focus();
      }}
    >
      <PlaceImage
        photoReference={
          display.source !== 'custom'
            ? {
                source: display.source,
                id: display.id,
                proof: display.imageProof,
                located: !!display.coordinates,
              }
            : undefined
        }
        src={display.imageUrl}
        source={display.source}
        category={display.categoryId ?? display.category}
        className="size-11 shrink-0 rounded-xl"
        sizes="44px"
      />
      <span>
        <strong>{display.title}</strong>
        <small>{[display.category, display.locationLabel].filter(Boolean).join(' · ')}</small>
        {children}
      </span>
      {place?.source === 'mapbox' && <span className="trip-place-source">Mapbox</span>}
    </button>
  );
}
