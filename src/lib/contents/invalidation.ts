import "server-only";
import { revalidatePath } from "next/cache";
import { readGeographyReferences } from "../geography/repository";
import { getAdminFirestore } from "../firebase/admin";
import { readRelatedContents } from "./store";
import type { ManagedContent } from "./schema";

export async function invalidateContent(item: ManagedContent, previous?: ManagedContent | null) {
  const db = getAdminFirestore();
  const entries = [item, previous].filter((value): value is ManagedContent => Boolean(value));
  const [geography, related] = await Promise.all([readGeographyReferences(db, entries.flatMap((entry) => entry.destinations)), readRelatedContents(db, item)]);
  const paths = new Set([`/decouvertes/${item.type}/${item.slug}`, "/admin/contents"]);
  if (previous) paths.add(`/decouvertes/${previous.type}/${previous.slug}`);
  for (const entry of related.contents) paths.add(`/decouvertes/${entry.type}/${entry.slug}`);
  for (const entry of entries) for (const reference of entry.destinations) {
    const district = reference.kind === "district" ? geography.districts.find((value) => value.id === reference.id) : undefined;
    const city = reference.kind === "city" ? geography.cities.find((value) => value.id === reference.id) : district ? geography.cities.find((value) => value.id === district.cityId) : undefined;
    const country = reference.kind === "country" ? geography.countries.find((value) => value.id === reference.id) : city ? geography.countries.find((value) => value.id === city.countryId) : undefined;
    if (!country) continue;
    paths.add(`/destinations/${country.slug}`);
    if (city) paths.add(`/destinations/${country.slug}/${city.slug}`);
    if (district && city) paths.add(`/destinations/${country.slug}/${city.slug}/${district.slug}`);
  }
  for (const path of paths) revalidatePath(path);
}
