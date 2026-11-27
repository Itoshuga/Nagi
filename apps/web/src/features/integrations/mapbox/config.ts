import 'server-only';
const limit = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1000000) : fallback;
};
export function mapboxConfig() {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  const browser = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  return {
    token,
    mapConfigured: !!browser && browser.startsWith('pk.'),
    configured: !!token && !!browser && browser.startsWith('pk.'),
    enabled: process.env.MAPBOX_ENABLED === 'true',
    userDaily: limit('MAPBOX_USER_DAILY_LIMIT', 500),
    globalDaily: limit('MAPBOX_GLOBAL_DAILY_LIMIT', 5000),
    userMinute: limit('MAPBOX_USER_MINUTE_LIMIT', 60),
    detailsMonthly: limit('MAPBOX_DETAILS_MONTHLY_LIMIT', 900),
    minCharacters: limit('MAPBOX_MIN_CHARACTERS', 3),
    photos: process.env.MAPBOX_PHOTOS_ENABLED === 'true',
    directionsUserDaily: limit('MAPBOX_DIRECTIONS_USER_DAILY_LIMIT', 120),
    directionsGlobalDaily: limit('MAPBOX_DIRECTIONS_GLOBAL_DAILY_LIMIT', 1000),
    directionsUserMinute: limit('MAPBOX_DIRECTIONS_USER_MINUTE_LIMIT', 12),
  };
}
