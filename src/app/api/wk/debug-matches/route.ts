import { NextResponse } from "next/server";
import { fetchWkcoachMatches } from "@/lib/data-sources/wkcoach";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const round = Number(url.searchParams.get("round") || "1");

  const email = process.env.WKCOACH_EMAIL;
  const password = process.env.WKCOACH_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "No creds" }, { status: 500 });
  }

  const matches = await fetchWkcoachMatches({ email, password, roundSequence: round });

  return NextResponse.json({
    count: matches.length,
    sample: matches.slice(0, 3),
    raw: matches,
  });
}
