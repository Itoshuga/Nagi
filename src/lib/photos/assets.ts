import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminStorage } from "../firebase/admin";
import { photoScopeSchema, storagePhotoSchema, type PhotoReference, type PhotoScope, type StoragePhoto } from "./schema";
import { optimizePhoto, PhotoError, photoByteLimit, photoMimeTypes } from "./processing";

export const assetSchema = z.object({
  id: z.uuid(), owner: z.string(), scope: photoScopeSchema,
  state: z.enum(["uploading", "processing", "ready", "attached", "error", "deleting"]),
  original: z.string(), originalDeleted: z.boolean(), prefix: z.string(), mime: z.string(), declaredBytes: z.number(),
  createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), policyExpiresAt: z.iso.datetime(),
  references: z.array(z.string()).max(100), photo: storagePhotoSchema.nullable(),
  operation: z.string().nullable(), lockUntil: z.iso.datetime().nullable(),
}).strict().superRefine((asset, context) => {
  if (asset.original !== `temporary/${asset.id}/original` || asset.prefix !== `entities/${asset.scope.kind}/${asset.scope.id ?? asset.scope.draftId}/${asset.id}/` || asset.photo && asset.photo.path !== `${asset.prefix}display.webp`) context.addIssue({ code: "custom", message: "Chemins de photographie incompatibles." });
});
export type PhotoAsset = z.infer<typeof assetSchema>;
export const assetReference = (db: Firestore, id: string) => db.collection("photoAssets").doc(id);
export function parseAsset(raw: unknown) { return assetSchema.parse(raw); }
const tomorrow = () => new Date(Date.now() + 24 * 3600_000).toISOString();

export async function beginPhotoUpload(owner: string, scope: PhotoScope, mime: string, bytes: number) {
  const limit = photoByteLimit();
  if (!photoMimeTypes.includes(mime)) throw new PhotoError("Utilisez une photographie JPEG, PNG ou WebP.", 415);
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > limit) throw new PhotoError(`La photographie doit peser moins de ${Math.round(limit / 1_000_000)} Mo.`, 413);
  const db = getAdminFirestore(); const bucket = getAdminStorage().bucket(); const id = randomUUID();
  const now = new Date().toISOString(); const policyExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const asset: PhotoAsset = { id, owner, scope, state: "uploading", original: `temporary/${id}/original`, originalDeleted: false, prefix: `entities/${scope.kind}/${scope.id ?? scope.draftId}/${id}/`, mime, declaredBytes: bytes, createdAt: now, expiresAt: tomorrow(), policyExpiresAt, references: [], photo: null, operation: null, lockUntil: null };
  await db.runTransaction(async (transaction) => {
    if (scope.id) {
      const entity = await transaction.get(db.collection(scope.kind).doc(scope.id));
      if (!entity.exists || entity.data()?.archivedAt) throw new PhotoError("Cette fiche est introuvable ou archivée.", 409);
    }
    // Le verrou commun sérialise aussi deux démarrages d’import simultanés.
    const quota = db.collection("photoUploadOwners").doc(createHash("sha256").update(owner).digest("hex"));
    await transaction.get(quota);
    const pending = await transaction.get(db.collection("photoAssets").where("owner", "==", owner).where("state", "in", ["uploading", "processing", "ready"]).where("expiresAt", ">", now).limit(40));
    if (pending.docs.filter((doc) => { const item = parseAsset(doc.data()); return ["uploading", "processing", "ready"].includes(item.state) && item.expiresAt > now; }).length >= 40) throw new PhotoError("40 imports attendent déjà une sauvegarde. Enregistrez vos fiches ou réessayez après leur expiration.", 429);
    transaction.set(quota, { updatedAt: now }); transaction.create(assetReference(db, id), asset);
  });
  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true") return { id, maxBytes: limit, transport: "emulator" as const, url: `/api/admin/photos/${id}/upload`, fields: {} };
    // POST signé : le binaire va directement dans Storage, sans Server Action
    // ni limite de corps Vercel. La session est vérifiée avant la signature.
    const [policy] = await bucket.file(asset.original).generateSignedPostPolicyV4({ expires: new Date(policyExpiresAt), fields: { "Content-Type": mime }, conditions: [["content-length-range", 1, limit]] });
    return { id, maxBytes: limit, transport: "storage" as const, ...policy };
  } catch {
    await assetReference(db, id).update({ state: "error" }).catch(() => {});
    throw new PhotoError("L’importation n’est pas disponible. Vérifiez le bucket et la signature Storage.", 503);
  }
}
export async function readOwnedAsset(id: string, owner: string) {
  const snapshot = await assetReference(getAdminFirestore(), id).get();
  if (!snapshot.exists) throw new PhotoError("Cet import n’existe plus.", 404);
  const asset = parseAsset(snapshot.data());
  if (asset.owner !== owner) throw new PhotoError("Cet import appartient à une autre session administrateur.", 403);
  if (asset.expiresAt < new Date().toISOString() || asset.state === "deleting") throw new PhotoError("Cet import a expiré. Sélectionnez à nouveau la photographie.", 410);
  return asset;
}
export async function finishPhotoUpload(id: string, owner: string) {
  const db = getAdminFirestore(); const bucket = getAdminStorage().bucket(); const reference = assetReference(db, id); const operation = randomUUID();
  const asset = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new PhotoError("Import introuvable.", 404);
    const current = parseAsset(snapshot.data());
    if (current.owner !== owner) throw new PhotoError("Import non autorisé.", 403);
    if (current.state === "ready" || current.state === "attached") return current;
    if (current.expiresAt < new Date().toISOString() || ["error", "deleting"].includes(current.state)) throw new PhotoError("Cet import a expiré ou échoué. Réimportez la photographie.", 410);
    if (current.state === "processing" && current.lockUntil! > new Date().toISOString()) throw new PhotoError("Cette photographie est déjà en cours de traitement.", 409);
    transaction.update(reference, { state: "processing", operation, lockUntil: new Date(Date.now() + 120_000).toISOString() });
    return current;
  });
  if (asset.photo && ["ready", "attached"].includes(asset.state)) return asset.photo;
  try {
    const original = bucket.file(asset.original); const [meta] = await original.getMetadata();
    if (Number(meta.size) !== asset.declaredBytes || Number(meta.size) > photoByteLimit()) throw new PhotoError("La taille reçue ne correspond pas à la photographie sélectionnée.", 413);
    const [bytes] = await bucket.file(asset.original, { generation: meta.generation }).download();
    const result = await optimizePhoto(bytes);
    for (const variant of ["display"] as const) {
      const image = result[variant];
      const file = bucket.file(`${asset.prefix}${variant}.webp`);
      const identity = { photoId: id, sourceGeneration: String(meta.generation), width: String(image.info.width), height: String(image.info.height) };
      try { await file.save(image.data, { resumable: false, contentType: "image/webp", preconditionOpts: { ifGenerationMatch: 0 }, metadata: { cacheControl: "private, no-store", metadata: identity } }); }
      catch (error) {
        if (Number((error as { code?: number }).code) !== 412) throw error;
        const [existing] = await file.getMetadata();
        if (Object.entries(identity).some(([key, value]) => existing.metadata?.[key] !== value)) throw new PhotoError("Le fichier a changé pendant le transfert. Réimportez la photographie.", 409);
        // Reprise après écriture partielle de la même génération immuable.
      }
    }
    const photo: StoragePhoto = { kind: "storage", id, path: `${asset.prefix}display.webp`, variant: "display", width: result.display.info.width, height: result.display.info.height, alt: "Photographie à décrire", focal: { x: 50, y: 50 }, caption: "" };
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference); const current = parseAsset(snapshot.data());
      if (current.state !== "processing" || current.operation !== operation) throw new PhotoError("Le traitement a expiré. Réessayez.", 409);
      transaction.update(reference, { photo, state: "ready", operation: null, lockUntil: null, expiresAt: tomorrow() });
    });
    // Ne pas effacer l’original avant l’expiration du formulaire signé : une
    // retransmission pourrait le recréer. Le nettoyage le supprimera ensuite.
    return photo;
  } catch (error) {
    await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(reference); if (snapshot.data()?.operation === operation) transaction.update(reference, { state: "error", operation: null, lockUntil: null }); }).catch(() => {});
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("Le transfert ou l’optimisation a échoué. Vérifiez Storage puis réessayez.", 503);
  }
}

// Appeler après TOUTES les autres lectures transactionnelles, avant l’écriture
// de la fiche. Références et fiche sont ainsi engagées atomiquement.
export async function bindCover(db: Firestore, transaction: Transaction, kind: PhotoScope["kind"], id: string, photo: StoragePhoto, previous: PhotoReference | null, actor?: string) {
  const key = `${kind}/${id}`; const requested = new Map([[photo.id, photo]]);
  const ids = new Set([photo.id, ...(previous?.kind === "storage" ? [previous.id] : [])]);
  const changes: PhotoAsset[] = [];
  for (const assetId of ids) {
    const snapshot = await transaction.get(assetReference(db, assetId));
    if (!snapshot.exists) throw new PhotoError("Une photographie a expiré. Réimportez-la avant d’enregistrer.", 409);
    const asset = parseAsset(snapshot.data()); const photo = requested.get(assetId);
    if (photo) {
      if (!["ready", "attached"].includes(asset.state) || !asset.photo || asset.photo.path !== photo.path || asset.photo.width !== photo.width || asset.photo.height !== photo.height) throw new PhotoError("Une photographie n’est pas prête ou sa référence est invalide.", 422);
      if (!asset.references.includes(key) && (!actor || asset.owner !== actor || asset.scope.kind !== kind || asset.scope.id && asset.scope.id !== id || asset.references.length || asset.expiresAt < new Date().toISOString())) throw new PhotoError("Cette photographie ne peut pas être associée à cette fiche.", 403);
      if (!asset.references.includes(key)) asset.references.push(key);
      asset.state = "attached";
    } else {
      asset.references = asset.references.filter((ref) => ref !== key);
      if (!asset.references.length) { asset.state = "ready"; asset.expiresAt = tomorrow(); }
    }
    changes.push(asset);
  }
  for (const asset of changes) transaction.set(assetReference(db, asset.id), asset);
}
