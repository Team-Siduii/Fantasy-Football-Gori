import { describe, expect, it } from "vitest";
import {
  buildFlashFootballUrls,
  extractFlashFootballEventId,
  mapFlashFootballFeedToNormalized,
} from "../../src/lib/data-sources/flashfootball";

const liveIncidentFeedSnippet = [
  "AA÷K8aznggo¬AD÷Croatia¬AE÷Croatia¬AF÷Croatia¬",
  "~AA÷GbB957na¬AD÷Belgium¬AE÷Belgium¬AF÷Belgium¬",
  "~AC÷1st Half¬IG÷0¬IH÷1¬",
  "~III÷4S9e9FX7¬IA÷2¬IB÷38'¬IE÷3¬INX÷0¬IOX÷1¬IF÷Tielemans Y.¬IU÷/player/tielemans-youri/GtkTQyib/¬ICT÷Goal! Youri Tielemans (Belgium) makes it 0:1.¬IK÷Goal¬IM÷GtkTQyib¬IE÷8¬IF÷De Cuyper M.¬IU÷/player/de-cuyper-maxim/GGc6kPWT/¬ICT÷¬IK÷Assistance¬IM÷GGc6kPWT¬",
  "~III÷budXNZ3b¬IA÷1¬IB÷42'¬IE÷1¬IF÷Baturina M.¬IU÷/player/baturina-martin/0WWy1lhR/¬ICT÷Yellow card.¬IK÷Yellow Card¬IM÷0WWy1lhR¬IJ÷18¬IL÷Roughing¬",
  "~AC÷2nd Half¬IG÷0¬IH÷1¬",
  "~III÷69HDciVI¬IA÷2¬IB÷90+6'¬ID÷6¬IE÷3¬INX÷0¬IOX÷2¬IF÷Lukaku R.¬IU÷/player/lukaku-romelu/dCkG0Iw0/¬ICT÷Romelu Lukaku scores.¬IK÷Goal¬IM÷dCkG0Iw0¬IE÷8¬IF÷Vanaken H.¬IU÷/player/vanaken-hans/0Cu4qHps/¬ICT÷¬IK÷Assistance¬IM÷0Cu4qHps¬",
].join("");

describe("flashfootball adapter", () => {
  it("extracts the event id from match URLs and builds known endpoint URLs", () => {
    expect(extractFlashFootballEventId("https://www.flashfootball.com/match/belgium-GbB957na/croatia-K8aznggo/#/match-summary")).toBe("GbB957na");
    expect(extractFlashFootballEventId("EDo2e0I5")).toBe("EDo2e0I5");

    expect(buildFlashFootballUrls("EDo2e0I5")).toEqual({
      incidents: "https://www.flashfootball.com/x/feed/df_sui_1_EDo2e0I5",
      teamStats: "https://www.flashfootball.com/x/feed/df_st_1_EDo2e0I5",
      playerSchema: "https://2002.ds.lsapp.eu/pq_graphql?_hash=epmsse&eventId=EDo2e0I5&projectId=2002",
      playerStats: "https://2002.ds.lsapp.eu/pq_graphql?_hash=epmsd&eventId=EDo2e0I5&providerId=7",
    });
  });

  it("maps live incident feed goals, assists, cards and score to normalized match events", () => {
    const normalized = mapFlashFootballFeedToNormalized(liveIncidentFeedSnippet, {
      eventId: "EDo2e0I5",
      kickoffAt: "2026-06-02T18:45:00Z",
    });

    expect(normalized.source).toBe("flashfootball");
    expect(normalized.homeTeam).toBe("Croatia");
    expect(normalized.awayTeam).toBe("Belgium");
    expect(normalized.scoreHT).toEqual({ home: 0, away: 1 });
    expect(normalized.scoreFT).toEqual({ home: 0, away: 2 });

    expect(normalized.events).toEqual([
      expect.objectContaining({ type: "goal", minute: 38, team: "Belgium", playerName: "Tielemans Y.", playerExternalId: "GtkTQyib", confidence: "high" }),
      expect.objectContaining({ type: "assist", minute: 38, team: "Belgium", playerName: "De Cuyper M.", playerExternalId: "GGc6kPWT", relatedPlayerName: "Tielemans Y.", confidence: "high" }),
      expect.objectContaining({ type: "yellow_card", minute: 42, team: "Croatia", playerName: "Baturina M.", playerExternalId: "0WWy1lhR", confidence: "high" }),
      expect.objectContaining({ type: "goal", minute: 96, team: "Belgium", playerName: "Lukaku R.", playerExternalId: "dCkG0Iw0", confidence: "high" }),
      expect.objectContaining({ type: "assist", minute: 96, team: "Belgium", playerName: "Vanaken H.", playerExternalId: "0Cu4qHps", relatedPlayerName: "Lukaku R.", confidence: "high" }),
    ]);
    expect(normalized.quality).toMatchObject({ hasScoreHT: true, hasScoreFT: true, hasGoals: true, hasAssists: true, hasCards: true });
  });
});
