import "server-only";

import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";

export type PlayerPointsEntry = {
  fantasyplayerId: number | null;
  playerName: string;
  roundPoints: number;
  totalPoints: number;
  teamName: string | null;
  teamCode: string | null;
  position: string | null;
  syncedAt: string;
};

export type PlayerPointsSnapshot = {
  roundSequence: number;
  players: PlayerPointsEntry[];
  syncedAt: string;
};

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export async function savePlayerPoints(
  scope: "eredivisie" | "wk",
  snapshot: PlayerPointsSnapshot,
): Promise<PlayerPointsSnapshot> {
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson(
      { store: "player-points", scope },
      snapshot,
    );
  }

  // Also save as JSON file for local dev fallback
  const fs = await import("fs/promises");
  const path = await import("path");
  const filePath = path.join(
    process.cwd(),
    "data",
    `player-points-${scope}.json`,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");

  return snapshot;
}

export async function loadPlayerPoints(
  scope: "eredivisie" | "wk",
): Promise<PlayerPointsSnapshot | null> {
  if (isGoriDatabaseEnabled()) {
    const stored = await readPersistentJson<PlayerPointsSnapshot | null>(
      { store: "player-points", scope },
      null,
    );
    if (stored && stored.players && stored.players.length > 0) {
      return stored;
    }
  }

  // Fallback to JSON file
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(
      process.cwd(),
      "data",
      `player-points-${scope}.json`,
    );
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as PlayerPointsSnapshot;
    if (parsed.players && parsed.players.length > 0) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is invalid — that's fine
  }

  return null;
}

export async function getPlayerPointsByName(
  scope: "eredivisie" | "wk",
  playerName: string,
): Promise<PlayerPointsEntry | null> {
  const snapshot = await loadPlayerPoints(scope);
  if (!snapshot) return null;

  const key = normalizePlayerName(playerName);
  return snapshot.players.find(
    (p) => normalizePlayerName(p.playerName) === key,
  ) ?? null;
}

export async function getPlayerPointsMap(
  scope: "eredivisie" | "wk",
): Promise<Map<string, PlayerPointsEntry>> {
  const snapshot = await loadPlayerPoints(scope);
  const map = new Map<string, PlayerPointsEntry>();

  if (!snapshot) return map;

  for (const player of snapshot.players) {
    map.set(normalizePlayerName(player.playerName), player);
  }

  return map;
}
