'use client';
import type { TripPlanItem } from '@nagi/database';
import { usePlacePresentation } from '@/features/integrations/mapbox/components';
/** Scheduling and calendar layout receive the same native label for every source. */
export function CalendarPlaceTitle({ item, load = true }: { item: TripPlanItem; load?: boolean }) {
  const { observe, title, record } = usePlacePresentation(item, item.entry);
  return (
    <strong ref={load ? observe : undefined} title={record.error}>
      {title}
    </strong>
  );
}
