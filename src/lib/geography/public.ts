import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getAdminFirestore } from "../firebase/admin";
import { publicRead } from "../public-data/errors";
import { listPublishedPlaces, readGeographyReferences, routeDocuments } from "./repository";
import { publicGeographyFromDocuments } from "./presentation";
import type { GeographicReference } from "../../types/discoveries";

export const getRouteGeography = cache(async (country: string, city?: string, district?: string) => {
  await connection();
  return publicRead("geography.route", async () => publicGeographyFromDocuments(await routeDocuments(getAdminFirestore(), country, city, district)));
});
export const getPlaceChildren = cache(async (kind: "countries" | "cities" | "districts", parentId?: string, cursor?: string, size?: number) => {
  await connection();
  return publicRead("geography.list", async () => {
    const db = getAdminFirestore(); const page = await listPublishedPlaces(db, kind, parentId, cursor, size);
    // Les documents de la liste sont déjà connus : seules leurs ascendances sont lues.
    const parents: GeographicReference[] = page.documents.flatMap<GeographicReference>((item) => item.kind === "countries" ? [] : item.kind === "cities" ? [{ kind: "country" as const, id: item.countryId }] : [{ kind: "city" as const, id: item.cityId }]);
    const ancestorData = await readGeographyReferences(db, parents);
    for (const item of page.documents) {
      if (item.kind === "countries") ancestorData.countries.push(item);
      else if (item.kind === "cities") ancestorData.cities.push(item);
      else ancestorData.districts.push(item);
    }
    return { geography: publicGeographyFromDocuments(ancestorData), nextCursor: page.nextCursor, invalidCursor: page.invalidCursor };
  });
});
export const getFeaturedGeography = cache(async () => {
  const countries = await getPlaceChildren("countries", undefined, undefined, 1);
  const country = countries.geography.countries[0];
  if (!country) return countries.geography;
  const cities = (await getPlaceChildren("cities", country.id, undefined, 3)).geography;
  return { ...cities, countries: countries.geography.countries };
});
