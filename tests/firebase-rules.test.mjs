import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, query, where, setDoc, deleteDoc, setLogLevel } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";

const geographicCollections = ["countries", "cities", "districts"];
const collections = ["countries", "cities", "districts", "tourism", "activities", "food", "addresses"];
// Les refus intentionnels sont vérifiés par assertFails, sans polluer la sortie.
setLogLevel("silent");
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nagi",
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    for (const name of collections) {
      for (const [id, status, visibility] of [["public", "published", "public"], ["draft", "draft", "public"], ["private", "published", "private"]]) {
        await setDoc(doc(context.firestore(), name, id), { status, visibility, archivedAt: null, ...(name === "cities" ? { countryId: "public" } : name === "districts" ? { cityId: "public" } : {}) });
      }
      await setDoc(doc(context.firestore(), name, "legacy"), { status: "published" });
    }
    await setDoc(doc(context.firestore(), "settings", "private"), { private: true });
    await setDoc(doc(context.firestore(), "countries", "public", "internal", "secret"), { private: true });
    await uploadBytes(ref(context.storage(), "media/test.txt"), new TextEncoder().encode("private"));
  });
});
after(async () => { await env?.cleanup(); });

test("visiteurs et comptes ordinaires : seuls les documents publiés ET publics sont lisibles", async () => {
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext("ordinary"), env.authenticatedContext("forged", { admin: "true" })]) {
    const db = context.firestore();
    for (const name of collections) {
      await assertSucceeds(getDoc(doc(db, name, "public")));
      for (const id of ["draft", "private", "legacy"]) await assertFails(getDoc(doc(db, name, id)));
      await assertFails(getDocs(collection(db, name)));
      await assertSucceeds(getDocs(query(collection(db, name), where("status", "==", "published"), where("visibility", "==", "public"), ...(geographicCollections.includes(name) ? [where("archivedAt", "==", null)] : []), ...(name === "cities" ? [where("countryId", "==", "public")] : name === "districts" ? [where("cityId", "==", "public")] : []))));
      await assertFails(setDoc(doc(db, name, "intruder"), { status: "published", visibility: "public" }));
      await assertFails(deleteDoc(doc(db, name, "public")));
    }
  }
});

test("admin : lecture du catalogue, écritures géographiques réservées au serveur", async () => {
  const db = env.authenticatedContext("admin", { admin: true }).firestore();
  for (const name of collections) {
    await assertSucceeds(getDoc(doc(db, name, "draft")));
    await assertSucceeds(getDoc(doc(db, name, "private")));
    await assertSucceeds(getDocs(collection(db, name)));
    const write = geographicCollections.includes(name) ? assertFails : assertSucceeds;
    await write(setDoc(doc(db, name, "managed"), { status: "draft", visibility: "private" }));
    await write(setDoc(doc(db, name, "managed"), { status: "published", visibility: "public" }));
    await write(deleteDoc(doc(db, name, geographicCollections.includes(name) ? "public" : "managed")));
  }
});

test("collections inconnues, sous-collections et Storage sont refusés pour tous", async () => {
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext("ordinary"), env.authenticatedContext("admin", { admin: true })]) {
    const db = context.firestore();
    await assertFails(getDoc(doc(db, "settings", "private")));
    await assertFails(setDoc(doc(db, "settings", "intruder"), {}));
    await assertFails(setDoc(doc(db, "geographySlugs", "reserved"), { destinationId: "intruder" }));
    await assertFails(getDoc(doc(db, "geographySlugs", "reserved")));
    await assertFails(getDoc(doc(db, "countries", "public", "internal", "secret")));
    await assertFails(setDoc(doc(db, "countries", "public", "internal", "intruder"), {}));
    await assertFails(getBytes(ref(context.storage(), "media/test.txt")));
    await assertFails(uploadBytes(ref(context.storage(), "media/intruder.txt"), new Uint8Array([1])));
  }
});


test("la dépublication du pays masque la ville et le quartier dans les règles", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "countries", "hidden-parent"), { status: "draft", visibility: "public", archivedAt: null });
    await setDoc(doc(context.firestore(), "cities", "hidden-city"), { countryId: "hidden-parent", status: "published", visibility: "public", archivedAt: null });
    await setDoc(doc(context.firestore(), "districts", "hidden-district"), { cityId: "hidden-city", status: "published", visibility: "public", archivedAt: null });
  });
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext("ordinary")]) {
    await assertFails(getDoc(doc(context.firestore(), "cities", "hidden-city")));
    await assertFails(getDoc(doc(context.firestore(), "districts", "hidden-district")));
  }
  const admin = env.authenticatedContext("admin", { admin: true });
  await assertSucceeds(getDoc(doc(admin.firestore(), "districts", "hidden-district")));
});
