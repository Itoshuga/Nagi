import { contentMutation } from "@/lib/contents/api";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return contentMutation(request); }
