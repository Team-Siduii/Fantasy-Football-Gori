import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";
import type { TransferRoundState } from "../domain/transfer-round";
import type { ManagerStateScope } from "./manager-state";

export type TransferRoundStateScope = ManagerStateScope;
export type TransferRoundCollection = {
  rounds: Record<string, TransferRoundState>;
};

const DEFAULT_TRANSFER_ROUND_COLLECTION: TransferRoundCollection = { rounds: {} };

export function resolveTransferRoundStatePath(scope: TransferRoundStateScope = "eredivisie") {
  if (scope === "wk" && process.env.TRANSFER_ROUND_STATE_WK_PATH) {
    return process.env.TRANSFER_ROUND_STATE_WK_PATH;
  }
  if (scope === "eredivisie" && process.env.TRANSFER_ROUND_STATE_PATH) {
    return process.env.TRANSFER_ROUND_STATE_PATH;
  }
  if (process.env.VERCEL) {
    return scope === "wk" ? "/tmp/transfer-round-state-wk.json" : "/tmp/transfer-round-state.json";
  }
  return path.join(process.cwd(), "data", scope === "wk" ? "transfer-round-state-wk.json" : "transfer-round-state.json");
}

function normalizeRoundState(raw: Partial<TransferRoundState>, roundNumber: number): TransferRoundState | null {
  if (!Array.isArray(raw.entries)) {
    return null;
  }
  return {
    roundNumber,
    phase: raw.phase === "BUY" || raw.phase === "AWAITING_RETRY" || raw.phase === "COMPLETED" ? raw.phase : "SELL",
    conflicts: Array.isArray(raw.conflicts)
      ? raw.conflicts
          .map((conflict) => ({
            playerId: typeof conflict?.playerId === "string" ? conflict.playerId : "",
            candidateManagerIds: Array.isArray(conflict?.candidateManagerIds)
              ? conflict.candidateManagerIds.filter((value): value is string => typeof value === "string")
              : [],
            winnerManagerId: typeof conflict?.winnerManagerId === "string" ? conflict.winnerManagerId : "",
            loserManagerIds: Array.isArray(conflict?.loserManagerIds)
              ? conflict.loserManagerIds.filter((value): value is string => typeof value === "string")
              : [],
          }))
          .filter((conflict) => conflict.playerId && conflict.winnerManagerId)
      : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    entries: raw.entries.map((entry) => ({
      managerId: typeof entry?.managerId === "string" ? entry.managerId : "",
      email: typeof entry?.email === "string" ? entry.email : "",
      displayName: typeof entry?.displayName === "string" ? entry.displayName : "Manager",
      teamName: typeof entry?.teamName === "string" ? entry.teamName : "Team",
      subpoule: typeof entry?.subpoule === "string" ? entry.subpoule : "A",
      rankingPosition: typeof entry?.rankingPosition === "number" && entry.rankingPosition > 0 ? entry.rankingPosition : 999,
      sellStatus: entry?.sellStatus === "SKIPPED" || entry?.sellStatus === "SUBMITTED" ? entry.sellStatus : "PENDING",
      sellPlayerId: typeof entry?.sellPlayerId === "string" ? entry.sellPlayerId : null,
      autoSellPlayerIds: Array.isArray(entry?.autoSellPlayerIds)
        ? entry.autoSellPlayerIds.filter((id): id is string => typeof id === "string")
        : [],
      buyStatus:
        entry?.buyStatus === "PENDING" || entry?.buyStatus === "SUBMITTED" || entry?.buyStatus === "COMPLETED" || entry?.buyStatus === "RETRY_REQUIRED"
          ? entry.buyStatus
          : "LOCKED",
      buyPlayerIds: Array.isArray(entry?.buyPlayerIds)
        ? entry.buyPlayerIds.filter((id): id is string => typeof id === "string")
        : [
            (entry as { buyPlayerId?: unknown })?.buyPlayerId,
            (entry as { extraBuyPlayerId?: unknown })?.extraBuyPlayerId,
          ].filter((id): id is string => typeof id === "string" && id.length > 0),
      resolvedTransfers: Array.isArray(entry?.resolvedTransfers)
        ? entry.resolvedTransfers
            .filter(
              (transfer): transfer is { soldPlayerId: string; boughtPlayerId: string } =>
                typeof transfer?.soldPlayerId === "string" && typeof transfer?.boughtPlayerId === "string",
            )
            .map((transfer) => ({ soldPlayerId: transfer.soldPlayerId, boughtPlayerId: transfer.boughtPlayerId }))
        : [
            (entry as { resolvedTransfer?: unknown })?.resolvedTransfer,
            (entry as { extraResolvedTransfer?: unknown })?.extraResolvedTransfer,
          ]
            .filter(
              (transfer): transfer is { soldPlayerId: string; boughtPlayerId: string } =>
                typeof transfer === "object" &&
                transfer !== null &&
                typeof (transfer as { soldPlayerId?: unknown }).soldPlayerId === "string" &&
                typeof (transfer as { boughtPlayerId?: unknown }).boughtPlayerId === "string",
            )
            .map((transfer) => ({
              soldPlayerId: transfer.soldPlayerId,
              boughtPlayerId: transfer.boughtPlayerId,
            })),
      updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : null,
    })),
  };
}

function normalizeCollection(input: unknown): TransferRoundCollection {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_TRANSFER_ROUND_COLLECTION };
  }
  const rawRounds = (input as Partial<TransferRoundCollection>).rounds;
  const rounds: Record<string, TransferRoundState> = {};
  if (rawRounds && typeof rawRounds === "object") {
    for (const [roundKey, raw] of Object.entries(rawRounds)) {
      const roundNumber = Number(roundKey);
      if (!Number.isInteger(roundNumber) || roundNumber <= 0 || !raw || typeof raw !== "object") {
        continue;
      }
      const normalized = normalizeRoundState(raw as Partial<TransferRoundState>, roundNumber);
      if (normalized) {
        rounds[String(roundNumber)] = normalized;
      }
    }
  }
  return { rounds };
}

function saveCollection(next: TransferRoundCollection, scope: TransferRoundStateScope = "eredivisie") {
  const target = resolveTransferRoundStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function readTransferRoundCollection(scope: TransferRoundStateScope = "eredivisie") {
  const target = resolveTransferRoundStatePath(scope);
  if (!existsSync(target)) {
    return { ...DEFAULT_TRANSFER_ROUND_COLLECTION };
  }
  try {
    return normalizeCollection(JSON.parse(readFileSync(target, "utf-8")));
  } catch {
    return { ...DEFAULT_TRANSFER_ROUND_COLLECTION };
  }
}

export async function readTransferRoundCollectionPersistent(scope: TransferRoundStateScope = "eredivisie") {
  const fallback = readTransferRoundCollection(scope);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }
  const persisted = await readPersistentJson({ store: "transfer-round-state", scope }, fallback);
  const normalized = normalizeCollection(persisted);
  saveCollection(normalized, scope);
  return normalized;
}

export async function saveTransferRoundCollectionPersistent(next: TransferRoundCollection, scope: TransferRoundStateScope = "eredivisie") {
  saveCollection(next, scope);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "transfer-round-state", scope }, next);
  }
  return next;
}

export async function readTransferRoundPersistent(roundNumber: number, scope: TransferRoundStateScope = "eredivisie") {
  const collection = await readTransferRoundCollectionPersistent(scope);
  return collection.rounds[String(roundNumber)] ?? null;
}

export async function saveTransferRoundPersistent(roundState: TransferRoundState, scope: TransferRoundStateScope = "eredivisie") {
  const collection = await readTransferRoundCollectionPersistent(scope);
  const next = {
    rounds: {
      ...collection.rounds,
      [String(roundState.roundNumber)]: roundState,
    },
  };
  await saveTransferRoundCollectionPersistent(next, scope);
  return roundState;
}
