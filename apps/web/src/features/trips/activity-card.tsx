import type { TripPlanItem } from '@nagi/database';
import { EntryImage } from '@/features/media/image';

export function ActivityCardCopy({
  entry,
  notes,
  children,
}: Pick<TripPlanItem, 'entry' | 'notes'> & { children?: React.ReactNode }) {
  return (
    <>
      <EntryImage src={entry?.cover_image_url} className="trip-step-photo" sizes="56px" />
      <span className="trip-step-copy">
        <strong>{entry?.title ?? 'Fiche indisponible'}</strong>
        <small>
          {[entry?.category?.name, entry?.neighborhood?.name ?? entry?.city?.name]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {notes && <span className="trip-step-note">{notes}</span>}
        {children}
      </span>
    </>
  );
}
