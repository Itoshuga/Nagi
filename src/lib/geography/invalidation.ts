import "server-only";
import { revalidatePath } from "next/cache";
import { cityPath, countryPath, districtPath } from "../destinations";
import type { ManagedDestination, ManagedGeography } from "./schema";

export function invalidateDestination(item: ManagedDestination, data: ManagedGeography, previous?: ManagedDestination | null) {
  const paths = new Set(["/destinations", "/"]);
  for (const value of [item, previous].filter((value): value is ManagedDestination => Boolean(value))) {
    const country = value.kind === "countries" ? value : value.kind === "cities" ? data.countries.find((entry) => entry.id === value.countryId) : data.countries.find((entry) => entry.id === data.cities.find((city) => city.id === value.cityId)?.countryId);
    if (!country) continue;
    paths.add(countryPath(country));
    const cities = value.kind === "countries" ? data.cities.filter((city) => city.countryId === value.id) : value.kind === "cities" ? [value] : data.cities.filter((city) => city.id === value.cityId);
    for (const city of cities) {
      paths.add(cityPath(country, city));
      for (const district of data.districts.filter((district) => district.cityId === city.id && (value.kind !== "districts" || district.id === value.id))) {
        paths.add(districtPath(country, city, district));
      }
    }
    if (value.kind === "districts") {
      const city = cities[0]; if (city) paths.add(districtPath(country, city, value));
    }
  }
  for (const path of paths) revalidatePath(path);
}
