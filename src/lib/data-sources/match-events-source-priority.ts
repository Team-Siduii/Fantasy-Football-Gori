import { getPlayerPointsPriority } from "./wkcoach-policy";

export type MatchEventsSourcePriority = {
  score: string;
  goals: string;
  assists: string;
  saves: string;
  cards: string;
  playerPoints: string;
};

export function buildMatchEventsSourcePriority(options: { includeFlashfootball: boolean }): MatchEventsSourcePriority {
  if (options.includeFlashfootball) {
    return {
      score: "flashfootball>openligadb>thesportsdb",
      goals: "flashfootball>openligadb>thesportsdb",
      assists: "flashfootball>thesportsdb>openligadb",
      saves: "thesportsdb>openligadb",
      cards: "flashfootball>thesportsdb>openligadb",
      playerPoints: getPlayerPointsPriority(),
    };
  }

  return {
    score: "openligadb>thesportsdb",
    goals: "openligadb>thesportsdb",
    assists: "thesportsdb>openligadb",
    saves: "thesportsdb>openligadb",
    cards: "thesportsdb>openligadb",
    playerPoints: getPlayerPointsPriority(),
  };
}
