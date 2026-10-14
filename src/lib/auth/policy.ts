export const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export function hasAdminClaim(claims: Record<string, unknown> | undefined) {
  return claims?.admin === true;
}

export function isRecentSignIn(authTime: number, now = Date.now() / 1000) {
  return Number.isFinite(authTime) && now - authTime >= -60 && now - authTime < 300;
}

export function isSameOriginRequest(origin: string | null, expectedOrigin: string, fetchSite: string | null) {
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin" || fetchSite === "none");
}
