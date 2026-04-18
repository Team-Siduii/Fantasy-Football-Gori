import { NextResponse } from "next/server";
import { readManagerState, saveManagerState } from "@/lib/manager-state";
import { isAuthenticatedSession } from "@/lib/auth-session";

export async function GET() {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  return NextResponse.json({ state: readManagerState() });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: {
    formation?: string;
    lineupIds?: string[];
    benchIds?: string[];
    pickedTransferId?: string | null;
    pendingSellId?: string | null;
    pendingBuyId?: string | null;
  } = {};

  try {
    body = (await request.json()) as {
      formation?: string;
      lineupIds?: string[];
      benchIds?: string[];
      pickedTransferId?: string | null;
      pendingSellId?: string | null;
      pendingBuyId?: string | null;
    };
  } catch {
    body = {};
  }

  const state = saveManagerState({
    formation: body.formation,
    lineupIds: body.lineupIds,
    benchIds: body.benchIds,
    pickedTransferId: body.pickedTransferId === null ? null : body.pickedTransferId,
    pendingSellId: body.pendingSellId === null ? null : body.pendingSellId,
    pendingBuyId: body.pendingBuyId === null ? null : body.pendingBuyId,
  });

  return NextResponse.json({ ok: true, state });
}
