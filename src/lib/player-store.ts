import type { PlayerRecord } from "@/domain/player";

let players: PlayerRecord[] = [];

export function replacePlayers(nextPlayers: PlayerRecord[]) {
  players = [...nextPlayers];
}

export function listPlayers(): PlayerRecord[] {
  return [...players];
}

export function clearPlayers() {
  players = [];
}
