import { NextResponse } from "next/server";
import { normalizeManagerKey } from "@/lib/manager-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") || "unknown";
  const scope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  
  const key = normalizeManagerKey(scope, email);
  
  return NextResponse.json({ email, scope, resolvedKey: key });
}
