import "server-only";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { importedPhotoCredit } from "../../fixtures/catalogue/photo-credit";

export async function backfillPhotoCredits(db: Firestore, apply = false) {
  const plan: { path: string; action: string }[] = [];
  for (const kind of ["countries", "cities", "districts", "contents"]) {
    let after: string | undefined;
    do {
      let query = db.collection(kind).orderBy(FieldPath.documentId()).limit(100);
      if (after) query = query.startAfter(after);
      const page = await query.get();
      for (const snapshot of page.docs) {
        const action = await db.runTransaction(async (transaction) => {
          const fresh = await transaction.get(snapshot.ref); const data = fresh.data();
          if (!data || data.coverPhoto || data.photos) return "keep";
          if (kind === "contents") {
            if (data.coverCredit !== undefined) return "keep";
            const credit = importedPhotoCredit(data.coverImage);
            if (!credit) return "keep";
            if (apply) transaction.update(snapshot.ref, { coverCredit: credit });
          } else {
            if (typeof data.coverImage === "string") return data.coverImage ? "legacy-needs-save" : "keep";
            const photo = data.coverImage;
            if (!photo || photo.credit || photo.author || photo.sourceUrl) return "keep";
            const credit = importedPhotoCredit(photo.src);
            if (!credit) return "keep";
            if (apply) transaction.update(snapshot.ref, { "coverImage.credit": credit });
          }
          return "add-credit";
        });
        plan.push({ path: snapshot.ref.path, action });
      }
      after = page.size === 100 ? page.docs.at(-1)?.id : undefined;
    } while (after);
  }
  return plan;
}
