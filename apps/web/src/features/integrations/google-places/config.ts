import 'server-only';

const limit = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1000000) : fallback;
};
export function googlePlacesConfig() {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const browser = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();
  return {
    key,
    configured: !!key && !!browser && key !== browser,
    enabled: process.env.GOOGLE_PLACES_ENABLED === 'true',
    userDaily: limit('GOOGLE_PLACES_USER_DAILY_LIMIT', 150),
    globalDaily: limit('GOOGLE_PLACES_GLOBAL_DAILY_LIMIT', 2000),
    userMinute: limit('GOOGLE_PLACES_USER_MINUTE_LIMIT', 20),
    minCharacters: limit('GOOGLE_PLACES_MIN_CHARACTERS', 3),
  };
}
