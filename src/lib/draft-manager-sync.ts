import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { saveManagerState, type ManagerStateScope } from "./manager-state";

const DEFAULT_FORMATION = "4-3-3";
const LINEUP_SIZE = 11;
const SQUAD_SIZE = 15;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveDraftTeamManagerEmail(teamId: string): string | null {
  const target = normalize(teamId);
  if (!target) {
    return null;
  }

  const account = AUTH_TEST_ACCOUNT_PRESETS.find((preset) => {
    const candidates = [preset.label, preset.name, preset.teamName, preset.email].map(normalize);
    return candidates.includes(target);
  });

  return account?.email.trim().toLowerCase() ?? null;
}

export function syncDraftRosterToManagerTeam(input: {
  teamId: string;
  playerIds: string[];
  scope: ManagerStateScope;
  formation?: string;
}) {
  const managerEmail = resolveDraftTeamManagerEmail(input.teamId);
  if (!managerEmail) {
    return null;
  }

  const uniquePlayerIds = Array.from(new Set(input.playerIds.filter((id) => typeof id === "string" && id.trim().length > 0))).slice(0, SQUAD_SIZE);

  const state = saveManagerState(
    {
      formation: input.formation ?? DEFAULT_FORMATION,
      lineupIds: uniquePlayerIds.slice(0, LINEUP_SIZE),
      benchIds: uniquePlayerIds.slice(LINEUP_SIZE, SQUAD_SIZE),
      pendingSellId: null,
      pendingBuyId: null,
      pickedTransferId: null,
    },
    input.scope,
    managerEmail,
  );

  return { managerEmail, state };
}
