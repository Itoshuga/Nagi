import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { coverReference, photoReferenceSchema } from "./schema";
import type { PhotoAsset } from "./assets";

async function publicDestination(db: Firestore, kind: string, id: string): Promise<boolean> {
  const snapshot = await db.collection(kind).doc(id).get(); const item = snapshot.data();
  if (!item || item.status !== "published" || item.visibility !== "public" || item.archivedAt !== null) return false;
  if (kind === "countries") return true;
  const parent = kind === "cities" ? item.countryId : item.cityId;
  return typeof parent === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(parent) ? publicDestination(db, kind === "cities" ? "countries" : "cities", parent) : false;
}
export async function canReadPublicPhoto(db: Firestore, asset: PhotoAsset) {
  if (asset.state !== "attached") return false;
  for (const key of asset.references) {
    const [kind, id] = key.split("/");
    if (!["countries", "cities", "districts", "contents"].includes(kind) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id ?? "")) continue;
    if (process.env.NAGI_GEOGRAPHY_SOURCE !== "firestore" || kind === "contents" && process.env.NAGI_CONTENT_SOURCE !== "firestore") continue;
    const snapshot = await db.collection(kind).doc(id).get(); const item = snapshot.data();
    const cover = photoReferenceSchema.safeParse(coverReference(item));
    if (!item || !cover.success || cover.data.kind !== "storage" || cover.data.id !== asset.id) continue;
    if (kind !== "contents") { if (await publicDestination(db, kind, id)) return true; continue; }
    if (item.status !== "published" || item.visibility !== "public" || item.isArchived !== false || item.archivedAt !== null || !Array.isArray(item.destinations)) continue;
    for (const ref of item.destinations) {
      if (!ref || !["country", "city", "district"].includes(ref.kind) || typeof ref.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(ref.id)) continue;
      if (await publicDestination(db, ref.kind === "country" ? "countries" : ref.kind === "city" ? "cities" : "districts", ref.id)) return true;
    }
  }
  return false;
}
