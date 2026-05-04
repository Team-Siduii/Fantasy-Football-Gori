import { NextResponse } from "next/server";
import { readManagerState, saveManagerState, type ManagerStateScope } from "@/lib/manager-state";
import { isAuthenticatedSession } from "@/lib/auth-session";

function getScopeFromRequest(request: Request): ManagerStateScope {
  const mode = new URL(request.url).searchParams.get("mode");
  return mode === "wk" ? "wk" : "eredivisie";
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const scope = getScopeFromRequest(request);
  return NextResponse.json({ state: readManagerState(scope) });
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

  const scope = getScopeFromRequest(request);

  const state = saveManagerState(
    {
      formation: body.formation,
      lineupIds: body.lineupIds,
      benchIds: body.benchIds,
      pickedTransferId: body.pickedTransferId === null ? null : body.pickedTransferId,
      pendingSellId: body.pendingSellId === null ? null : body.pendingSellId,
      pendingBuyId: body.pendingBuyId === null ? null : body.pendingBuyId,
    },
    scope,
  );

  return NextResponse.json({ ok: true, state });
}
