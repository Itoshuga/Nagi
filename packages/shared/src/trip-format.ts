import { tripDateLabel } from './trip-planner';

export function formatTripDuration(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isInteger(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} h${remainder ? ` ${String(remainder).padStart(2, '0')}` : ''}`;
}

export const formatTripTime = (value: string | null | undefined) => value?.slice(0, 5) ?? null;
export const tripStepCount = (count: number) =>
  count === 0 ? 'Aucune étape' : `${count} étape${count > 1 ? 's' : ''}`;
export const tripStopCount = (count: number) => `${count} arrêt${count > 1 ? 's' : ''}`;

export function tripStopsSummary(count: number, minutes: number | null) {
  const duration = minutes ? formatTripDuration(minutes) : null;
  return [
    tripStopCount(count),
    duration ? `${duration} ${minutes === 1 || minutes === 60 ? 'incluse' : 'incluses'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function tripDayLabel(date: string) {
  const label = tripDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toLocaleUpperCase('fr-FR') + label.slice(1);
}
