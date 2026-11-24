import 'server-only';
import { httpsUrl } from './metadata';

export function imageRequestConcurrency() {
  const value = Number(process.env.NAGI_IMAGE_MAX_CONCURRENT_REQUESTS ?? 2);
  return Number.isInteger(value) && value > 0 && value <= 20 ? value : 2;
}
export function imageResolverEnabled() {
  return process.env.NAGI_IMAGE_RESOLVER_ENABLED !== 'false';
}
/** A server flag cannot enable this path in a production build. */
export function imageDevelopmentPreview() {
  return (
    process.env.NODE_ENV === 'development' && process.env.NAGI_IMAGE_PREVIEW_UNVERIFIED === 'true'
  );
}
const setting = (name: string, fallback: number, maximum: number) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 && value <= maximum ? value : fallback;
};
export function serperImagesConfig() {
  return {
    enabled:
      imageResolverEnabled() &&
      process.env.SERPER_IMAGES_ENABLED === 'true' &&
      !!process.env.SERPER_API_KEY?.trim(),
    key: process.env.SERPER_API_KEY?.trim(),
    pageSize: 10,
    // Legacy environment values cannot restore paid multi-page indexing.
    maxPages: 1,
    maxTotalPages: 1,
    concurrency: setting('SERPER_IMAGES_MAX_CONCURRENT_REQUESTS', 1, 20),
    globalDaily: setting('SERPER_IMAGES_GLOBAL_DAILY_LIMIT', 50, 1000000),
    userDaily: setting('SERPER_IMAGES_USER_DAILY_LIMIT', 20, 10000),
    userMinute: setting('SERPER_IMAGES_USER_MINUTE_LIMIT', 6, 1000),
  };
}
export function mapboxPhotoPolicy() {
  const origins = (process.env.MAPBOX_PLACES_PHOTO_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => httpsUrl(value.trim()))
    .filter((value): value is string => !!value)
    .map((value) => new URL(value).origin);
  const rightsReference = process.env.MAPBOX_PLACES_PHOTO_RIGHTS_REFERENCE?.trim();
  const seconds = Number(process.env.MAPBOX_PLACES_PHOTO_SESSION_SECONDS ?? 600);
  return {
    enabled:
      imageResolverEnabled() &&
      process.env.MAPBOX_PLACES_PHOTOS_ENABLED === 'true' &&
      !!rightsReference &&
      origins.length > 0,
    origins,
    rightsReference,
    visibleResults: process.env.MAPBOX_PLACES_PHOTOS_VISIBLE_RESULTS === 'true',
    cropAllowed: process.env.MAPBOX_PLACES_PHOTO_CROPPING_ALLOWED === 'true',
    sessionSeconds: Number.isInteger(seconds) && seconds > 0 && seconds <= 600 ? seconds : 600,
  };
}

/** Optional adapter contract. No Foursquare request is made without an implementation. */
export function foursquarePhotoStatus() {
  if (!process.env.FOURSQUARE_PLACES_API_KEY) return 'foursquare:not-configured';
  if (process.env.FOURSQUARE_PHOTOS_ENABLED !== 'true') return 'foursquare:disabled';
  return 'foursquare:adapter-not-installed';
}
