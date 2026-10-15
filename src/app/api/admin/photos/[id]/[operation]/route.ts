import type { NextRequest } from "next/server";
import { photoMutation } from "@/lib/photos/http";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string; operation: string }> };
export async function POST(request: NextRequest, context: Context) { const { id, operation } = await context.params; return photoMutation(request, id, operation); }
export async function PUT(request: NextRequest, context: Context) { const { id, operation } = await context.params; return photoMutation(request, id, operation); }
