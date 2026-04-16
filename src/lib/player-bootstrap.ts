import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { listPlayers, replacePlayers } from "@/lib/player-store";

let hasAttemptedBootstrap = false;

export async function bootstrapPlayersFromDefaultCsv(): Promise<void> {
  if (hasAttemptedBootstrap || listPlayers().length > 0) {
    return;
  }

  hasAttemptedBootstrap = true;

  const configuredPath = process.env.PLAYER_CSV_PATH;
  const defaultPath = path.join(process.cwd(), "data", "players.csv");
  const sourcePath = configuredPath && configuredPath.trim().length > 0 ? configuredPath : defaultPath;

  try {
    const csvContent = await readFile(sourcePath, "utf-8");
    const { players } = parsePlayerCsv(csvContent);

    if (players.length > 0) {
      replacePlayers(players);
    }
  } catch {
    // Silent fallback: app blijft werken zonder preloaded data.
  }
}
