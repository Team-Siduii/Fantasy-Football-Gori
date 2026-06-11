import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { getAuthStateStoragePath, listManagerAccounts } from "./auth-store";
import { getLeagueAdminConfigPersistent, type LeagueMode } from "./league-admin-config";
import { readManagerStatePersistent, resolveManagerStatePath, type ManagerState, type ManagerStateScope } from "./manager-state";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";

type IntegrityIssueType =
  | "participant_auth_email_mismatch"
  | "participant_missing_auth_account"
  | "auth_account_missing_participant"
  | "legacy_manager_state_key";

export type IntegrityIssue = {
  type: IntegrityIssueType;
  managerId: string;
  severity: "warning" | "error";
  message: string;
  key?: string;
  expected?: string;
  actual?: string;
};

export type IntegrityReport = {
  scope: ManagerStateScope;
  generatedAt: string;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
  };
  issues: IntegrityIssue[];
};

export type IntegrityRepairResult = {
  scope: ManagerStateScope;
  updated: boolean;
  repairedManagerStateKeys: number;
  normalizedManagerStates: number;
  issuesBefore: number;
  issuesAfter: number;
  generatedAt: string;
};

type RawManagerPersonalState = {
  formation?: string;
  lineupIds?: string[];
  benchIds?: string[];
  pickedTransferId?: string | null;
  pendingSellId?: string | null;
  pendingBuyId?: string | null;
  roundStates?: Record<string, unknown>;
};

type RawManagerState = ManagerState & {
  managerStates?: Record<string, RawManagerPersonalState>;
};

type PersistedAuthState = {
  accounts?: Array<{
    id?: string;
    role?: string;
    profile?: {
      name?: string;
      email?: string;
      teamName?: string;
    };
  }>;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getPresetManagerIds() {
  return new Set(AUTH_TEST_ACCOUNT_PRESETS.filter((preset) => preset.role === "manager").map((preset) => normalize(preset.id)));
}

function buildAliases(managerId: string, participantEmail?: string, authEmail?: string, label?: string, teamName?: string, name?: string) {
  return new Set(
    [managerId, participantEmail, authEmail, label, teamName, name]
      .map((value) => normalize(value))
      .filter((value) => value.length > 0),
  );
}

async function readRawManagerState(scope: ManagerStateScope): Promise<RawManagerState> {
  const fallback = {
    formation: "4-3-3",
    lineupIds: [],
    benchIds: [],
    pickedTransferId: null,
    pendingSellId: null,
    pendingBuyId: null,
    roundStates: {},
    managerStates: {},
    roundLocks: [],
    adminActionLog: [],
  } satisfies RawManagerState;

  if (isGoriDatabaseEnabled()) {
    return readPersistentJson({ store: "manager-state", scope }, fallback);
  }

  const target = resolveManagerStatePath(scope);
  if (!existsSync(target)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(target, "utf-8")) as RawManagerState;
  } catch {
    return fallback;
  }
}

async function persistRawManagerState(scope: ManagerStateScope, state: RawManagerState) {
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "manager-state", scope }, state);
  }

  const target = resolveManagerStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(state, null, 2), "utf-8");
}

function readRawAuthState(): PersistedAuthState {
  const target = getAuthStateStoragePath();
  if (!existsSync(target)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(target, "utf-8")) as PersistedAuthState;
  } catch {
    return {};
  }
}

function isLegacyManagerKey(key: string, managerId: string, aliases: Set<string>) {
  const normalizedKey = normalize(key);
  return normalizedKey.length > 0 && normalizedKey !== normalize(managerId) && aliases.has(normalizedKey);
}

export async function getIntegrityReport(scope: ManagerStateScope = "eredivisie"): Promise<IntegrityReport> {
  const [config, normalizedState] = await Promise.all([
    getLeagueAdminConfigPersistent(scope as LeagueMode),
    readManagerStatePersistent(scope),
  ]);
  const rawState = await readRawManagerState(scope);
  const authAccounts = listManagerAccounts();
  const rawAuthState = readRawAuthState();
  const issues: IntegrityIssue[] = [];
  const participantIds = new Set(config.participants.map((participant) => normalize(participant.managerId)));
  const presetIds = getPresetManagerIds();

  for (const participant of config.participants) {
    const authById = authAccounts.find((account) => normalize(account.id) === normalize(participant.managerId));
    const authByEmail = authAccounts.find((account) => normalize(account.profile.email) === normalize(participant.email));
    const authAccount = authById ?? authByEmail ?? null;

    if (!authAccount) {
      issues.push({
        type: "participant_missing_auth_account",
        managerId: participant.managerId,
        severity: "error",
        message: `Participant ${participant.label} mist een runtime auth-account.`,
        expected: participant.email,
      });
    } else if (normalize(authAccount.profile.email) !== normalize(participant.email)) {
      issues.push({
        type: "participant_auth_email_mismatch",
        managerId: participant.managerId,
        severity: "warning",
        message: `Participant ${participant.label} gebruikt een andere auth-email dan in league-config.`,
        expected: participant.email,
        actual: authAccount.profile.email,
      });
    }

    const aliases = buildAliases(
      participant.managerId,
      participant.email,
      authAccount?.profile.email,
      participant.label,
      authAccount?.profile.teamName,
      authAccount?.profile.name,
    );

    for (const key of Object.keys(rawState.managerStates ?? {})) {
      if (isLegacyManagerKey(key, participant.managerId, aliases)) {
        issues.push({
          type: "legacy_manager_state_key",
          managerId: participant.managerId,
          severity: "warning",
          message: `Manager-state gebruikt legacy sleutel ${key} in plaats van ${participant.managerId}.`,
          key,
          expected: participant.managerId,
          actual: key,
        });
      }
    }
  }

  for (const account of authAccounts) {
    const accountId = normalize(account.id);
    if (!participantIds.has(accountId) && !presetIds.has(accountId)) {
      issues.push({
        type: "auth_account_missing_participant",
        managerId: account.id,
        severity: "warning",
        message: `Auth-account ${account.id} zit niet in de actieve league participants.`,
        actual: account.profile.email,
      });
    }
  }

  for (const key of Object.keys(normalizedState.managerStates ?? {})) {
    const canonical = normalize(key);
    if (!participantIds.has(canonical) && !presetIds.has(canonical)) {
      const fromRaw = rawAuthState.accounts?.find((account) => normalize(account.id) === canonical);
      if (!fromRaw) {
        issues.push({
          type: "auth_account_missing_participant",
          managerId: key,
          severity: "warning",
          message: `Manager-state bevat canonieke key ${key} zonder participant-koppeling.`,
          key,
        });
      }
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;

  return {
    scope,
    generatedAt: new Date().toISOString(),
    summary: {
      totalIssues: issues.length,
      errors,
      warnings,
    },
    issues,
  };
}

export async function repairIntegrityIssues(scope: ManagerStateScope = "eredivisie"): Promise<IntegrityRepairResult> {
  const before = await getIntegrityReport(scope);
  const normalized = await readManagerStatePersistent(scope);
  const rawState = await readRawManagerState(scope);
  const beforeKeys = Object.keys(rawState.managerStates ?? {});
  const afterKeys = Object.keys(normalized.managerStates ?? {});

  const nextState: RawManagerState = {
    ...rawState,
    ...normalized,
    managerStates: normalized.managerStates,
  };

  await persistRawManagerState(scope, nextState);

  const after = await getIntegrityReport(scope);
  return {
    scope,
    updated: JSON.stringify(beforeKeys.sort()) !== JSON.stringify(afterKeys.sort()),
    repairedManagerStateKeys: before.issues.filter((issue) => issue.type === "legacy_manager_state_key").length,
    normalizedManagerStates: afterKeys.length,
    issuesBefore: before.summary.totalIssues,
    issuesAfter: after.summary.totalIssues,
    generatedAt: new Date().toISOString(),
  };
}
