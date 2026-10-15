import "server-only";
import { FieldPath, type Firestore, type Query } from "firebase-admin/firestore";
import type { GeographicReference } from "../../types/discoveries";
import { parseDestination } from "./store";
import { idSchema, type DestinationKind, type ManagedDestination, type ManagedGeography } from "./schema";
import { publicGeographyFromDocuments } from "./presentation";

export const GEOGRAPHY_PAGE_SIZE = 24;
const empty = (): ManagedGeography => ({ countries: [], cities: [], districts: [] });
function add(data: ManagedGeography, item: ManagedDestination) {
  if (item.kind === "countries") data.countries.push(item);
  else if (item.kind === "cities") data.cities.push(item);
  else data.districts.push(item);
}
export function publishedQuery(db: Firestore, kind: DestinationKind): Query {
  return db.collection(kind).where("status", "==", "published").where("visibility", "==", "public").where("archivedAt", "==", null);
}
export async function publishedBySlug(db: Firestore, kind: DestinationKind, slug: string, parentId?: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  let query = publishedQuery(db, kind).where("slug", "==", slug);
  if (kind !== "countries") query = query.where(kind === "cities" ? "countryId" : "cityId", "==", parentId);
  const snapshot = await query.limit(2).get();
  if (snapshot.size > 1) throw new Error("Duplicate geographic slug");
  return snapshot.empty ? null : parseDestination(kind, snapshot.docs[0].id, snapshot.docs[0].data());
}
export async function routeDocuments(db: Firestore, countrySlug: string, citySlug?: string, districtSlug?: string) {
  const data = empty();
  const country = await publishedBySlug(db, "countries", countrySlug);
  if (!country) return data;
  add(data, country);
  if (!citySlug) return data;
  const city = await publishedBySlug(db, "cities", citySlug, country.id);
  if (!city) return data;
  add(data, city);
  if (districtSlug) { const district = await publishedBySlug(db, "districts", districtSlug, city.id); if (district) add(data, district); }
  return data;
}
// Trois lectures groupées au maximum par lot d’ascendance, y compris pour les
// associations gastronomiques multiples. Aucun chargement des autres pays/villes.
export async function readGeographyReferences(db: Firestore, references: readonly GeographicReference[]): Promise<ManagedGeography> {
  const data = empty();
  const ids = { countries: new Set<string>(), cities: new Set<string>(), districts: new Set<string>() };
  for (const ref of references) if (idSchema.safeParse(ref.id).success) ids[ref.kind === "country" ? "countries" : ref.kind === "city" ? "cities" : "districts"].add(ref.id);
  for (const kind of ["districts", "cities", "countries"] as const) {
    const keys = [...ids[kind]];
    for (let offset = 0; offset < keys.length; offset += 100) {
      const documents = await db.getAll(...keys.slice(offset, offset + 100).map((id) => db.collection(kind).doc(id)));
      for (const snapshot of documents) {
        if (!snapshot.exists) continue;
        const item = parseDestination(kind, snapshot.id, snapshot.data()); add(data, item);
        if (item.kind === "districts") ids.cities.add(item.cityId);
        if (item.kind === "cities") ids.countries.add(item.countryId);
      }
    }
  }
  return data;
}
export async function geographyForReferences(db: Firestore, refs: readonly GeographicReference[]) {
  return publicGeographyFromDocuments(await readGeographyReferences(db, refs));
}
export async function listPublishedPlaces(db: Firestore, kind: DestinationKind, parentId?: string, cursor?: string, size = GEOGRAPHY_PAGE_SIZE) {
  let query = publishedQuery(db, kind);
  if (kind !== "countries") query = query.where(kind === "cities" ? "countryId" : "cityId", "==", parentId);
  // Respecter l’ordre administré, puis départager par nom et identifiant.
  query = query.orderBy("sortOrder").orderBy("name").orderBy(FieldPath.documentId());
  const fingerprint = `${kind}:${parentId ?? ""}`;
  if (cursor) {
    try {
      if (cursor.length > 2500) throw new Error();
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (value.f !== fingerprint || typeof value.name !== "string" || !Number.isInteger(value.order) || value.order < 0 || value.order > 1_000_000 || !idSchema.safeParse(value.id).success) throw new Error();
      query = query.startAfter(value.order, value.name, value.id);
    } catch { return { documents: [] as ManagedDestination[], nextCursor: null, invalidCursor: true }; }
  }
  const snapshot = await query.limit(size + 1).get();
  const documents = snapshot.docs.slice(0, size).map((doc) => parseDestination(kind, doc.id, doc.data()));
  const last = documents.at(-1);
  const nextCursor = snapshot.size > size && last ? Buffer.from(JSON.stringify({ f: fingerprint, order: last.sortOrder, name: last.name, id: last.id })).toString("base64url") : null;
  return { documents, nextCursor, invalidCursor: false };
}
