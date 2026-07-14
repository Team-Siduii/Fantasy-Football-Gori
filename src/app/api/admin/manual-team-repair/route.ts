import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { isAuthenticatedSession } from "@/lib/auth-session";
import { ensureAuthStateFromDb, isAdminEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import {
  readManagerStatePersistent,
  saveManagerStatePersistent,
  saveManagerStateForRoundPersistent,
  type ManagerStateScope,
} from "@/lib/manager-state";
import { resolveCanonicalManagerId } from "@/lib/manager-identity";
import { setTeamRosterForManagerPersistent } from "@/lib/team-roster-state";
import { readTransferRoundPersistent, saveTransferRoundPersistent } from "@/lib/transfer-round-state";

type PlayerCatalogEntry = {
  id: string;
  positie: string;
};

type DraftPosition = "GK" | "DEF" | "MID" | "FWD";

const LINEUP_SIZE = 11;
const SQUAD_SIZE = 15;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getScopeFromMode(mode: unknown): ManagerStateScope {
  return mode === "wk" ? "wk" : "eredivisie";
}

function normalizeDraftPosition(position: string): DraftPosition | null {
  const normalized = position.trim().toUpperCase();
  if (["GK", "KEEPER", "GOALKEEPER", "DOELMAN"].includes(normalized)) return "GK";
  if (["DEF", "VERDEDIGER", "DEFENDER"].includes(normalized)) return "DEF";
  if (["MID", "MIDDENVELDER", "MIDFIELDER"].includes(normalized)) return "MID";
  if (["FWD", "AANVALLER", "FORWARD", "ATTACKER"].includes(normalized)) return "FWD";
  return null;
}

async function loadPlayers(scope: ManagerStateScope): Promise<PlayerCatalogEntry[]> {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    const csvContent = await readFile(wkCsvPath, "utf-8");
    return parsePlayerCsv(csvContent).players.map((player) => ({ id: player.id, positie: player.positie }));
  }

  const { bootstrapPlayersFromDefaultCsv } = await import("@/lib/player-bootstrap");
  const { listPlayers } = await import("@/lib/player-store");
  await bootstrapPlayersFromDefaultCsv();
  return listPlayers().map((player) => ({ id: player.id, positie: player.positie }));
}

function buildAutoFormationTeamState(playerIds: string[], playerCatalog: PlayerCatalogEntry[]) {
  const playersById = new Map(playerCatalog.map((player) => [player.id, player]));
  const uniquePlayerIds = Array.from(new Set(playerIds.filter((id) => typeof id === "string" && id.trim().length > 0))).slice(0, SQUAD_SIZE);
  const idsByPosition: Record<DraftPosition, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  const unknownIds: string[] = [];

  for (const playerId of uniquePlayerIds) {
    const position = normalizeDraftPosition(playersById.get(playerId)?.positie ?? "");
    if (position) {
      idsByPosition[position].push(playerId);
    } else {
      unknownIds.push(playerId);
    }
  }

  const options = getFormationOptions();
  let bestFormation = options[0] ?? "4-3-3";
  let bestLineupCount = -1;

  for (const formation of options) {
    const slotCounts: Record<DraftPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const row of buildFormationSlots(formation)) {
      for (const slot of row) {
        slotCounts[slot] += 1;
      }
    }
    const lineupCount = (Object.keys(slotCounts) as DraftPosition[]).reduce(
      (sum, position) => sum + Math.min(slotCounts[position], idsByPosition[position].length),
      0,
    );
    if (lineupCount > bestLineupCount) {
      bestFormation = formation;
      bestLineupCount = lineupCount;
    }
  }

  const used = new Set<string>();
  const lineupIds: string[] = [];
  for (const position of buildFormationSlots(bestFormation).flat()) {
    const next = idsByPosition[position].find((id) => !used.has(id));
    if (next) {
      used.add(next);
      lineupIds.push(next);
    }
  }

  for (const playerId of unknownIds) {
    if (lineupIds.length >= LINEUP_SIZE) break;
    used.add(playerId);
    lineupIds.push(playerId);
  }

  const benchIds = uniquePlayerIds.filter((id) => !used.has(id)).slice(0, SQUAD_SIZE - lineupIds.length);
  return { formation: bestFormation, lineupIds, benchIds };
}

export async function POST(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

  const actorEmail = await getAuthenticatedEmail();
  if (!actorEmail || !isAdminEmail(actorEmail)) {
    return NextResponse.json({ error: "Alleen admins kunnen handmatige teamreparaties uitvoeren" }, { status: 403 });
  }

  let body: {
    mode?: string;
    managerEmail?: string;
    roundNumber?: number;
    rosterAddIds?: string[];
    rosterRemoveIds?: string[];
    lineupIds?: string[];
    benchIds?: string[];
    formation?: string;
    transferOverride?: { soldPlayerId?: string; boughtPlayerId?: string };
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ongeldige request body" }, { status: 400 });
  }

  const scope = getScopeFromMode(body.mode);
  const managerEmail = normalizeEmail(body.managerEmail ?? "");
  const roundNumber = Number.isInteger(body.roundNumber) && (body.roundNumber as number) > 0 ? (body.roundNumber as number) : null;
  const addIds = Array.isArray(body.rosterAddIds) ? body.rosterAddIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const removeIds = Array.isArray(body.rosterRemoveIds) ? body.rosterRemoveIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const requestedLineupIds = Array.isArray(body.lineupIds)
    ? body.lineupIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : null;
  const requestedBenchIds = Array.isArray(body.benchIds)
    ? body.benchIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : null;

  if (!managerEmail) {
    return NextResponse.json({ error: "managerEmail is verplicht" }, { status: 400 });
  }
  if (!roundNumber) {
    return NextResponse.json({ error: "roundNumber is verplicht" }, { status: 400 });
  }

  const current = await readManagerStatePersistent(scope, managerEmail);
  const currentIds = [...current.lineupIds, ...current.benchIds];
  const nextRosterIds = Array.from(new Set(currentIds.filter((id) => !removeIds.includes(id)).concat(addIds)));
  if (nextRosterIds.length === 0 || nextRosterIds.length > SQUAD_SIZE) {
    return NextResponse.json({ error: `Ongeldige rostergrootte na repair: ${nextRosterIds.length}` }, { status: 400 });
  }

  const playerCatalog = await loadPlayers(scope);
  const rebuilt =
    requestedLineupIds && requestedBenchIds
      ? {
          formation: body.formation && getFormationOptions().includes(body.formation) ? body.formation : current.formation,
          lineupIds: Array.from(new Set(requestedLineupIds)),
          benchIds: Array.from(new Set(requestedBenchIds)),
        }
      : buildAutoFormationTeamState(nextRosterIds, playerCatalog);

  const combinedRequestedIds = [...rebuilt.lineupIds, ...rebuilt.benchIds];
  const combinedSet = new Set(combinedRequestedIds);
  if (combinedRequestedIds.length !== combinedSet.size) {
    return NextResponse.json({ error: "Line-up en bank bevatten dubbele speler-ids" }, { status: 400 });
  }
  if (combinedRequestedIds.length !== nextRosterIds.length) {
    return NextResponse.json({ error: "Line-up en bank dekken niet exact dezelfde roster-ids af" }, { status: 400 });
  }
  if (nextRosterIds.some((id) => !combinedSet.has(id))) {
    return NextResponse.json({ error: "Line-up en bank missen één of meer roster-ids" }, { status: 400 });
  }

  await saveManagerStatePersistent(
    {
      formation: rebuilt.formation,
      lineupIds: rebuilt.lineupIds,
      benchIds: rebuilt.benchIds,
      pendingSellId: null,
      pendingBuyId: null,
      pickedTransferId: null,
    },
    scope,
    managerEmail,
  );

  await saveManagerStateForRoundPersistent(
    roundNumber,
    {
      formation: rebuilt.formation,
      lineupIds: rebuilt.lineupIds,
      benchIds: rebuilt.benchIds,
      pendingSellId: null,
      pendingBuyId: null,
      pickedTransferId: null,
    },
    scope,
    true,
    managerEmail,
  );

  const canonicalManagerId = resolveCanonicalManagerId(scope, managerEmail) ?? managerEmail;
  await setTeamRosterForManagerPersistent(canonicalManagerId, nextRosterIds, scope);
  const rosterKey = canonicalManagerId;

  const transferRound = await readTransferRoundPersistent(roundNumber, scope);
  if (!transferRound) {
    return NextResponse.json({ error: "Transfer-round state niet gevonden" }, { status: 404 });
  }

  const overrideSold = body.transferOverride?.soldPlayerId;
  const overrideBought = body.transferOverride?.boughtPlayerId;
  const nextTransferRound = {
    ...transferRound,
    entries: transferRound.entries.map((entry) => {
      if (normalizeEmail(entry.email) !== managerEmail) {
        return entry;
      }
      return {
        ...entry,
        sellStatus: overrideSold ? "SUBMITTED" : entry.sellStatus,
        sellPlayerId: overrideSold ?? entry.sellPlayerId,
        buyStatus: overrideBought ? "COMPLETED" : entry.buyStatus,
        buyPlayerIds: overrideBought ? [] : entry.buyPlayerIds,
        resolvedTransfers:
          overrideSold && overrideBought
            ? [
                {
                soldPlayerId: overrideSold,
                boughtPlayerId: overrideBought,
                },
              ]
            : entry.resolvedTransfers,
        updatedAt: new Date().toISOString(),
      };
    }),
    updatedAt: new Date().toISOString(),
  };
  await saveTransferRoundPersistent(nextTransferRound, scope);

  const verified = await readManagerStatePersistent(scope, managerEmail);
  return NextResponse.json({
    ok: true,
    managerEmail,
    roundNumber,
    rosterKey,
    lineupIds: verified.lineupIds,
    benchIds: verified.benchIds,
    squadCount: verified.lineupIds.length + verified.benchIds.length,
  });
}