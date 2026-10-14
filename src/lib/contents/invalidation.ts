import "server-only";
import { revalidatePath } from "next/cache";
import { readManagedGeography } from "../geography/store";
import { getAdminFirestore } from "../firebase/admin";
import { readRelatedContents } from "./store";
import type { ManagedContent } from "./schema";

export async function invalidateContent(item: ManagedContent, previous?: ManagedContent | null) {
  const db = getAdminFirestore();
  const geography = await readManagedGeography(db);
  const paths = new Set([`/decouvertes/${item.type}/${item.slug}`, "/admin/contents"]);
  if (previous) paths.add(`/decouvertes/${previous.type}/${previous.slug}`);
  const related = await readRelatedContents(db, item);
  for (const entry of related.contents) paths.add(`/decouvertes/${entry.type}/${entry.slug}`);
  for (const entry of [item, previous].filter((value): value is ManagedContent => Boolean(value))) for (const reference of entry.destinations) {
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
