import { contentSearch } from "@/lib/contents/api";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return contentSearch(request); }
