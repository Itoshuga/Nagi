import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FirebaseConfigurationError, getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE } from "./http";
import { hasAdminClaim } from "./policy";

export type AdminSession =
  | { status: "authorized"; user: { uid: string; email: string; name: string | null } }
  | { status: "anonymous" | "denied" | "unavailable" };

export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return { status: "anonymous" };
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(session, true);
    // Vérifier aussi le rôle actuel : sa suppression prend effet immédiatement.
    const user = await auth.getUser(decoded.uid);
    if (user.disabled || !hasAdminClaim(decoded) || !hasAdminClaim(user.customClaims)) return { status: "denied" };
    return { status: "authorized", user: { uid: user.uid, email: user.email ?? "Administrateur", name: user.displayName ?? null } };
  } catch (error) {
    if (error instanceof FirebaseConfigurationError) return { status: "unavailable" };
    const code = (error as { code?: string }).code;
    if (["auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/invalid-session-cookie", "auth/argument-error", "auth/user-disabled", "auth/user-not-found"].includes(code ?? "")) {
      return { status: "anonymous" };
    }
    return { status: "unavailable" };
  }
});

// À appeler dans CHAQUE page protégée et chaque futur accès sensible aux données.
export async function requireAdmin() {
  const session = await getAdminSession();
  if (session.status !== "authorized") {
    const reason = session.status === "denied" ? "forbidden" : session.status === "unavailable" ? "unavailable" : "session";
    redirect(`/admin/login?reason=${reason}`);
  }
  return session.user;
}
