import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/session";
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase/admin";
import { assetReference, parseAsset } from "@/lib/photos/assets";
import { canReadPublicPhoto } from "@/lib/photos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  try {
    const { id, variant } = await params;
    if (!z.uuid().safeParse(id).success || !["display", "thumbnail"].includes(variant)) return new NextResponse(null, { status: 404, headers });
    const db = getAdminFirestore(); const snapshot = await assetReference(db, id).get();
    if (!snapshot.exists) return new NextResponse(null, { status: 404, headers });
    const asset = parseAsset(snapshot.data());
    if (!asset.photo || !["ready", "attached"].includes(asset.state)) return new NextResponse(null, { status: 404, headers });
    const session = await getAdminSession();
    const admin = session.status === "authorized" && (asset.state === "attached" || asset.owner === session.user.uid && asset.expiresAt > new Date().toISOString());
    if (!admin && !await canReadPublicPhoto(db, asset)) return new NextResponse(null, { status: 404, headers });
    const [bytes] = await getAdminStorage().bucket().file(`${asset.prefix}${variant}.webp`).download();
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
  } catch { return new NextResponse(null, { status: 503, headers }); }
}
