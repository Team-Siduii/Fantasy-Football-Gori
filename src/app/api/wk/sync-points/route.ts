import { NextResponse } from "next/server";
import { fetchWkcoachPointsSnapshot } from "@/lib/data-sources/wkcoach";
import { savePlayerPoints, type PlayerPointsSnapshot } from "@/lib/player-points-store";
import { WORLD_CUP_2026_FIXTURES } from "@/lib/world-cup-schedule";

/**
 * Bepaalt welke WK-ronde NU actief is op basis van het wedstrijdschema.
 * - Als er wedstrijden bezig zijn (binnen 3 uur na kickoff of voor eindtijd), return die ronde
 * - Anders: return de eerstvolgende ronde met wedstrijden
 */
function getCurrentOrUpcomingRound(): number {
  const now = new Date();
  const nowMs = now.getTime();

  // Kijk of er een actieve wedstrijd is (kickoff ≤ now ≤ kickoff+3h)
  for (const fixture of WORLD_CUP_2026_FIXTURES) {
    const kickoff = new Date(fixture.kickoffAt).getTime();
    const endEstimate = kickoff + 3 * 60 * 60 * 1000; // 3 uur na kickoff
    if (nowMs >= kickoff && nowMs <= endEstimate) {
      return fixture.round;
    }
  }

  // Zoek de eerstvolgende wedstrijd
  let nextRound = 1;
  for (const fixture of WORLD_CUP_2026_FIXTURES) {
    const kickoff = new Date(fixture.kickoffAt).getTime();
    if (kickoff > nowMs) {
      return fixture.round;
    }
    nextRound = fixture.round;
  }

  return nextRound;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const roundSequence = roundParam ? Number(roundParam) : getCurrentOrUpcomingRound();

    if (!Number.isInteger(roundSequence) || roundSequence < 1 || roundSequence > 9) {
      return NextResponse.json(
        { error: "Ongeldig ronde nummer (1-9)" },
        { status: 400 },
      );
    }

    const email = process.env.WKCOACH_EMAIL;
    const password = process.env.WKCOACH_PASSWORD;

    if (!email || !password) {
      return NextResponse.json(
        { error: "WKCoach credentials niet geconfigureerd" },
        { status: 500 },
      );
    }

    const snapshot = await fetchWkcoachPointsSnapshot({
      email,
      password,
      roundSequence,
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "Kon WKCoach punten niet ophalen (login of API faalde)" },
        { status: 502 },
      );
    }

    const syncedAt = new Date().toISOString();
    const pointsSnapshot: PlayerPointsSnapshot = {
      roundSequence: snapshot.roundSequence ?? roundSequence,
      players: snapshot.players.map((p) => ({
        fantasyplayerId: p.fantasyplayerId,
        playerName: p.playerName,
        roundPoints: p.roundPoints,
        totalPoints: p.totalPoints,
        teamName: p.teamName,
        teamCode: p.teamCode,
        position: p.position,
        syncedAt,
      })),
      syncedAt,
    };

    await savePlayerPoints("wk", pointsSnapshot);

    return NextResponse.json({
      success: true,
      roundSequence: pointsSnapshot.roundSequence,
      playersCount: pointsSnapshot.players.length,
      syncedAt,
      activeSubs: snapshot.players.filter((p) => p.isSub).length,
      lastSync: syncedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-points error:", message);
    return NextResponse.json(
      { error: "Interne fout", details: message },
      { status: 500 },
    );
  }
}
