import { randomBytes } from "node:crypto";
import { authJson, cookieOptions, CSRF_COOKIE } from "@/lib/auth/http";

export const runtime = "nodejs";

export async function GET() {
  const csrfToken = randomBytes(32).toString("hex");
  const response = authJson({ csrfToken });
  response.cookies.set(CSRF_COOKIE, csrfToken, { ...cookieOptions, maxAge: 1800 });
  return response;
}
