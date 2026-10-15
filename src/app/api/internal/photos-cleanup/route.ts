import { timingSafeEqual } from "node:crypto";
import { authJson } from "@/lib/auth/http";
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase/admin";
import { cleanupPhotos } from "@/lib/photos/cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return authJson({ error: "Le nettoyage planifié n’est pas configuré." }, 503);
  const expected = Buffer.from(`Bearer ${secret}`); const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return authJson({ error: "Accès refusé." }, 401);
  try {
    const result = await cleanupPhotos(getAdminFirestore(), getAdminStorage(), true, new Date().toISOString(), 20);
    return authJson({ processed: result.length, retry: result.filter((item) => item.action === "retry").length }, result.some((item) => item.action === "retry") ? 503 : 200);
  } catch { return authJson({ error: "Le nettoyage doit être relancé." }, 503); }
}
