import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "../domain/player-csv";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { ensureAuthStateFromDb, getAuthAccountByEmail, getProfileByEmail } from "./auth-store";
import { getLeagueAdminConfigPersistent } from "./league-admin-config";
import { readManagerStatePersistent, type ManagerStateScope } from "./manager-state";
import { summarizeManagerTeamScoresPersistent, summarizeManagerTeamScoresThroughRoundPersistent } from "./team-score-state";
import { getDefaultVisibleRound } from "./season-schedule";
import { WORLD_CUP_2026_FIXTURES } from "./world-cup-schedule";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
};

const DEFAULT_BUDGET_CAP = 100;

function normalizeRequestedRound(roundNumber: number | null | undefined) {
  if (!Number.isInteger(roundNumber) || (roundNumber ?? 0) <= 0) {
    return null;
  }
  return roundNumber as number;
}

async function loadPlayers(scope: ManagerStateScope) {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      return parsePlayerCsv(csvContent).players;
    } catch {
      return [];
    }
  }

  const { bootstrapPlayersFromDefaultCsv } = await import("./player-bootstrap");
  const { listPlayers } = await import("./player-store");
  await bootstrapPlayersFromDefaultCsv();
  return listPlayers();
}

export type RankingEntry = {
  managerId: string;
  displayName: string;
  teamName: string;
  email: string;
  subpoule: string;
  totalPoints: number;
  currentRoundPoints: number;
  budgetRemaining: number;
  position: number;
};

export type LeagueRankingSnapshot = {
  mode: ManagerStateScope;
  currentRound: number;
  selectedRound: number;
  userSubpoule: string;
  userEmail: string;
  leagueName: string;
  ranking: RankingEntry[];
  allSubpoules: Record<string, RankingEntry[]>;
  allRanking: RankingEntry[];
};

export async function buildLeagueRankingSnapshot(
  scope: ManagerStateScope,
  requesterEmail?: string | null,
  roundNumber?: number | null,
): Promise<LeagueRankingSnapshot> {
  await ensureAuthStateFromDb();

  const currentRound = scope === "wk" ? (getDefaultVisibleRound(WORLD_CUP_2026_FIXTURES, new Date()) ?? 0) : 0;
  const normalizedRequestedRound = normalizeRequestedRound(roundNumber);
  const selectedRoundBase = normalizedRequestedRound ?? currentRound;
  const selectedRound = scope === "wk"
    ? (selectedRoundBase > 0 ? selectedRoundBase : 1)
    : 0;
  const allPlayers = await loadPlayers(scope);
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const leagueConfig = await getLeagueAdminConfigPersistent(scope);
  const budgetCap = leagueConfig.budget.teamValueCapMillions ?? DEFAULT_BUDGET_CAP;
  const acceptedParticipantEmails = new Set(
    leagueConfig.participants
      .filter((participant) => participant.status === "ACCEPTED")
      .map((participant) => participant.email.trim().toLowerCase())
      .filter(Boolean),
  );
  const acceptedManagerEmails = leagueConfig.participants
    .filter((participant) => participant.status === "ACCEPTED")
    .map((participant) => participant.email.trim().toLowerCase())
    .filter((email) => {
      const account = getAuthAccountByEmail(email);
      return account?.role === "manager" || Boolean(SUBPOULE_BY_EMAIL[email]);
    });
  const presetManagerEmails = AUTH_TEST_ACCOUNT_PRESETS
    .filter((preset) => preset.role === "manager")
    .map((preset) => preset.email.trim().toLowerCase())
    .filter((email) => acceptedParticipantEmails.has(email) || Boolean(SUBPOULE_BY_EMAIL[email]));
  const managerEmails = Array.from(new Set([...acceptedManagerEmails, ...presetManagerEmails]));

  const rankingSeed: Omit<RankingEntry, "position">[] = [];
  for (const managerEmail of managerEmails) {
    const profile = getProfileByEmail(managerEmail);
    const teamName = profile?.teamName ?? "Onbekend team";
    const state = await readManagerStatePersistent(scope, managerEmail);
    const squadIds = [...state.lineupIds, ...state.benchIds];

    let squadCost = 0;
    for (const playerId of squadIds) {
      const player = playerById.get(playerId);
      if (player) {
        squadCost += player.prijs ?? 0;
      }
    }

    const scoreSummary = scope === "wk"
      ? await summarizeManagerTeamScoresThroughRoundPersistent(scope, managerEmail, selectedRound)
      : await summarizeManagerTeamScoresPersistent(scope, managerEmail);

    const fallbackSummary = scope === "wk" && selectedRound > 0 && scoreSummary.latestRound !== null && selectedRound > scoreSummary.latestRound
      ? await summarizeManagerTeamScoresPersistent(scope, managerEmail)
      : scoreSummary;

    rankingSeed.push({
      managerId: managerEmail.split("@")[0],
      displayName: profile?.name ?? managerEmail.split("@")[0],
      teamName,
      email: managerEmail,
      subpoule: SUBPOULE_BY_EMAIL[managerEmail] ?? "A",
      totalPoints: Math.round((fallbackSummary.totalPoints ?? 0) * 10) / 10,
      currentRoundPoints: Math.round((fallbackSummary.currentRoundPoints ?? 0) * 10) / 10,
      budgetRemaining: Math.round(Math.max(0, budgetCap - squadCost) * 10) / 10,
    });
  }

  rankingSeed.sort((a, b) => b.totalPoints - a.totalPoints || a.teamName.localeCompare(b.teamName));
  const allRanking = rankingSeed.map((entry, index) => ({ ...entry, position: index + 1 }));

  const bySubpoule = new Map<string, RankingEntry[]>();
  for (const entry of allRanking) {
    const poule = entry.subpoule;
    const current = bySubpoule.get(poule) ?? [];
    current.push(entry);
    bySubpoule.set(poule, current);
  }

  for (const [subpoule, entries] of bySubpoule.entries()) {
    bySubpoule.set(
      subpoule,
      entries.map((entry, index) => ({ ...entry, position: index + 1 })),
    );
  }

  const normalizedRequester = requesterEmail?.trim().toLowerCase() ?? "";
  const requesterEntry = allRanking.find((entry) => entry.email === normalizedRequester);
  const userSubpoule = requesterEntry?.subpoule ?? "A";
  const ranking = bySubpoule.get(userSubpoule) ?? [];

  return {
    mode: scope,
    currentRound,
    selectedRound,
    userSubpoule,
    userEmail: normalizedRequester,
    leagueName: leagueConfig.competition.name,
    ranking,
    allSubpoules: Object.fromEntries(bySubpoule),
    allRanking,
  };
}
