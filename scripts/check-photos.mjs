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
const origin = "http://127.0.0.1:3112";
// Copier les sources dans un projet temporaire évite de toucher au serveur de
// développement déjà ouvert et à ses fichiers .next / TypeScript.
const fixture = mkdtempSync(join(tmpdir(), "nagi-photos-"));
for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) cpSync(entry, join(fixture, entry), { recursive: true });
symlinkSync(resolve("node_modules"), join(fixture, "node_modules"), "dir");
const emulatorEnv = {
  ...process.env, NAGI_PHOTO_MAX_BYTES: "5000000", CRON_SECRET: "photos-test-cleanup-secret-123456789012345", METADATA_SERVER_DETECTION: "none", NAGI_CONTENT_SOURCE: "firestore", NAGI_GEOGRAPHY_SOURCE: "firestore", NODE_ENV: "development", ADMIN_APP_ORIGIN: origin,
  NEXT_PUBLIC_SITE_URL: origin,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-nagi.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-nagi", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-nagi.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "demo", NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
  NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true", FIREBASE_ADMIN_PROJECT_ID: "demo-nagi",
  FIREBASE_ADMIN_CLIENT_EMAIL: "", FIREBASE_ADMIN_PRIVATE_KEY: "",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
};
Object.assign(process.env, emulatorEnv);
let output = "";
function startServer(env) {
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", fixture, "--webpack", "--hostname", "127.0.0.1", "--port", "3112"], { env, cwd: fixture, stdio: ["ignore", "pipe", "pipe"] });
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
const app = initializeApp({ projectId: "demo-nagi" }, "nagi-photos-test");
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


const { Firestore } = await import("firebase-admin/firestore");
const db = new Firestore({ projectId: "demo-nagi", host: "127.0.0.1:8080", ssl: false });
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
const password = "Nagi-geo-test-2026!";
let adminSession = "";

async function page(path, status = 200) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual" });
  assert.equal(response.status, status, path);
  return response.text();
}
function runImport(args) {
  return execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/import-geography.ts", ...args], { env: emulatorEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const sharp = (await import('sharp')).default;
const { randomUUID, createHash, generateKeyPairSync } = await import('node:crypto');
const { getAdminStorage, getAdminFirestore } = await import('../src/lib/firebase/admin.ts');
const { cleanupPhotos } = await import('../src/lib/photos/cleanup.ts');
const { optimizePhoto } = await import('../src/lib/photos/processing.ts');
const { contentInputSchema } = await import('../src/lib/contents/schema.ts');
const bucket = getAdminStorage().bucket();
const jpeg = await sharp({create:{width:640,height:400,channels:3,background:'#8d9d74'}}).withMetadata({orientation:6,exif:{IFD0:{Artist:'Private photographer',ImageDescription:'Sensitive location'}}}).jpeg({quality:94}).toBuffer();
async function call(path, data, cookie=adminSession, extra={}) {
  const c=await csrf(); const response=await fetch(`${origin}${path}`,{method:'POST',headers:{Origin:origin,Cookie:`${c.cookie}; ${cookie}`,'X-CSRF-Token':c.token,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
  return {status:response.status,body:await response.json()};
}
async function upload(scope, bytes=jpeg, mime='image/jpeg', cookie=adminSession) {
  const ticket=await call('/api/admin/photos',{scope,mime,bytes:bytes.length},cookie); assert.equal(ticket.status,201,JSON.stringify(ticket.body));
  const c=await csrf(); const sent=await fetch(`${origin}${ticket.body.url}`,{method:'PUT',headers:{Origin:origin,Cookie:`${c.cookie}; ${cookie}`,'X-CSRF-Token':c.token,'Content-Type':mime},body:bytes}); assert.equal(sent.status,200,await sent.text());
  return {ticket:ticket.body, result:await call(`/api/admin/photos/${ticket.body.id}/finalize`,{},cookie)};
}
const scope=(kind,id=null,draftId=randomUUID())=>({kind,id,draftId});
const photoUrl=(photo,variant='display')=>`/api/photos/${photo.id}/${variant}`;
async function imageStatus(photo,status,cookie='') {const r=await fetch(`${origin}${photoUrl(photo)}`,{headers:{Cookie:cookie}});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');return r;}
async function saveDestination(kind, patch={}, previous=null, revision=previous?.revision??null) {
  const base=previous?Object.fromEntries(Object.entries(previous).filter(([key])=>['kind','name','nativeName','slug','summary','description','status','visibility','sortOrder','isoCode','continent','countryId','cityId','coverPhoto'].includes(key))):{kind,name:`Photo ${kind}`,slug:`photo-${kind}`,summary:'Une destination à découvrir.',description:'Un regard sur cette destination.',status:'published',...(kind==='cities'?{countryId:country.id}:kind==='districts'?{cityId:city.id}:{})};
  const c=await csrf();const response=await fetch(`${origin}/api/admin/geography/${kind}${previous?`/${previous.id}`:''}`,{method:previous?'PUT':'POST',headers:{Origin:origin,Cookie:`${c.cookie}; ${adminSession}`,'X-CSRF-Token':c.token,'Content-Type':'application/json'},body:JSON.stringify({data:{...base,coverImage:previous?.coverImage?.src??'',...patch},expectedRevision:revision})});
  return {status:response.status,body:await response.json()};
}
async function destination(kind,patch={},previous=null) {const r=await saveDestination(kind,patch,previous);assert.equal(r.status,previous?200:201,JSON.stringify(r.body));return r.body.destination;}
function contentData(item) {return Object.fromEntries(Object.entries(item).filter(([key])=>!['id','schemaVersion','locale','createdAt','updatedAt','publishedAt','archivedAt','revision','searchTitle','geographyKeys','isArchived','photoAssetIds','photos','images','imageCaptions'].includes(key)));}
async function saveContent(type, coverPhoto, previous=null, patch={}) {
  const data=previous?contentData(previous):contentInputSchema.parse({type,title:`Photo ${type}`,slug:`photo-${type}`,summary:'Une découverte à voir.',description:'La présentation de cette découverte.',status:'published',destinations:[{kind:'district',id:district.id}],details:{category:type==='gastronomie'?'Plat':'Autre'}});
  const c=await csrf();const response=await fetch(`${origin}/api/admin/contents${previous?`/${previous.id}`:''}`,{method:previous?'PUT':'POST',headers:{Origin:origin,Cookie:`${c.cookie}; ${adminSession}`,'X-CSRF-Token':c.token,'Content-Type':'application/json'},body:JSON.stringify({data:{...data,...(coverPhoto?{coverPhoto}:{}),...patch},expectedRevision:previous?.revision??null,relations:[]})});
  return {status:response.status,body:await response.json()};
}
async function content(type, coverPhoto, previous=null, patch={}) {const r=await saveContent(type,coverPhoto,previous,patch);assert.equal(r.status,previous?200:201,JSON.stringify(r.body));return r.body.content;}
let country,city,district;
try {
  await waitForServer();
  const admin=await auth.createUser({email:`photos-admin-${Date.now()}@example.test`,password});users.push(admin.uid);await auth.setCustomUserClaims(admin.uid,{admin:true});
  const ordinary=await auth.createUser({email:`photos-ordinary-${Date.now()}@example.test`,password});users.push(ordinary.uid);
  const second=await auth.createUser({email:`photos-second-${Date.now()}@example.test`,password});users.push(second.uid);await auth.setCustomUserClaims(second.uid,{admin:true});
  const loginResponse=await login(await signIn(admin.email,password));assert.equal(loginResponse.status,200);adminSession=loginResponse.headers.getSetCookie().find(value=>value.startsWith('nagi-session=')).split(';')[0];
  const ordinarySession=`nagi-session=${await auth.createSessionCookie(await signIn(ordinary.email,password),{expiresIn:28800000})}`;
  const secondSession=`nagi-session=${await auth.createSessionCookie(await signIn(second.email,password),{expiresIn:28800000})}`;
  const request={scope:scope('countries'),mime:'image/jpeg',bytes:jpeg.length};
  assert.equal((await call('/api/admin/photos',request,'')).status,401);assert.equal((await call('/api/admin/photos',request,ordinarySession)).status,403);
  assert.equal((await call('/api/admin/photos',request,adminSession,{Origin:'https://foreign.example'})).status,403);assert.equal((await call('/api/admin/photos',request,adminSession,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await call('/api/admin/photos',{...request,bytes:5000001})).status,413);
  for(const mime of ['image/avif','image/gif','image/svg+xml','application/pdf'])assert.equal((await call('/api/admin/photos',{...request,mime})).status,415);
  const uploaded=await upload(request.scope);assert.equal(uploaded.result.status,200,JSON.stringify(uploaded.result.body));const cover={...uploaded.result.body.photo,alt:'Couverture du pays'};
  assert.equal(cover.width,400);assert.equal(cover.height,640);await imageStatus(cover,404);await imageStatus(cover,200,adminSession);await imageStatus(cover,404,secondSession);
  assert.equal((await call(`/api/admin/photos/${cover.id}/finalize`,{},secondSession)).status,403);
  const [bytes]=await bucket.file(cover.path).download();const metadata=await sharp(bytes).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);assert.ok(!bytes.includes(Buffer.from('Sensitive location')));
  country=await destination('countries',{coverPhoto:cover,status:'draft'});await imageStatus(cover,404);country=await destination('countries',{status:'published'},country);await imageStatus(cover,200);
  assert.ok((await page(`/destinations/${country.slug}`)).includes(photoUrl(cover)));
  assert.equal((await fetch(`${origin}/_next/image?url=${encodeURIComponent(photoUrl(cover))}&w=640&q=75`)).status,400);
  city=await destination('cities',{coverImage:'/images/tokyo-alley.jpg'});const cityUpload=await upload(scope('cities',city.id));assert.equal(cityUpload.result.status,200);city=await destination('cities',{coverPhoto:cityUpload.result.body.photo},city);assert.equal(city.coverImage.src,'/images/tokyo-alley.jpg');
  const districtUpload=await upload(scope('districts'));assert.equal(districtUpload.result.status,200);district=await destination('districts',{coverPhoto:districtUpload.result.body.photo});
  for(const [path,item] of [[`/destinations/${country.slug}/${city.slug}`,city],[`/destinations/${country.slug}/${city.slug}/${district.slug}`,district]])assert.ok((await page(path)).includes(photoUrl(item.coverPhoto)));
  const items=[];
  for(const type of ['tourisme','activites','gastronomie','adresses']) {
    const uploadResult=await upload(scope('contents'));assert.equal(uploadResult.result.status,200);
    const item=await content(type,{...uploadResult.result.body.photo,alt:`Couverture ${type}`});items.push(item);
    const html=await page(`/decouvertes/${type}/${item.slug}`);assert.ok(html.includes(photoUrl(item.coverPhoto)));assert.doesNotMatch(html,/discovery-story-gallery/);
    const adminHtml=await fetch(`${origin}/admin/contents/${item.id}`,{headers:{Cookie:adminSession}}).then(r=>r.text());assert.match(adminHtml,/Upload une photo/);assert.doesNotMatch(adminHtml,/Ajouter des photographies|Ajuster le cadrage|gallery-select/);
  }
  console.info('Sept types : création, modification, couverture publique et composant unique sans galerie vérifiés.');
  const replacement=await upload(scope('countries',country.id));assert.equal(replacement.result.status,200);const previous=country.coverPhoto;
  assert.equal((await saveDestination('countries',{coverPhoto:replacement.result.body.photo},country,1)).status,409);await imageStatus(previous,200);await imageStatus(replacement.result.body.photo,404);
  const invalid=await saveDestination('countries',{coverPhoto:{...replacement.result.body.photo,width:99}},country);assert.equal(invalid.status,422);await imageStatus(previous,200);
  country=await destination('countries',{coverPhoto:replacement.result.body.photo},country);await imageStatus(country.coverPhoto,200);await imageStatus(previous,404);assert.equal((await bucket.file(previous.path).exists())[0],true);
  const unchangedDigest=createHash('sha256').update((await bucket.file(country.coverPhoto.path).download())[0]).digest('hex');country=await destination('countries',{summary:'Présentation actualisée.'},country);assert.equal(createHash('sha256').update((await bucket.file(country.coverPhoto.path).download())[0]).digest('hex'),unchangedDigest);
  country=await destination('countries',{visibility:'private'},country);for(const item of [country,city,district,items[0]])await imageStatus(item.coverPhoto,404);country=await destination('countries',{visibility:'public'},country);
  const privateItem=await content('tourisme',undefined,items[0],{visibility:'private'});await imageStatus(privateItem.coverPhoto,404);await imageStatus(privateItem.coverPhoto,200,adminSession);
  assert.equal((await saveContent('activites',city.coverPhoto,null,{slug:'foreign-cover'})).status,403);
  assert.equal((await saveContent('activites',undefined,null,{photos:{cover:null,gallery:[]}})).status,422);
  assert.equal((await saveContent('activites',undefined,null,{images:['/images/asakusa.jpg']})).status,422);
  assert.equal((await saveContent('activites',{...items[1].coverPhoto,focal:{x:10,y:70}})).status,422);
  const disguised=await upload(scope('contents'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>'));assert.equal(disguised.result.status,415);
  const bad=await upload(scope('contents'),Buffer.from('not an image'));assert.equal(bad.result.status,422);
  const png=await sharp({create:{width:800,height:600,channels:3,background:'#abc'}}).png().toBuffer();assert.equal((await upload(scope('contents'),png,'image/png')).result.status,200);
  const webp=await sharp(jpeg).webp().toBuffer();assert.equal((await upload(scope('contents'),webp,'image/webp')).result.status,200);
  const small=await sharp({create:{width:64,height:64,channels:3,background:'#abc'}}).jpeg().toBuffer();assert.equal((await upload(scope('contents'),small)).result.status,200);
  const avif=await sharp(jpeg).avif().toBuffer();assert.equal((await upload(scope('contents'),avif,'image/jpeg')).result.status,415,'Le format réel AVIF reste refusé même déguisé en JPEG.');
  assert.equal((await optimizePhoto(png)).display.info.width,800);
  // Anciennes couvertures, locales ou stockées par l’ancienne version.
  runImport(['--project=demo-nagi','--apply','--confirm-project=demo-nagi']);assert.match(await page('/destinations/japon/tokyo'),/shinjuku.jpg/);
  const legacy=await destination('countries',{slug:'legacy-cover',name:'Ancien pays',coverImage:'/images/kyoto-hero.jpg'});
  const historical=await upload(scope('countries',legacy.id));assert.equal(historical.result.status,200);const oldCover={...historical.result.body.photo,focal:{x:22,y:74}};
  await db.collection('countries').doc(legacy.id).update({photos:{cover:oldCover,gallery:[]},photoAssetIds:[oldCover.id]});await db.collection('photoAssets').doc(oldCover.id).update({state:'attached',references:[`countries/${legacy.id}`]});
  assert.match(await page('/destinations/legacy-cover'),/22% 74%/);await imageStatus(oldCover,200);
  const latestLegacy=(await db.collection('countries').doc(legacy.id).get()).data();await destination('countries',{summary:'Modification sans photo.'},latestLegacy);await imageStatus(oldCover,200);
  // Remplacement engagé, nettoyage simulé et reprise d’une finalisation.
  const expired=new Date(Date.now()-3600000).toISOString();await db.collection('photoAssets').doc(previous.id).update({expiresAt:expired});
  const dry=await cleanupPhotos(getAdminFirestore(),getAdminStorage());assert.ok(dry.some(x=>x.id===previous.id&&x.action==='delete'));assert.equal((await bucket.file(previous.path).exists())[0],true);
  await cleanupPhotos(getAdminFirestore(),getAdminStorage(),true);assert.equal((await bucket.file(previous.path).exists())[0],false);await imageStatus(country.coverPhoto,200);
  const interrupted=await upload(scope('contents'));assert.equal(interrupted.result.status,200);const interruptedId=interrupted.result.body.photo.id;
  await db.collection('photoAssets').doc(interruptedId).update({state:'processing',photo:null,operation:'interrupted-worker',lockUntil:expired});assert.equal((await call(`/api/admin/photos/${interruptedId}/finalize`,{})).status,200);
  const {Storage}=await import('@google-cloud/storage');const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const signer=new Storage({projectId:'demo-nagi',credentials:{client_email:'test@demo-nagi.iam.gserviceaccount.com',private_key:privateKey}});
  const [policy]=await signer.bucket('demo-nagi.appspot.com').file('temporary/test/original').generateSignedPostPolicyV4({expires:Date.now()+600000,fields:{'Content-Type':'image/jpeg'},conditions:[['content-length-range',1,5000000]]});
  assert.equal(policy.fields.key,'temporary/test/original');assert.ok(policy.fields['x-goog-signature']);
  await auth.setCustomUserClaims(admin.uid,{});assert.equal((await call('/api/admin/photos',request)).status,403);await imageStatus(privateItem.coverPhoto,404,adminSession);
  console.info('Permissions, trois formats, limite de taille, erreurs, sauvegarde en conflit, anciennes couvertures et reprise vérifiés.');
} catch(error) { console.error(output.slice(-4000));throw error; }
finally {for(const uid of users)await auth.deleteUser(uid).catch(()=>undefined);await db.terminate();await getAdminFirestore().terminate();await deleteApp(app);await stopServer();rmSync(fixture,{recursive:true,force:true});}
