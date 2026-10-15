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
const origin = "http://127.0.0.1:3105";
// Copier les sources dans un projet temporaire évite de toucher au serveur de
// développement déjà ouvert et à ses fichiers .next / TypeScript.
const fixture = mkdtempSync(join(tmpdir(), "nagi-auth-"));
for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) cpSync(entry, join(fixture, entry), { recursive: true });
symlinkSync(resolve("node_modules"), join(fixture, "node_modules"), "dir");
const emulatorEnv = {
  ...process.env, METADATA_SERVER_DETECTION: "none", NODE_ENV: "development", ADMIN_APP_ORIGIN: origin,
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
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", fixture, "--webpack", "--hostname", "127.0.0.1", "--port", "3105"], { env, cwd: fixture, stdio: ["ignore", "pipe", "pipe"] });
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
const app = initializeApp({ projectId: "demo-nagi" }, "nagi-auth-test");
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

try {
  await waitForServer();
  const password = "Nagi-emulator-test-2026!";
  const admin = await auth.createUser({ email: `admin-${Date.now()}@example.test`, password }); users.push(admin.uid);
  const ordinary = await auth.createUser({ email: `ordinary-${Date.now()}@example.test`, password }); users.push(ordinary.uid);
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/admin-role.ts", admin.uid, "grant"], { env: emulatorEnv });
  const adminToken = await signIn(admin.email, password);
  const ordinaryToken = await signIn(ordinary.email, password);
  for (const path of ["/admin", "/admin/settings"]) {
    const response = await protectedPage("", path);
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location"), /\/admin\/login/);
    assert.doesNotMatch(await response.text(), /Vos destinations|Compte &amp; sécurité/);
  }
  assert.equal((await login(adminToken, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await login(adminToken, { "X-CSRF-Token": "a".repeat(64) })).status, 403);
  assert.equal((await login(adminToken, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await login(adminToken, {}, "not-json")).status, 400);
  assert.equal((await login(adminToken, {}, JSON.stringify({ idToken: "x".repeat(17_000) }))).status, 413);
  assert.equal((await login("not-a-valid-token")).status, 401);
  const denied = await login(ordinaryToken);
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /Accès refusé/);
  assert.equal(denied.headers.get("set-cookie"), null);
  const success = await login(adminToken);
  assert.equal(success.status, 200);
  const sessionHeader = success.headers.getSetCookie().find((value) => value.startsWith("nagi-session="));
  assert.match(sessionHeader, /HttpOnly/i);
  assert.match(sessionHeader, /SameSite=strict/i);
  assert.match(sessionHeader, /Max-Age=28800/i);
  const session = sessionHeader.split(";")[0];
  assert.equal((await protectedPage(session)).status, 200);
  assert.equal((await protectedPage(session, "/admin/settings")).status, 200);
  assert.match((await protectedPage(session)).headers.get("cache-control"), /no-store/);
  assert.equal((await protectedPage("nagi-session=forged")).status, 307);
  // Session valide d’un utilisateur sans rôle : pas de fuite du tableau de bord.
  const ordinarySession = await auth.createSessionCookie(ordinaryToken, { expiresIn: 28800 * 1000 });
  const ordinaryPage = await protectedPage(`nagi-session=${ordinarySession}`);
  assert.equal(ordinaryPage.status, 307);
  assert.match(ordinaryPage.headers.get("location"), /reason=forbidden/);
  // Supprimer le rôle sans même révoquer le token doit déjà fermer l’accès.
  await auth.setCustomUserClaims(admin.uid, {});
  assert.equal((await protectedPage(session)).status, 307);
  await auth.setCustomUserClaims(admin.uid, { admin: true });
  // La révocation doit aussi invalider les cookies existants.
  await delay(1100);
  await auth.revokeRefreshTokens(admin.uid);
  assert.equal((await protectedPage(session)).status, 307);
  const freshToken = await signIn(admin.email, password);
  const freshLogin = await login(freshToken);
  assert.equal(freshLogin.status, 200);
  const freshSession = freshLogin.headers.getSetCookie().find((value) => value.startsWith("nagi-session=")).split(";")[0];
  assert.equal((await fetch(`${origin}/api/admin/session`, { method: "DELETE", headers: { Origin: origin, Cookie: freshSession } })).status, 403);
  const protection = await csrf();
  const logout = await fetch(`${origin}/api/admin/session`, { method: "DELETE", headers: { Origin: origin, Cookie: `${protection.cookie}; ${freshSession}`, "X-CSRF-Token": protection.token } });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().some((value) => value.startsWith("nagi-session=;") && value.includes("Max-Age=0")));
  assert.equal((await protectedPage()).status, 307);
  console.info("Auth émulateur : connexion admin, refus non-admin, CSRF, cookies, routes, retrait du rôle, révocation et déconnexion vérifiés.");
  await stopServer();
  server = startServer({ ...emulatorEnv, NEXT_PUBLIC_FIREBASE_API_KEY: "", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "", FIREBASE_ADMIN_PROJECT_ID: "" });
  await waitForServer();
  const unconfiguredLogin = await (await fetch(`${origin}/admin/login`)).text();
  assert.match(unconfiguredLogin, /La connexion n’est pas encore disponible/);
  assert.match(unconfiguredLogin, /type="submit" disabled/);
  assert.equal((await protectedPage()).status, 307);
  assert.equal((await login(adminToken)).status, 503);
  for (const path of ["/", "/destinations", "/destinations/japon/tokyo"]) { const response = await fetch(`${origin}${path}`); assert.ok(response.status >= 500 && response.status <= 503, path); }
  console.info("Configuration absente : formulaire désactivé, session refusée et indisponibilité publique sans repli de démonstration.");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  for (const uid of users) await auth.deleteUser(uid).catch(() => undefined);
  await deleteApp(app);
  await stopServer();
  rmSync(fixture, { recursive: true, force: true });
}
