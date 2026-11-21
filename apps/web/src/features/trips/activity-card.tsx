import type { TripPlanItem } from '@nagi/database';
import { EntryImage } from '@/features/media/image';
import { GooglePlaceView } from '@/features/integrations/google-places/components';
import type { PlaceSourceFields } from '@nagi/database';

export function ActivityCardCopy({
  entry,
  notes,
  children,
  place,
}: Pick<TripPlanItem, 'entry' | 'notes'> & {
  children?: React.ReactNode;
  place?: PlaceSourceFields & { id: string };
}) {
  return (
    <>
      {place?.source !== 'google' && (
        <EntryImage src={entry?.cover_image_url} className="trip-step-photo" sizes="56px" />
      )}
      <span className="trip-step-copy">
        {place?.source === 'google' && place.google_place_id ? (
          <GooglePlaceView
            occurrence={place.id}
            placeId={place.google_place_id}
            appearance="thumbnail"
          />
        ) : (
          <strong>{entry?.title ?? 'Fiche indisponible'}</strong>
        )}
        <small>
          {[entry?.category?.name, entry?.neighborhood?.name ?? entry?.city?.name]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {place?.source === 'custom' && (
          <small>
            Étape personnalisée{place.custom_location ? ` · ${place.custom_location}` : ''}
          </small>
        )}
        {notes && <span className="trip-step-note">{notes}</span>}
        {children}
      </span>
    </>
  );
}
