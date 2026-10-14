import type { NextRequest } from "next/server";
import { geographyMutation } from "@/lib/geography/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ kind: string; id: string }> };
export async function PUT(request: NextRequest, { params }: Context) { return geographyMutation(request, await params); }
export async function POST(request: NextRequest, { params }: Context) { return geographyMutation(request, await params); }
export async function DELETE(request: NextRequest, { params }: Context) { return geographyMutation(request, await params); }
