import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { getAuthAccountByEmail, getAuthAccountById, listManagerAccounts } from "./auth-store";
import { getLeagueAdminConfig, type LeagueMode, type LeagueParticipant } from "./league-admin-config";
import {
  normalizeManagerIdentityEmail,
  normalizeManagerIdentityValue,
} from "./manager-identity-shared";

export { buildManagerIdentityScopeKey, normalizeManagerIdentityEmail, normalizeManagerIdentityValue } from "./manager-identity-shared";

export type ManagerIdentityScope = "eredivisie" | "wk";

export type CanonicalManagerIdentity = {
  canonicalManagerId: string;
  aliases: Set<string>;
  participant: LeagueParticipant | null;
  email: string | null;
};

function addIdentityAlias(target: Set<string>, value?: string | null) {
  const normalized = normalizeManagerIdentityValue(value);
  if (normalized) {
    target.add(normalized);
  }
}

export function buildCanonicalManagerIdentities(scope: ManagerIdentityScope): CanonicalManagerIdentity[] {
  const byCanonical = new Map<string, CanonicalManagerIdentity>();
  const config = getLeagueAdminConfig(scope as LeagueMode);
  const participantsByManagerId = new Map(
    config.participants.map((participant) => [normalizeManagerIdentityValue(participant.managerId) ?? participant.managerId, participant]),
  );

  const ensure = (managerId: string) => {
    const canonicalManagerId = normalizeManagerIdentityValue(managerId);
    if (!canonicalManagerId) {
      throw new Error("canonical managerId ontbreekt");
    }

    const existing = byCanonical.get(canonicalManagerId);
    if (existing) {
      return existing;
    }

    const participant = participantsByManagerId.get(canonicalManagerId) ?? null;
    const created: CanonicalManagerIdentity = {
      canonicalManagerId,
      aliases: new Set<string>([canonicalManagerId]),
      participant,
      email: normalizeManagerIdentityEmail(participant?.email) ?? null,
    };
    byCanonical.set(canonicalManagerId, created);
    return created;
  };

  for (const participant of config.participants) {
    const identity = ensure(participant.managerId);
    identity.participant = participant;
    identity.email = normalizeManagerIdentityEmail(participant.email) ?? identity.email;
    addIdentityAlias(identity.aliases, participant.managerId);
    addIdentityAlias(identity.aliases, participant.label);
    addIdentityAlias(identity.aliases, participant.email);
  }

  for (const preset of AUTH_TEST_ACCOUNT_PRESETS.filter((candidate) => candidate.role === "manager")) {
    const identity = ensure(preset.id);
    identity.email = normalizeManagerIdentityEmail(preset.email) ?? identity.email;
    addIdentityAlias(identity.aliases, preset.id);
    addIdentityAlias(identity.aliases, preset.label);
    addIdentityAlias(identity.aliases, preset.name);
    addIdentityAlias(identity.aliases, preset.teamName);
    addIdentityAlias(identity.aliases, preset.email);
  }

  for (const account of listManagerAccounts()) {
    const identity = ensure(account.id);
    identity.email = normalizeManagerIdentityEmail(account.profile.email) ?? identity.email;
    addIdentityAlias(identity.aliases, account.id);
    addIdentityAlias(identity.aliases, account.profile.name);
    addIdentityAlias(identity.aliases, account.profile.teamName);
    addIdentityAlias(identity.aliases, account.profile.email);
  }

  return Array.from(byCanonical.values());
}

export function resolveCanonicalManagerId(scope: ManagerIdentityScope, managerKey?: string | null): string | null {
  const normalized = normalizeManagerIdentityValue(managerKey);
  if (!normalized) {
    return null;
  }

  const directAuthAccount = getAuthAccountById(normalized);
  if (directAuthAccount?.role === "manager") {
    return normalizeManagerIdentityValue(directAuthAccount.id);
  }

  const directParticipant = getLeagueAdminConfig(scope as LeagueMode).participants.find(
    (participant) => normalizeManagerIdentityValue(participant.managerId) === normalized,
  );
  if (directParticipant) {
    return normalizeManagerIdentityValue(directParticipant.managerId);
  }

  const directAuthEmail = getAuthAccountByEmail(normalized);
  if (directAuthEmail?.role === "manager") {
    return normalizeManagerIdentityValue(directAuthEmail.id);
  }

  const identities = buildCanonicalManagerIdentities(scope);
  const matched = identities.find((identity) => identity.aliases.has(normalized));
  return matched?.canonicalManagerId ?? null;
}

export function resolveManagerParticipant(scope: ManagerIdentityScope, managerKey?: string | null): LeagueParticipant | null {
  const canonicalManagerId = resolveCanonicalManagerId(scope, managerKey);
  if (!canonicalManagerId) {
    return null;
  }

  return (
    buildCanonicalManagerIdentities(scope).find((identity) => identity.canonicalManagerId === canonicalManagerId)?.participant ?? null
  );
}

export function resolveManagerIdentityEmail(scope: ManagerIdentityScope, managerKey?: string | null) {
  const canonicalManagerId = resolveCanonicalManagerId(scope, managerKey);
  if (!canonicalManagerId) {
    return null;
  }

  const identity = buildCanonicalManagerIdentities(scope).find((candidate) => candidate.canonicalManagerId === canonicalManagerId);
  if (identity?.email) {
    return identity.email;
  }

  const account = getAuthAccountById(canonicalManagerId);
  if (account?.role === "manager") {
    return normalizeManagerIdentityEmail(account.profile.email);
  }

  return normalizeManagerIdentityEmail(managerKey);
}
