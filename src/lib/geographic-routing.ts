import { getCountryBySlug, getCityBySlug, getDistrictBySlug } from "./destinations";
import { universeSlugs } from "../types/discoveries";

export function isKnownGeographicRoute(pathname: string): boolean {
  let segments: string[];
  try { segments = pathname.split("/").filter(Boolean).map(decodeURIComponent); }
  catch { return false; }
  if (segments[0] !== "destinations") return false;
  const country = getCountryBySlug(segments[1]);
  const city = country && getCityBySlug(country.id, segments[2]);
  if (!city) return false;
  const tail = segments.slice(3);
  const validUniverse = (value: string) => (universeSlugs as readonly string[]).includes(value);
  if (tail.length === 0) return true;
  if (tail[0] === "explorer") return tail.length === 2 && validUniverse(tail[1]);
  if (!getDistrictBySlug(city.id, tail[0])) return false;
  return tail.length === 1 || (tail.length === 3 && tail[1] === "explorer" && validUniverse(tail[2]));
}
