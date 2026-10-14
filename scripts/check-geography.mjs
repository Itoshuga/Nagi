import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Ce test ne peut contacter que le projet d’émulation local.
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
process.env.METADATA_SERVER_DETECTION = "none";
const origin = "http://127.0.0.1:3107";
// Copier les sources dans un projet temporaire évite de toucher au serveur de
// développement déjà ouvert et à ses fichiers .next / TypeScript.
const fixture = mkdtempSync(join(tmpdir(), "nagi-geography-"));
for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) cpSync(entry, join(fixture, entry), { recursive: true });
symlinkSync(resolve("node_modules"), join(fixture, "node_modules"), "dir");
const emulatorEnv = {
  ...process.env, METADATA_SERVER_DETECTION: "none", NAGI_GEOGRAPHY_SOURCE: "firestore", NODE_ENV: "development", ADMIN_APP_ORIGIN: origin,
  NEXT_PUBLIC_SITE_URL: origin,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-nagi.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-nagi", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-nagi.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "demo", NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
  NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true", FIREBASE_ADMIN_PROJECT_ID: "demo-nagi",
  FIREBASE_ADMIN_CLIENT_EMAIL: "", FIREBASE_ADMIN_PRIVATE_KEY: "",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
};
let output = "";
function startServer(env) {
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", fixture, "--webpack", "--hostname", "127.0.0.1", "--port", "3107"], { env, cwd: fixture, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  return child;
}
let server = startServer(emulatorEnv);
async function stopServer() {
  server.kill("SIGTERM");
  await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
}
async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${origin}/admin/login`)).ok) return; } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await delay(1000);
  }
  throw new Error("Le serveur Next.js doit démarrer.");
}
const app = initializeApp({ projectId: "demo-nagi" }, "nagi-geography-test");
const auth = getAuth(app);
const users = [];

async function csrf() {
  const response = await fetch(`${origin}/api/admin/csrf`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { csrfToken } = await response.json();
  return { cookie: response.headers.get("set-cookie").split(";")[0], token: csrfToken };
}
async function signIn(email, password) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200);
  return (await response.json()).idToken;
}
async function login(idToken, extraHeaders = {}, body) {
  const { cookie, token } = await csrf();
  return fetch(`${origin}/api/admin/session`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": token, "Content-Type": "application/json", ...extraHeaders }, body: body ?? JSON.stringify({ idToken }) });
}
async function protectedPage(cookie = "", path = "/admin") {
  return fetch(`${origin}${path}`, { redirect: "manual", headers: { Cookie: cookie } });
}

const { Firestore } = await import("firebase-admin/firestore");
const db = new Firestore({ projectId: "demo-nagi", host: "127.0.0.1:8080", ssl: false });
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
const password = "Nagi-geo-test-2026!";
let adminSession = "";
function inputFromDocument(item) {
  const keys = ["kind", "name", "nativeName", "slug", "summary", "description", "status", "visibility", "sortOrder", ...(item.kind === "countries" ? ["isoCode", "continent"] : item.kind === "cities" ? ["countryId"] : ["cityId"])];
  return { ...Object.fromEntries(keys.map((key) => [key, item[key]])), coverImage: item.coverImage?.src ?? "" };
}
const base = (kind, name, slug, extra = {}) => ({ kind, name, nativeName: "", slug, summary: `Le carnet de ${name}.`, description: `Une présentation attentive de ${name}.`, coverImage: "", status: "draft", visibility: "public", sortOrder: 0, ...(kind === "countries" ? { isoCode: "", continent: "" } : {}), ...extra });
async function mutation(method, path, body, cookie = adminSession, headers = {}) {
  const protection = await csrf();
  const response = await fetch(`${origin}/api/admin/geography/${path}`, { method, headers: { Origin: origin, Cookie: `${protection.cookie}; ${cookie}`, "X-CSRF-Token": protection.token, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function save(data, previous) {
  return mutation(previous ? "PUT" : "POST", `${data.kind}${previous ? `/${previous.id}` : ""}`, { data, expectedRevision: previous?.revision ?? null });
}
async function update(previous, patch) {
  const result = await save({ ...inputFromDocument(previous), ...patch }, previous);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.destination;
}
async function page(path, status = 200) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual" });
  assert.equal(response.status, status, path);
  return response.text();
}
function runImport(args) {
  return execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/import-geography.ts", ...args], { env: emulatorEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
try {
  await waitForServer();
  assert.equal((await db.collection("countries").get()).size, 0);
  const emptyCatalogue = await page("/destinations");
  assert.doesNotMatch(emptyCatalogue, /href="\/destinations\/japon|class="destination-atlas"/);
  assert.match(emptyCatalogue, /Notre carnet prépare ses premières escales/);
  assert.match(runImport(["--project=demo-nagi", "--dry-run"]), /SIMULATION SANS ÉCRITURE/);
  assert.equal((await db.collection("countries").get()).size, 0);
  assert.throws(() => runImport(["--project=wrong-project", "--apply", "--confirm-project=wrong-project"]));
  assert.throws(() => runImport(["--project=demo-nagi", "--apply"]));
  runImport(["--project=demo-nagi", "--apply", "--confirm-project=demo-nagi"]);
  const originalJapan = (await db.collection("countries").doc("country-jp").get()).data();
  assert.equal((await db.collection("countries").get()).size, 1);
  assert.equal((await db.collection("cities").get()).size, 4);
  assert.equal((await db.collection("districts").get()).size, 5);
  assert.equal((await db.collection("geographySlugs").get()).size, 10);
  assert.match(runImport(["--project=demo-nagi", "--apply", "--confirm-project=demo-nagi"]), /0 destination\(s\) créée/);
  assert.deepEqual((await db.collection("countries").doc("country-jp").get()).data(), originalJapan);
  console.info("Migration : simulation sans écriture, garde de projet, confirmation, dix IDs préservés et import idempotent vérifiés.");
  const admin = await auth.createUser({ email: `geo-admin-${Date.now()}@example.test`, password }); users.push(admin.uid);
  const ordinary = await auth.createUser({ email: `geo-ordinary-${Date.now()}@example.test`, password }); users.push(ordinary.uid);
  await auth.setCustomUserClaims(admin.uid, { admin: true });
  const token = await signIn(admin.email, password);
  const result = await login(token); assert.equal(result.status, 200);
  adminSession = result.headers.getSetCookie().find((value) => value.startsWith("nagi-session=")).split(";")[0];
  const ordinarySession = `nagi-session=${await auth.createSessionCookie(await signIn(ordinary.email, password), { expiresIn: 28800 * 1000 })}`;
  // Reproduire le format réellement rencontré : aucun kind/version, image sous
  // forme de chemin, brouillon sans textes et champs de pays vides sur les enfants.
  const legacyDate = "2026-10-11T21:53:39.457Z";
  const legacy = (kind, id, name, slug, extra = {}) => {
    const { kind: _kind, visibility: _visibility, ...input } = base(kind, name, slug, extra);
    void _kind; void _visibility;
    return { ...input, id, isoCode: "", continent: "", coverImage: "/images/tokyo-alley.jpg", createdAt: legacyDate, updatedAt: legacyDate };
  };
  const legacyCountry = legacy("countries", "legacy-country", "Ancien pays", "ancien-pays", { summary: "", description: "" });
  const legacyCity = legacy("cities", "legacy-city", "Ancienne ville", "ancienne-ville", { countryId: legacyCountry.id, status: "published", publishedAt: legacyDate });
  const legacyDistrict = legacy("districts", "legacy-district", "Ancien quartier", "ancien-quartier", { cityId: legacyCity.id, status: "published", publishedAt: legacyDate });
  for (const [kind, document] of [["countries", legacyCountry], ["cities", legacyCity], ["districts", legacyDistrict]]) await db.collection(kind).doc(document.id).set(document);
  for (const [path, name] of [["/admin/countries", legacyCountry.name], ["/admin/cities", legacyCity.name], [`/admin/countries/${legacyCountry.id}/edit`, legacyCountry.name], [`/admin/cities/${legacyCity.id}`, legacyDistrict.name]]) {
    const response = await protectedPage(adminSession, path); assert.equal(response.status, 200);
    const html = await response.text(); assert.ok(html.includes(name), path); assert.doesNotMatch(html, /destinations sont momentanément indisponibles|format incompatible/);
  }
  assert.deepEqual((await db.collection("countries").doc(legacyCountry.id).get()).data(), legacyCountry);
  const inherited = await protectedPage(adminSession, `/admin/cities/${legacyCity.id}`);
  assert.match(await inherited.text(), /Masqué : le pays parent/);
  const legacyCityInput = base("cities", legacyCity.name, legacyCity.slug, { countryId: legacyCountry.id, status: "published", coverImage: legacyCity.coverImage });
  const legacyVersion = { id: legacyCity.id, revision: 1 };
  assert.equal((await save({ ...legacyCityInput, slug: "adresse-cassee" }, legacyVersion)).status, 409);
  const upgradedCity = await save(legacyCityInput, legacyVersion);
  assert.equal(upgradedCity.status, 200); assert.equal(upgradedCity.body.destination.id, legacyCity.id);
  assert.equal(upgradedCity.body.destination.revision, 2); assert.equal(upgradedCity.body.destination.publishedAt, legacyDate);
  assert.equal(upgradedCity.body.destination.coverImage.src, legacyCity.coverImage);
  assert.deepEqual((await db.collection("countries").doc(legacyCountry.id).get()).data(), legacyCountry);
  const archivedLegacy = await mutation("POST", `districts/${legacyDistrict.id}`, { operation: "archive", expectedRevision: 1 });
  assert.equal(archivedLegacy.status, 200); assert.equal(archivedLegacy.body.destination.cityId, legacyCity.id);
  assert.equal(archivedLegacy.body.destination.revision, 2);
  console.info("Compatibilité : anciens pays, villes et quartiers lisibles sans écriture ; édition, archivage, héritage et URL protégées vérifiés.");
  const newCountry = base("countries", "Pays des ateliers", "pays-ateliers");
  assert.equal((await mutation("POST", "countries", { data: newCountry, expectedRevision: null }, "")).status, 401);
  assert.equal((await mutation("POST", "countries", { data: newCountry, expectedRevision: null }, ordinarySession)).status, 403);
  assert.equal((await mutation("POST", "countries", { data: newCountry, expectedRevision: null }, adminSession, { Origin: "https://foreign.example" })).status, 403);
  assert.equal((await save({ ...newCountry, slug: "invalide//" })).status, 422);
  assert.equal((await save({ ...newCountry, coverImage: "https://foreign.example/photo.jpg" })).status, 422);
  const concurrency = await Promise.all([save(newCountry), save(newCountry)]);
  assert.deepEqual(concurrency.map((item) => item.status).sort(), [201, 409]);
  let country = concurrency.find((item) => item.status === 201).body.destination;
  assert.equal(country.name, newCountry.name);
  assert.doesNotMatch(await page("/destinations"), /Pays des ateliers/);
  await page("/destinations/pays-ateliers", 404);
  country = await update(country, { slug: "carnet-ateliers" });
  const reusedDraftSlug = await save(newCountry); assert.equal(reusedDraftSlug.status, 201);
  let otherCountry = reusedDraftSlug.body.destination;
  country = await update(country, { status: "published" });
  assert.match(await page("/destinations"), /Pays des ateliers/);
  assert.match(await page("/destinations/carnet-ateliers"), /Une présentation attentive/);
  assert.equal((await save({ ...inputFromDocument(country), slug: "url-cassee" }, country)).status, 409);
  const revisions = await Promise.all([save({ ...inputFromDocument(country), name: "Carnet des ateliers" }, country), save({ ...inputFromDocument(country), name: "Carnet concurrent" }, country)]);
  assert.deepEqual(revisions.map((item) => item.status).sort(), [200, 409]);
  country = revisions.find((item) => item.status === 200).body.destination;
  assert.match(await page("/destinations/carnet-ateliers"), new RegExp(country.name));
  assert.equal((await save(base("cities", "Ville orpheline", "orpheline", { countryId: "missing-country" }))).status, 422);
  const cityResult = await save(base("cities", "Nara du carnet", "nara-carnet", { countryId: "country-jp", status: "published" }));
  assert.equal(cityResult.status, 201, JSON.stringify(cityResult.body));
  let city = cityResult.body.destination;
  const cityPath = "/destinations/japon/nara-carnet";
  const cityHtml = await page(cityPath);
  assert.match(cityHtml, /Nara du carnet/);
  for (const universe of ["tourisme", "activites", "gastronomie", "adresses"]) assert.match(cityHtml, new RegExp(`id="tab-${universe}"`));
  assert.match(await page("/destinations/japon"), /Nara du carnet/);
  assert.equal((await save({ ...inputFromDocument(city), countryId: country.id }, city)).status, 409);
  const districtResult = await save(base("districts", "Le quartier des jardins", "jardins-carnet", { cityId: "city-jp-tokyo" }));
  assert.equal(districtResult.status, 201);
  let district = districtResult.body.destination;
  const districtPath = "/destinations/japon/tokyo/jardins-carnet";
  await page(districtPath, 404);
  district = await update(district, { status: "published" });
  assert.match(await page(districtPath), /Le quartier des jardins/);
  const tokyo = await page("/destinations/japon/tokyo?onglet=adresses");
  assert.match(tokyo, /Le quartier des jardins/);
  assert.match(tokyo, /id="tab-adresses"/);
  assert.match(tokyo, /Maisen Aoyama/);
  assert.equal((await save(base("districts", "Conflit", "jardins-carnet", { cityId: "city-jp-tokyo" }))).status, 409);
  assert.equal((await save(base("districts", "Autre contexte", "jardins-carnet", { cityId: city.id }))).status, 201);
  assert.equal((await save(base("districts", "Chemin réservé", "explorer", { cityId: city.id }))).status, 422);
  district = await update(district, { name: "Jardins renommés", summary: "Un résumé actualisé." });
  assert.match(await page(districtPath), /Jardins renommés/);
  let japan = await update(originalJapan, { status: "draft" });
  for (const path of ["/destinations/japon", cityPath, districtPath, "/destinations/japon/tokyo", "/decouvertes/tourisme/senso-ji"]) await page(path, 404);
  const directoryWithoutJapan = await page("/destinations");
  assert.doesNotMatch(directoryWithoutJapan, /Nara du carnet|Jardins renommés/);
  const adminTokyo = await protectedPage(adminSession, "/admin/cities/city-jp-tokyo");
  assert.equal(adminTokyo.status, 200);
  assert.match(await adminTokyo.text(), /Masqué : le pays parent/);
  japan = await update(japan, { status: "published" });
  await page(districtPath);
  assert.equal((await mutation("DELETE", "countries/country-jp", {})).status, 409);
  const archived = await mutation("POST", `countries/${japan.id}`, { operation: "archive", expectedRevision: japan.revision });
  assert.equal(archived.status, 200); japan = archived.body.destination;
  assert.equal((await db.collection("cities").doc("city-jp-tokyo").get()).exists, true);
  assert.equal((await db.collection("districts").doc(district.id).get()).exists, true);
  await page(districtPath, 404);
  assert.equal((await save(base("countries", "Nom libre, URL réservée", "japon"))).status, 409);
  const restored = await mutation("POST", `countries/${japan.id}`, { operation: "restore", expectedRevision: japan.revision });
  assert.equal(restored.status, 200); japan = restored.body.destination;
  assert.equal(japan.status, "draft"); await page(districtPath, 404);
  japan = await update(japan, { status: "published" }); await page(districtPath);
  city = await update(city, { visibility: "private" }); await page(cityPath, 404);
  assert.equal((await save({ ...inputFromDocument(city), slug: "nouveau-slug" }, city)).status, 409);
  otherCountry = await update(otherCountry, { name: "Démo à conserver" });
  japan = await update(japan, { description: "Présentation du Japon modifiée dans l’administration." });
  runImport(["--project=demo-nagi", "--apply", "--confirm-project=demo-nagi"]);
  assert.equal((await db.collection("countries").doc(otherCountry.id).get()).data().name, "Démo à conserver");
  assert.equal((await db.collection("countries").doc(japan.id).get()).data().description, japan.description);
  const search = await protectedPage(adminSession, `/admin/countries?q=${encodeURIComponent(country.name.toUpperCase())}&sort=name`);
  assert.equal(search.status, 200); const searchHtml = await search.text();
  assert.ok(searchHtml.includes(country.name), "La recherche doit retrouver le nom issu de l’édition concurrente.");
  assert.doesNotMatch(searchHtml, /geo-row-title[^]*?>Japon<\/a>/);
  const edit = await protectedPage(adminSession, "/admin/cities/new?country=country-jp");
  assert.match(await edit.text(), /option value="country-jp" selected/);
  console.info("Géographie : créations, validations, concurrence des slugs, versions, URL protégées, héritage, villes sans quartiers et contenus directs vérifiés.");
  console.info("Sécurité : visiteurs, comptes ordinaires, origine étrangère, parents inexistants, déplacement interdit, archivage, restauration et suppression bloquée vérifiés.");
  await stopServer();
  server = startServer({ ...emulatorEnv, NAGI_GEOGRAPHY_SOURCE: "static" });
  await waitForServer();
  const staticDirectory = await page("/destinations");
  assert.doesNotMatch(staticDirectory, /Carnet des ateliers|Carnet concurrent|Nara du carnet|Jardins renommés/);
  assert.match(staticDirectory, /Tokyo/);
  console.info("Transition : le mode statique reste séparé du catalogue administré ; aucune fusion ni repli silencieux.");
} catch (error) {
  console.error(output); throw error;
} finally {
  for (const uid of users) await auth.deleteUser(uid).catch(() => undefined);
  await db.terminate(); await deleteApp(app); await stopServer();
  rmSync(fixture, { recursive: true, force: true });
}
