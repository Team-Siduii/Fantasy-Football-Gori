import { NextResponse } from "next/server";
import { fetchWkcoachAllPlayers } from "@/lib/data-sources/wkcoach";
import { loadPlayerPoints, type PlayerPointsEntry } from "@/lib/player-points-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * GET /api/wk/players?round=1
 *
 * Returns the full WK player pool from WKCoach (1248 players) merged with
 * the latest stored points snapshot. Falls back to the local CSV if
 * WKCoach is unreachable.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const roundSequence = roundParam ? Number(roundParam) : 1;

    // 1. Try live WKCoach fetch
    const email = process.env.WKCOACH_EMAIL;
    const password = process.env.WKCOACH_PASSWORD;
    let wkcoachPlayers: Array<{
      fantasyplayerId: number;
      name: string;
      teamName: string;
      teamCode: string;
      position: string;
      positionNl: string;
      value: number;
      isActive: boolean;
    }> = [];

    if (email && password) {
      const raw = await fetchWkcoachAllPlayers({
        email,
        password,
        roundSequence,
      });

      wkcoachPlayers = raw.map((p) => ({
        fantasyplayerId: p.fantasyplayer_id,
        name: p.name,
        teamName: p.club_fullname,
        teamCode: p.club_codename,
        position: p.position,
        positionNl: p.position_nl,
        value: p.value,
        isActive: p.is_active,
      }));
    }

    // 2. Fallback to CSV if WKCoach returned nothing
    if (wkcoachPlayers.length === 0) {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const csvPath = path.join(process.cwd(), "data", "players-wk.csv");
        const csvContent = await fs.readFile(csvPath, "utf-8");

        // Parse the CSV: "speler id,speler naam,positie,club,transferwaarde"
        const lines = csvContent.trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          if (cols.length >= 5) {
            const value = Number(cols[4]) || 0;
            wkcoachPlayers.push({
              fantasyplayerId: Number(cols[0]) || 0,
              name: cols[1].trim(),
              teamName: cols[3].trim(),
              teamCode: cols[3].trim().substring(0, 3).toUpperCase(),
              position: cols[2].trim(),
              positionNl: cols[2].trim(),
              value,
              isActive: true,
            });
          }
        }
      } catch {
        // CSV not found — return empty
      }
    }

    // 3. Merge with stored points
    const pointsSnapshot = await loadPlayerPoints("wk");
    const pointsMap = new Map<string, PlayerPointsEntry>();
    if (pointsSnapshot) {
      for (const pp of pointsSnapshot.players) {
        const key = normalizeName(pp.playerName);
        pointsMap.set(key, pp);
      }
    }

    const players = wkcoachPlayers.map((p) => {
      const key = normalizeName(p.name);
      const pp = pointsMap.get(key);
      return {
        ...p,
        punten: pp?.roundPoints ?? 0,
        totaalPunten: pp?.totalPoints ?? 0,
        hasPoints: pp != null,
      };
    });

    // 4. Summary stats
    const teams = [...new Set(players.map((p) => p.teamName))].sort();
    const positions = [...new Set(players.map((p) => p.positionNl))].sort();

    return NextResponse.json(
      {
        count: players.length,
        players,
        teams,
        positions,
        source: wkcoachPlayers.length > 0 ? "wkcoach" : "csv",
        pointsLastSync: pointsSnapshot?.syncedAt ?? null,
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (error) {
    console.error("[wk/players] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch WK players", count: 0, players: [] },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}
