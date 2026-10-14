import { contentMutation } from "@/lib/contents/api";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: NextRequest, { params }: Context) { return contentMutation(request, (await params).id); }
export async function POST(request: NextRequest, { params }: Context) { return contentMutation(request, (await params).id); }
export async function DELETE(request: NextRequest, { params }: Context) { return contentMutation(request, (await params).id); }
