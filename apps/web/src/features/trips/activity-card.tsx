'use client';
import type { TripPlanItem, PlaceSourceFields } from '@nagi/database';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { usePlacePresentation } from '@/features/integrations/mapbox/components';
export function ActivityCardCopy({
  entry,
  notes,
  children,
  place,
}: Pick<TripPlanItem, 'entry' | 'notes'> & {
  children?: React.ReactNode;
  place?: PlaceSourceFields & { id: string };
}) {
  const {
    observe,
    title,
    imageUrl,
    record,
    category,
    location,
    place: display,
  } = usePlacePresentation(place, entry);
  return (
    <>
      <PlaceImage
        photoReference={
          place
            ? {
                source: place.source ?? 'nagi',
                id:
                  place.source === 'mapbox'
                    ? place.external_place_id!
                    : place.source === 'custom'
                      ? place.id
                      : place.entry_id!,
                visit: place.id,
                proof: display?.imageProof,
                located: !!display?.coordinates,
              }
            : entry
              ? { source: 'nagi', id: entry.id }
              : undefined
        }
        src={imageUrl}
        source={place?.source}
        category={category}
        className="trip-step-photo"
        sizes="56px"
      />
      <span ref={observe} className="trip-step-copy">
        <strong title={record.error}>{title}</strong>
        <small>{[category, location].filter(Boolean).join(' · ')}</small>
        {place?.source === 'custom' && (
          <small>
            {place.needs_place_relink ? 'Lieu à réassocier' : 'Étape personnalisée'}
            {place.custom_location ? ` · ${place.custom_location}` : ''}
          </small>
        )}
        {notes && <span className="trip-step-note">{notes}</span>}
        {children}
      </span>
    </>
  );
}
