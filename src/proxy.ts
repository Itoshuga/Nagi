import { loadPublicContent } from "./lib/contents/public";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminFirestore } from "./lib/firebase/admin";
import { routeDocuments } from "./lib/geography/repository";
import { publicGeographyFromDocuments } from "./lib/geography/presentation";
import { isKnownGeographicRoute } from "./lib/geographic-routing";
import { unavailableResponse } from "./lib/public-data/unavailable-response";
import { publicRead } from "./lib/public-data/errors";

export async function proxy(request: NextRequest) {
  let parts: string[];
  try { parts = request.nextUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent); }
  catch { return NextResponse.rewrite(new URL("/404", request.url), { status: 404 }); }
  // Le répertoire n’a pas d’identité à résoudre : sa page gère vide/indisponible.
  if (parts.length === 1 && parts[0] === "destinations") return NextResponse.next();
  let known: boolean;
  try {
    if (parts[0] === "decouvertes") known = parts.length === 3 && Boolean(await loadPublicContent(parts[1], parts[2]));
    else known = await publicRead("geography.route-status", async () => {
      const data = await routeDocuments(getAdminFirestore(), parts[1] ?? "", parts[2], parts[3] === "explorer" ? undefined : parts[3]);
      return isKnownGeographicRoute(request.nextUrl.pathname, publicGeographyFromDocuments(data));
    });
  } catch {
    return unavailableResponse();
  }
  // Garantir le statut HTTP même avec le rendu streaming de Next 16.4.
  if (!known) return NextResponse.rewrite(new URL("/404", request.url), { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.next();
}
export const config = { matcher: ["/destinations/:path*", "/decouvertes/:path*"] };
