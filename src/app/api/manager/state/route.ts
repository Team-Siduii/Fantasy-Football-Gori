import { NextResponse } from "next/server";
import {
  readManagerStateForRoundPersistent,
  readManagerStatePersistent,
  saveManagerStateForRoundPersistent,
  saveManagerStatePersistent,
  type ManagerStateScope,
} from "@/lib/manager-state";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { repairManagerTeamFromDraftArtifactsPersistent } from "@/lib/draft-manager-sync";

function getScopeFromRequest(request: Request): ManagerStateScope {
  const mode = new URL(request.url).searchParams.get("mode");
  return mode === "wk" ? "wk" : "eredivisie";
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    console.log("[STATE-API] Unauthenticated");
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const managerKey = await getAuthenticatedEmail();
  const scope = getScopeFromRequest(request);
  console.log("[STATE-API]", managerKey, "scope:", scope);
  
  if (managerKey) {
    try {
      const repairResult = await repairManagerTeamFromDraftArtifactsPersistent({ managerEmail: managerKey, scope });
      console.log("[STATE-API] Repair result:", repairResult ? `ok (${repairResult.state?.lineupIds?.length || 0}+${repairResult.state?.benchIds?.length || 0})` : "null");
    } catch (e: unknown) {
      console.error("[STATE-API] Repair error:", String(e));
    }
  }
  const roundNumberParam = new URL(request.url).searchParams.get("roundNumber");
  const roundNumber = roundNumberParam ? Number(roundNumberParam) : null;

  if (roundNumber && Number.isInteger(roundNumber) && roundNumber > 0) {
    const state = await readManagerStateForRoundPersistent(roundNumber, scope, managerKey);
    console.log("[STATE-API] Round", roundNumber, "lineup:", state.lineupIds?.length, "bench:", state.benchIds?.length);
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
  }

  const state = await readManagerStatePersistent(scope, managerKey);
  console.log("[STATE-API] Final lineup:", state.lineupIds?.length, "bench:", state.benchIds?.length);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
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
    ? await saveManagerStateForRoundPersistent(
        body.roundNumber as number,
        partialState,
        scope,
        body.propagateToFutureRounds !== false,
        managerKey,
      )
    : await saveManagerStatePersistent(partialState, scope, managerKey);

  return NextResponse.json({ ok: true, state });
}
