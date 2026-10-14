import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "./policy";

const production = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = production ? "__Host-nagi-session" : "nagi-session";
export const CSRF_COOKIE = production ? "__Host-nagi-csrf" : "nagi-csrf";
export const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict" as const, path: "/" };

export function authJson(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function validateCsrf(request: NextRequest) {
  let expected: string;
  try {
    const url = new URL(process.env.ADMIN_APP_ORIGIN || (!production ? request.url : ""));
    if (production && url.protocol !== "https:") return false;
    if (!production && !process.env.ADMIN_APP_ORIGIN && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
    expected = url.origin;
  } catch { return false; }
  if (!isSameOriginRequest(request.headers.get("origin"), expected, request.headers.get("sec-fetch-site"))) return false;
  const token = request.headers.get("x-csrf-token") ?? "";
  const cookie = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(cookie)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(cookie));
}
