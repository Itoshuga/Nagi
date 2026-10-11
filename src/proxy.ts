import { NextResponse, type NextRequest } from "next/server";
import { isKnownGeographicRoute } from "./lib/geographic-routing";

export function proxy(request: NextRequest) {
  if (!isKnownGeographicRoute(request.nextUrl.pathname)) {
    // Les routes géographiques sont rendues à la requête pour les onglets.
    // Servir la 404 statique évite le document d’erreur vide de Next 16.4
    // lors d’un notFound() sur ces routes, tout en conservant l’URL demandée.
    return NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/destinations/:country/:city/:path*" };
