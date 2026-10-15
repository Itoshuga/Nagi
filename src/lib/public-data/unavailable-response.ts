import "server-only";
import { NextResponse } from "next/server";

// Une réécriture vers une page Next conserve son statut 200 dans cette version.
// Répondre avant le streaming garantit le 503, même si Firestore est hors service.
export function unavailableResponse() {
  return new NextResponse(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Le carnet est indisponible — Nagi</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#2e322d;font-family:Arial,sans-serif}a{color:inherit}header,main{width:min(1200px,90%);margin:auto}header{padding:32px 0;border-bottom:1px solid #d8d9d0}header a{font-family:Georgia,serif;font-size:40px;letter-spacing:-3px;text-decoration:none}main{padding:100px 0}h1{font:400 clamp(48px,8vw,90px)/1 Georgia,serif;letter-spacing:-3px;margin:28px 0}h1 em{font-weight:400}p{max-width:490px;line-height:1.8}small{font-size:11px;letter-spacing:2px;text-transform:uppercase}nav{display:flex;gap:28px;margin-top:32px}nav a{text-underline-offset:6px}@media(max-width:600px){main{padding-top:65px}nav{flex-direction:column;gap:20px}}
</style></head><body><header><a href="/" aria-label="Nagi, accueil">nagi.</a></header><main id="contenu"><small>Le carnet · Une courte pause</small><h1>Le voyage reprend<br><em>dans un instant.</em></h1><p>Les destinations et les découvertes sont momentanément indisponibles. Réessayez dans un instant.</p><nav aria-label="Reprendre le voyage"><a href="">Réessayer</a><a href="/">Revenir à l’accueil</a></nav></main></body></html>`, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30", "X-Content-Type-Options": "nosniff" } });
}
