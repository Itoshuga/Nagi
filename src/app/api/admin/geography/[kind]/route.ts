import type { NextRequest } from "next/server";
import { geographyMutation } from "@/lib/geography/api";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) { return geographyMutation(request, await params); }
