import type { PlayerRecord } from "@/domain/player";

/**
 * Spelers die uit de WKCoach dataset verwijderd zijn (uitgeschakelde landen,
 * roster-wijzigingen), maar nog in een manager's team zitten.
 * 
 * Wordt bijgewerkt wanneer de CSV sync spelers verwijdert.
 */
const INACTIVE_WK_PLAYERS: Record<string, PlayerRecord> = {
  "1280": {
    id: "1280",
    naam: "Wesley",
    club: "Brazilië",
    positie: "DEF",
    prijs: 6.0,
  },
};

export function getInactivePlayer(id: string): PlayerRecord | undefined {
  return INACTIVE_WK_PLAYERS[id];
}
