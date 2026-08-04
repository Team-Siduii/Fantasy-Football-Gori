import { NextResponse } from "next/server";
import {
  readManagerStateForRoundPersistent,
  readManagerStatePersistent,
  saveManagerStateForRoundPersistent,
  saveManagerStatePersistent,
  type ManagerStateScope,
} from "@/lib/manager-state";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { ensureAuthStateFromDb } from "@/lib/auth-store";
import { repairManagerTeamFromDraftArtifactsPersistent } from "@/lib/draft-manager-sync";
import { isRoundActive } from "@/lib/world-cup-schedule";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function getScopeFromRequest(request: Request): ManagerStateScope {
  const mode = new URL(request.url).searchParams.get("mode");
  return mode === "wk" ? "wk" : "eredivisie";
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    console.log("[STATE-API] Unauthenticated");
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

  const managerKey = await getAuthenticatedEmail();
  if (!managerKey) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const scope = getScopeFromRequest(request);
  if (scope === "wk") {
    await repairManagerTeamFromDraftArtifactsPersistent({ managerEmail: managerKey, scope });
  }
  console.log("[STATE-API]", managerKey, "scope:", scope);
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

  await ensureAuthStateFromDb();

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

  // Blokkeer lineage/bank-wijzigingen tijdens een actieve speelronde
  const hasRoundNumber = Number.isInteger(body.roundNumber) && (body.roundNumber as number) > 0;
  if (hasRoundNumber && isRoundActive(body.roundNumber as number)) {
    return NextResponse.json(
      { error: "Opstellen is gesloten — de speelronde is bezig" },
      { status: 423, headers: NO_CACHE_HEADERS },
    );
  }

  const partialState = {
    formation: body.formation,
    lineupIds: body.lineupIds,
    benchIds: body.benchIds,
    pickedTransferId: body.pickedTransferId === null ? null : body.pickedTransferId,
    pendingSellId: body.pendingSellId === null ? null : body.pendingSellId,
    pendingBuyId: body.pendingBuyId === null ? null : body.pendingBuyId,
  };

  // hasRoundNumber al bepaald in de lock-check hierboven
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
