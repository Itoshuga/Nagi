import type { NextRequest } from "next/server";
import { photoMutation } from "@/lib/photos/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return photoMutation(request); }
