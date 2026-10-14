import type { NextRequest } from "next/server";
import { FirebaseConfigurationError, getAdminAuth } from "@/lib/firebase/admin";
import { authJson, cookieOptions, CSRF_COOKIE, SESSION_COOKIE, validateCsrf } from "@/lib/auth/http";
import { hasAdminClaim, isRecentSignIn, SESSION_DURATION_SECONDS } from "@/lib/auth/policy";

export const runtime = "nodejs";

class RequestTooLarge extends Error {}

async function readToken(request: NextRequest) {
  const limit = 16_384;
  if (Number(request.headers.get("content-length")) > limit) throw new RequestTooLarge();
  if (!request.body) throw new Error();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestTooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const { idToken } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof idToken !== "string" || !idToken || idToken.length > 12_000) throw new Error();
  return idToken;
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return authJson({ error: "La demande a expiré. Veuillez réessayer." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return authJson({ error: "Format de demande invalide." }, 415);
  let idToken: string;
  try {
    idToken = await readToken(request);
  } catch (error) { return authJson({ error: "La demande de connexion est invalide." }, error instanceof RequestTooLarge ? 413 : 400); }
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    if (!isRecentSignIn(decoded.auth_time)) return authJson({ error: "Veuillez vous reconnecter pour ouvrir une session." }, 401);
    const user = await auth.getUser(decoded.uid);
    if (user.disabled || !hasAdminClaim(decoded) || !hasAdminClaim(user.customClaims)) {
      return authJson({ error: "Accès refusé. Ce compte ne dispose pas du rôle administrateur." }, 403);
    }
    const session = await auth.createSessionCookie(idToken, { expiresIn: SESSION_DURATION_SECONDS * 1000 });
    const response = authJson({ success: true });
    response.cookies.set(SESSION_COOKIE, session, { ...cookieOptions, maxAge: SESSION_DURATION_SECONDS });
    response.cookies.set(CSRF_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof FirebaseConfigurationError) return authJson({ error: "La connexion est indisponible. Vérifiez la configuration serveur." }, 503);
    const code = (error as { code?: string }).code ?? "";
    const invalid = ["auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"].includes(code);
    return authJson({ error: invalid ? "Votre connexion a expiré. Veuillez réessayer." : "Le service de connexion est momentanément indisponible." }, invalid ? 401 : 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return authJson({ error: "La demande a expiré. Veuillez réessayer." }, 403);
  // Déconnexion locale, même si Firebase est temporairement indisponible.
  const response = authJson({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(CSRF_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
