'use client';
import type { TripPlanItem } from '@nagi/database';
import { usePlacePresentation } from '@/features/integrations/mapbox/components';
/** Scheduling and calendar layout receive the same native label for every source. */
export function CalendarPlaceTitle({ item }: { item: TripPlanItem }) {
  const { observe, title, record } = usePlacePresentation(item, item.entry);
  return (
    <strong ref={observe} title={record.error}>
      {title}
    </strong>
  );
}
