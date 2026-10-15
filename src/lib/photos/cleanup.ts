import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { assetReference, parseAsset } from "./assets";

// Un lot borné, relançable. Les suppressions Storage incomplètes gardent leur
// tombstone Firestore ; un prochain passage reprend les mêmes fichiers exacts.
export async function cleanupPhotos(db: Firestore, storage: Storage, apply = false, now = new Date().toISOString(), limit = 100) {
  const expired = await db.collection("photoAssets").where("state", "in", ["uploading", "processing", "ready", "error", "deleting"]).where("expiresAt", "<=", now).orderBy("expiresAt").limit(limit).get();
  const originals = await db.collection("photoAssets").where("originalDeleted", "==", false).where("state", "==", "attached").where("policyExpiresAt", "<=", now).limit(limit).get();
  const report: { id: string; action: "delete" | "original" | "protected" | "retry" }[] = [];
  const bucket = storage.bucket();
  for (const snapshot of expired.docs) {
    const candidate = parseAsset(snapshot.data());
    if (candidate.state === "attached" || candidate.references.length || candidate.state === "processing" && candidate.lockUntil! > now) continue;
    const eligible = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(snapshot.ref); if (!current.exists) return false;
      const asset = parseAsset(current.data());
      if (asset.references.length || asset.state === "attached" || asset.expiresAt > now || asset.state === "processing" && asset.lockUntil! > now) return false;
      // Seconde barrière indépendante du registre de références. Même un
      // document modifié manuellement ne doit pas perdre ses fichiers.
      for (const kind of ["countries", "cities", "districts", "contents"]) {
        const uses = await transaction.get(db.collection(kind).where("photoAssetIds", "array-contains", asset.id).limit(1));
        const cover = await transaction.get(db.collection(kind).where("coverPhoto.id", "==", asset.id).limit(1));
        const legacyCover = await transaction.get(db.collection(kind).where("photos.cover.id", "==", asset.id).limit(1));
        if (!uses.empty || !cover.empty || !legacyCover.empty) return false;
      }
      if (apply) transaction.update(current.ref, { state: "deleting", operation: null, lockUntil: null });
      return true;
    });
    if (!eligible) { report.push({ id: candidate.id, action: "protected" }); continue; }
    if (!apply) { report.push({ id: candidate.id, action: "delete" }); continue; }
    try {
      for (const path of [candidate.original, `${candidate.prefix}display.webp`, `${candidate.prefix}thumbnail.webp`]) await bucket.file(path).delete({ ignoreNotFound: true });
      await assetReference(db, candidate.id).delete();
      report.push({ id: candidate.id, action: "delete" });
    } catch { report.push({ id: candidate.id, action: "retry" }); }
  }
  for (const snapshot of originals.docs) {
    const asset = parseAsset(snapshot.data());
    if (!apply) { report.push({ id: asset.id, action: "original" }); continue; }
    try { await bucket.file(asset.original).delete({ ignoreNotFound: true }); await snapshot.ref.update({ originalDeleted: true }); report.push({ id: asset.id, action: "original" }); }
    catch { report.push({ id: asset.id, action: "retry" }); }
  }
  return report;
}
