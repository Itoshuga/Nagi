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
const origin = "http://127.0.0.1:3108";
// Copier les sources dans un projet temporaire évite de toucher au serveur de
// développement déjà ouvert et à ses fichiers .next / TypeScript.
const fixture = mkdtempSync(join(tmpdir(), "nagi-contents-"));
for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) cpSync(entry, join(fixture, entry), { recursive: true });
symlinkSync(resolve("node_modules"), join(fixture, "node_modules"), "dir");
const emulatorEnv = {
  ...process.env, METADATA_SERVER_DETECTION: "none", NAGI_CONTENT_SOURCE: "firestore", NAGI_GEOGRAPHY_SOURCE: "firestore", NODE_ENV: "development", ADMIN_APP_ORIGIN: origin,
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
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", fixture, "--webpack", "--hostname", "127.0.0.1", "--port", "3108"], { env, cwd: fixture, stdio: ["ignore", "pipe", "pipe"] });
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
const app = initializeApp({ projectId: "demo-nagi" }, "nagi-contents-test");
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
async function mutation(method, path, body, cookie = adminSession, headers = {}) {
  const protection = await csrf();
  const response = await fetch(`${origin}/api/admin/contents${path ? `/${path}` : ""}`, { method, headers: { Origin: origin, Cookie: `${protection.cookie}; ${cookie}`, "X-CSRF-Token": protection.token, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function page(path, status = 200) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual" });
  assert.equal(response.status, status, path);
  return response.text();
}
function runImport(args) {
  return execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/import-geography.ts", ...args], { env: emulatorEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const { contentInputSchema, contentDocumentSchema, relationSchema } = await import('../src/lib/contents/schema.ts');
const { makeContent, listContents } = await import('../src/lib/contents/store.ts');
const { demonstrationContents } = await import('../src/lib/contents/demo.ts');
const draft = (type, title, slug, destinations = [], details = {}) => contentInputSchema.parse({ type, title, slug, summary: `Le carnet de ${title}.`, description: `Une présentation attentive de ${title}.`, status: 'draft', destinations, details: { category: type === 'gastronomie' ? 'Plat' : 'Autre', ...details } });
const ref = item => ({ id: item.id, type: item.type });
function input(item) { return contentInputSchema.parse(Object.fromEntries(Object.entries(item).filter(([key]) => !['id','schemaVersion','locale','createdAt','updatedAt','publishedAt','archivedAt','revision','searchTitle','geographyKeys','isArchived'].includes(key)))); }
async function contentSave(data, previous, relations = []) { return mutation(previous ? 'PUT' : 'POST', previous?.id ?? '', { data, expectedRevision: previous?.revision ?? null, relations }); }
async function latest(id) { return (await db.collection('contents').doc(id).get()).data(); }
async function contentUpdate(item, patch, relations = []) { const result = await contentSave({ ...input(item), ...patch }, item, relations); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.content; }
function runContentImport(args) { return execFileSync(process.execPath, ['--conditions=react-server','--import','tsx','scripts/import-contents.ts',...args], { env: emulatorEnv, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
const ueno = { kind: 'district', id: 'district-tokyo-ueno' };
const tokyo = { kind: 'city', id: 'city-jp-tokyo' };
try {
  await waitForServer();
  runImport(['--project=demo-nagi','--apply','--confirm-project=demo-nagi']);
  assert.equal((await db.collection('contents').get()).size, 0);
  await page('/decouvertes/tourisme/senso-ji',404);
  assert.match(await page('/destinations/japon/tokyo/ueno'), /Une page encore/);
  assert.match(runContentImport(['--project=demo-nagi','--dry-run']), /SIMULATION SANS ÉCRITURE/);
  assert.equal((await db.collection('contents').get()).size,0);
  assert.throws(() => runContentImport(['--project=wrong-project','--apply','--confirm-project=wrong-project']));
  assert.throws(() => runContentImport(['--project=demo-nagi','--apply']));
  runContentImport(['--project=demo-nagi','--apply','--confirm-project=demo-nagi']);
  assert.equal((await db.collection('contents').get()).size, demonstrationContents().length);
  const original = await latest('place-sensoji'); contentDocumentSchema.parse(original);
  assert.equal(original.title,'Sensō-ji'); assert.equal(original.coverImage,'/images/asakusa.jpg');
  const edgesBefore = (await db.collection('contentRelations').get()).size; assert.ok(edgesBefore > 0);
  for (const doc of (await db.collection('contentRelations').get()).docs) relationSchema.parse(doc.data());
  assert.match(await page('/decouvertes/gastronomie/tonkatsu'), /Ginza Bairin/);
  assert.match(await page('/decouvertes/adresses/ginza-bairin'), /Tonkatsu/);
  runContentImport(['--project=demo-nagi','--apply','--confirm-project=demo-nagi']);
  assert.deepEqual(await latest(original.id),original); assert.equal((await db.collection('contentRelations').get()).size,edgesBefore);
  console.info('Migration : simulation sans écriture, confirmation, références, IDs, photos, relations et idempotence vérifiés.');
  const admin = await auth.createUser({email:`content-admin-${Date.now()}@example.test`,password}); users.push(admin.uid); await auth.setCustomUserClaims(admin.uid,{admin:true});
  const ordinary = await auth.createUser({email:`content-ordinary-${Date.now()}@example.test`,password}); users.push(ordinary.uid);
  const result = await login(await signIn(admin.email,password)); assert.equal(result.status,200);
  adminSession = result.headers.getSetCookie().find(value=>value.startsWith('nagi-session=')).split(';')[0];
  const ordinarySession = `nagi-session=${await auth.createSessionCookie(await signIn(ordinary.email,password),{expiresIn:28800000})}`;
  const tourismInput = draft('tourisme','Jardin de la revue','jardin-revue',[ueno],{visitDuration:'45 minutes',officialUrl:'https://example.test/visite'});
  assert.equal((await mutation('POST','',{data:tourismInput,expectedRevision:null,relations:[]},'')).status,401);
  assert.equal((await mutation('POST','',{data:tourismInput,expectedRevision:null,relations:[]},ordinarySession)).status,403);
  assert.equal((await mutation('POST','',{data:tourismInput,expectedRevision:null,relations:[]},adminSession,{Origin:'https://foreign.example'})).status,403);
  const c = await csrf(); assert.equal((await mutation('POST','',{data:tourismInput,expectedRevision:null,relations:[]},adminSession,{'X-CSRF-Token':'invalid'})).status,403); void c;
  assert.equal((await contentSave({...tourismInput,revision:1})).status,422);
  assert.equal((await contentSave({...tourismInput,coverImage:'https://foreign.example/photo.jpg'})).status,422);
  assert.equal((await contentSave({...tourismInput,details:{...tourismInput.details,officialUrl:'javascript:alert(1)'}})).status,422);
  assert.equal((await contentSave({...tourismInput,destinations:[{kind:'city',id:'missing-city'}]})).status,422);
  const concurrent = await Promise.all([contentSave(tourismInput),contentSave(tourismInput)]); assert.deepEqual(concurrent.map(value=>value.status).sort(),[201,409]);
  let tourism = concurrent.find(value=>value.status===201).body.content;
  await page('/decouvertes/tourisme/jardin-revue',404);
  assert.doesNotMatch(await page('/destinations/japon/tokyo/ueno'),/Jardin de la revue/);
  tourism = await contentUpdate(tourism,{status:'published'});
  assert.match(await page('/destinations/japon/tokyo/ueno'),/Jardin de la revue/);
  assert.match(await page('/destinations/japon/tokyo'),/Jardin de la revue/);
  assert.doesNotMatch(await page('/destinations/japon/tokyo/shinjuku'),/Jardin de la revue/);
  assert.match(await page('/decouvertes/tourisme/jardin-revue'),/45 minutes/);
  assert.equal((await contentSave({...input(tourism),slug:'url-cassee'},tourism)).status,409);
  const activityResult = await contentSave({...draft('activites','Atelier des gestes','atelier-gestes',[ueno],{duration:'Deux heures'}),status:'published'},null,[ref(tourism)]); assert.equal(activityResult.status,201,JSON.stringify(activityResult.body));
  let activity = activityResult.body.content;
  assert.match(await page('/decouvertes/activites/atelier-gestes'),/Jardin de la revue/);
  assert.match(await page('/decouvertes/tourisme/jardin-revue'),/Atelier des gestes/);
  const foodResult = await contentSave({...draft('gastronomie','Spécialité de la revue','specialite-revue',[ueno,tokyo],{ingredients:['Riz','Sésame']}),status:'published'}); assert.equal(foodResult.status,201);
  let food = foodResult.body.content;
  const secondFoodResult = await contentSave({...draft('gastronomie','Seconde spécialité','seconde-specialite',[tokyo]),status:'published'}); assert.equal(secondFoodResult.status,201); const secondFood = secondFoodResult.body.content;
  assert.equal((await db.collection('contents').where('slug','==','specialite-revue').get()).size,1);
  const foodTab = await page('/destinations/japon/tokyo?onglet=gastronomie'); assert.match(foodTab,/Spécialité de la revue/); assert.equal((foodTab.match(/class="discovery-card"/g)||[]).length >= 1,true);
  const addressResult = await contentSave({...draft('adresses','Maison des saveurs','maison-saveurs',[ueno],{postalAddress:'Rue des jardins',openingHours:'Du mardi au samedi'}),status:'published'},null,[ref(food),ref(secondFood)]); assert.equal(addressResult.status,201,JSON.stringify(addressResult.body));
  let address = addressResult.body.content;
  let addressHtml = await page('/decouvertes/adresses/maison-saveurs'); assert.match(addressHtml,/Spécialité de la revue/); assert.match(addressHtml,/Seconde spécialité/);
  assert.match(await page('/decouvertes/gastronomie/specialite-revue'),/Maison des saveurs/);
  assert.match(await page('/decouvertes/gastronomie/seconde-specialite'),/Maison des saveurs/);
  assert.equal((await contentSave(input(food),food,[ref(address)])).status,409,'L’édition inverse doit invalider l’ancienne révision.');
  food = await latest(food.id);
  food = await contentUpdate(food,{description:'Une histoire gastronomique actualisée.'},[]);
  assert.doesNotMatch(await page('/decouvertes/adresses/maison-saveurs'),/href="\/decouvertes\/gastronomie\/specialite-revue/);
  assert.match(await page('/decouvertes/gastronomie/specialite-revue'),/histoire gastronomique actualisée/);
  address = await latest(address.id);
  address = await contentUpdate(address,{details:{...address.details,openingHours:'Uniquement le mercredi'},description:'Une maison actualisée.'},[ref(secondFood)]);
  addressHtml = await page('/decouvertes/adresses/maison-saveurs'); assert.match(addressHtml,/Uniquement le mercredi/); assert.match(addressHtml,/Une maison actualisée/);
  address = await contentUpdate(address,{status:'draft'},[ref(secondFood)]);
  await page('/decouvertes/adresses/maison-saveurs',404);
  assert.doesNotMatch(await page('/decouvertes/gastronomie/seconde-specialite'),/Maison des saveurs/);
  address = await contentUpdate(address,{status:'published'},[ref(secondFood)]);
  assert.equal((await contentSave(input(activity),activity,[{id:'missing-content',type:'tourisme'}])).status,422);
  activity = await latest(activity.id);
  assert.equal((await contentSave(input(activity),activity,[ref(secondFood)])).status,422);
  assert.equal((await contentSave(input(activity),activity,[ref(tourism),ref(tourism)])).status,422);
  const incomplete = await contentSave({...draft('tourisme','Brouillon sans présentation','brouillon-libre'),summary:'',description:''}); assert.equal(incomplete.status,201);
  const previewPath = `/admin/contents/${incomplete.body.content.id}/preview`;
  assert.equal((await protectedPage('',previewPath)).status,307); assert.equal((await protectedPage(ordinarySession,previewPath)).status,307);
  const preview = await protectedPage(adminSession,previewPath); assert.equal(preview.status,200); assert.match(await preview.text(),/Prévisualisation privée/);
  for (const type of ['tourisme','activites','gastronomie','adresses']) { const editor = await protectedPage(adminSession,`/admin/contents/new?type=${type}`); assert.equal(editor.status,200); assert.match(await editor.text(),/Enregistrer la découverte/); }
  const japanRef = db.collection('countries').doc('country-jp'); const japan = (await japanRef.get()).data();
  await japanRef.update({status:'draft'});
  for (const path of ['/decouvertes/tourisme/jardin-revue','/decouvertes/activites/atelier-gestes','/decouvertes/adresses/maison-saveurs','/decouvertes/gastronomie/specialite-revue']) await page(path,404);
  await japanRef.set(japan);
  const hiddenDistrict = db.collection('districts').doc(ueno.id); const originalDistrict = (await hiddenDistrict.get()).data(); await hiddenDistrict.update({status:'draft'});
  await page('/decouvertes/tourisme/jardin-revue',404);
  assert.equal((await fetch(`${origin}/decouvertes/gastronomie/specialite-revue`)).status,200,'L’association directe à la ville reste publique.');
  await hiddenDistrict.set(originalDistrict);
  const archived = await mutation('POST',address.id,{operation:'archive',expectedRevision:address.revision}); assert.equal(archived.status,200);
  await page('/decouvertes/adresses/maison-saveurs',404); assert.doesNotMatch(await page('/decouvertes/gastronomie/seconde-specialite'),/Maison des saveurs/);
  const restored = await mutation('POST',address.id,{operation:'restore',expectedRevision:archived.body.content.revision}); assert.equal(restored.status,200); assert.equal(restored.body.content.status,'draft');
  assert.equal((await mutation('DELETE',tourism.id,{})).status,409);
  const beforeImport = await latest(food.id); runContentImport(['--project=demo-nagi','--apply','--confirm-project=demo-nagi']); assert.deepEqual(await latest(food.id),beforeImport);
  const importedFood = await latest('food-tonkatsu');
  const editedImportedFood = await contentUpdate(importedFood,{description:'Description importée corrigée volontairement.'},[]);
  runContentImport(['--project=demo-nagi','--apply','--confirm-project=demo-nagi']);
  assert.deepEqual(await latest(importedFood.id),editedImportedFood);
  assert.equal((await db.collection('contentRelations').where('memberKeys','array-contains','gastronomie:food-tonkatsu').get()).size,0,'Le réimport ne doit pas restaurer une relation retirée.');
  console.info('Fiches : création des quatre univers, agrégation sans doublon, édition, brouillons, URL gelées, archivage et prévisualisation privée vérifiés.');
  console.info('Relations : lieux et activités dans les deux sens, restaurant et deux spécialités, édition inverse, retrait et dépublication sans lien privé vérifiés.');
  const batch = db.batch();
  for (let i=0;i<30;i++) { const item=makeContent(draft('tourisme',`Pagination ${String(i).padStart(2,'0')}`,`pagination-${i}`),`pagination-${i}`,[]); batch.set(db.collection('contents').doc(item.id),item); }
  await batch.commit();
  const firstPage = await listContents(db,{q:'pagination',type:'tourisme',status:'draft'}); assert.equal(firstPage.documents.length,24); assert.ok(firstPage.nextCursor);
  const secondPage = await listContents(db,{q:'pagination',type:'tourisme',status:'draft',cursor:firstPage.nextCursor}); assert.equal(secondPage.documents.length,6);
  assert.equal(new Set([...firstPage.documents,...secondPage.documents].map(item=>item.id)).size,30);
  await assert.rejects(()=>listContents(db,{q:'other',cursor:firstPage.nextCursor}));
  const search = await protectedPage(adminSession,'/api/admin/contents/search?type=tourisme&q=pagination'); const searchBody = await search.json(); assert.equal(searchBody.items.length,24); assert.ok(searchBody.nextCursor);
  assert.equal((await protectedPage(ordinarySession,'/api/admin/contents/search')).status,403);
  const filtered = await protectedPage(adminSession,`/admin/contents?type=tourisme&status=published&geo=city:city-jp-tokyo&q=jardin`); assert.match(await filtered.text(),/Jardin de la revue/);
  console.info('Sécurité et volume : sessions, rôle, CSRF, origines, validations, concurrence, références, filtres et pagination 24 + 6 fiches sans doublon vérifiés.');
  await stopServer(); server = startServer({...emulatorEnv,NAGI_CONTENT_SOURCE:'static'}); await waitForServer();
  assert.doesNotMatch(await page('/destinations/japon/tokyo/ueno'),/Jardin de la revue/); await page('/decouvertes/tourisme/senso-ji'); await page('/decouvertes/tourisme/jardin-revue',404);
  console.info('Transition : sources exclusives, aucun repli sur les démos en mode Firestore et aucune fusion en mode statique.');
} catch(error) { console.error(output); throw error; }
finally { for(const uid of users) await auth.deleteUser(uid).catch(()=>undefined); await db.terminate(); await deleteApp(app); await stopServer(); rmSync(fixture,{recursive:true,force:true}); }
