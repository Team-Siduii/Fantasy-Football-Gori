import { NextResponse } from "next/server";
import {
  readManagerState,
  readManagerStateForRound,
  saveManagerState,
  saveManagerStateForRound,
  type ManagerStateScope,
} from "@/lib/manager-state";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { syncManagerTeamFromDraftRoster } from "@/lib/draft-manager-sync";

function getScopeFromRequest(request: Request): ManagerStateScope {
  const mode = new URL(request.url).searchParams.get("mode");
  return mode === "wk" ? "wk" : "eredivisie";
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const managerKey = await getAuthenticatedEmail();
  const scope = getScopeFromRequest(request);
  if (managerKey) {
    syncManagerTeamFromDraftRoster({ managerEmail: managerKey, scope });
  }
  const roundNumberParam = new URL(request.url).searchParams.get("roundNumber");
  const roundNumber = roundNumberParam ? Number(roundNumberParam) : null;

  if (roundNumber && Number.isInteger(roundNumber) && roundNumber > 0) {
    return NextResponse.json({ state: readManagerStateForRound(roundNumber, scope, managerKey) });
  }

  return NextResponse.json({ state: readManagerState(scope, managerKey) });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const managerKey = await getAuthenticatedEmail();

  let body: {
    formation?: string;
    lineupIds?: string[];
    benchIds?: string[];
    pickedTransferId?: string | null;
    pendingSellId?: string | null;
    pendingBuyId?: string | null;
    roundNumber?: number;
    propagateToFutureRounds?: boolean;
  } = {};

  try {
    body = (await request.json()) as {
      formation?: string;
      lineupIds?: string[];
      benchIds?: string[];
      pickedTransferId?: string | null;
      pendingSellId?: string | null;
      pendingBuyId?: string | null;
      roundNumber?: number;
      propagateToFutureRounds?: boolean;
    };
  } catch {
    body = {};
  }

  const scope = getScopeFromRequest(request);

  const partialState = {
    formation: body.formation,
    lineupIds: body.lineupIds,
    benchIds: body.benchIds,
    pickedTransferId: body.pickedTransferId === null ? null : body.pickedTransferId,
    pendingSellId: body.pendingSellId === null ? null : body.pendingSellId,
    pendingBuyId: body.pendingBuyId === null ? null : body.pendingBuyId,
  };

  const hasRoundNumber = Number.isInteger(body.roundNumber) && (body.roundNumber as number) > 0;

  const state = hasRoundNumber
    ? saveManagerStateForRound(
        body.roundNumber as number,
        partialState,
        scope,
        body.propagateToFutureRounds !== false,
        managerKey,
      )
    : saveManagerState(partialState, scope, managerKey);

  return NextResponse.json({ ok: true, state });
}
