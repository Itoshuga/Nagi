'use client';
import type { EntryCardRow } from '@nagi/database';
import type { ReactNode } from 'react';
import { EntryImage } from '@/features/media/image';
import { GooglePlaceView } from '@/features/integrations/google-places/components';

/** Shared card envelope; provider-owned content is rendered by its official adapter. */
export function CatalogPlaceCard({
  entry,
  placeId,
  onClick,
  label,
  children,
}: {
  entry: EntryCardRow;
  placeId?: string;
  onClick?: () => void;
  label?: string;
  children?: ReactNode;
}) {
  if (placeId)
    return (
      <div
        className="trip-picker-preview trip-catalog-google-card"
        data-native-google-card
        tabIndex={0}
        role="button"
        aria-label={label ?? 'Lieu proposé par Google Maps'}
        onClick={onClick}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const cards = [
                ...e.currentTarget
                  .closest('ul')!
                  .querySelectorAll<HTMLElement>('[data-native-google-card]'),
              ],
              index = cards.indexOf(e.currentTarget);
            cards[
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? cards.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length
            ]?.focus();
            return;
          }
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        <GooglePlaceView occurrence={`result:${placeId}`} placeId={placeId} appearance="card" />
      </div>
    );
  return (
    <button
      type="button"
      className="trip-picker-preview"
      onClick={onClick}
      aria-label={label ?? `Aperçu de ${entry.title}`}
    >
      <EntryImage
        src={entry.cover_image_url}
        className="size-11 shrink-0 rounded-xl"
        sizes="44px"
      />
      <span>
        <strong>{entry.title}</strong>
        <small>
          {[entry.category?.name, entry.neighborhood?.name ?? entry.city?.name, entry.country?.name]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {children}
      </span>
    </button>
  );
}
