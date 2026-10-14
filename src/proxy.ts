import { getDiscoveryBySlug, visibleDiscoveryCatalogue } from "./lib/discoveries";
import { NextResponse, type NextRequest } from "next/server";
import { loadPublicGeography } from "./lib/geography/public";
import { isKnownGeographicRoute } from "./lib/geographic-routing";

export async function proxy(request: NextRequest) {
  let known: boolean;
  try {
    const geography = await loadPublicGeography();
    if (request.nextUrl.pathname.startsWith("/decouvertes")) {
      const parts = request.nextUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      known = parts.length === 3 && Boolean(getDiscoveryBySlug(parts[1], parts[2], visibleDiscoveryCatalogue(geography)));
    } else known = isKnownGeographicRoute(request.nextUrl.pathname, geography);
  }
  catch { return new NextResponse("Le carnet est momentanément indisponible. Réessayez dans un instant.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!known) {
    // Les routes géographiques sont rendues à la requête pour les onglets.
    // Servir la 404 statique évite le document d’erreur vide de Next 16.4
    // lors d’un notFound() sur ces routes, tout en conservant l’URL demandée.
    return NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/destinations/:path*", "/decouvertes/:path*"] };
