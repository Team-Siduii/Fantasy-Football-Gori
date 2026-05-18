import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";

export type ManagerProfile = {
  name: string;
  email: string;
  teamName: string;
};

type AuthRole = "manager" | "admin";

type AuthAccount = {
  id: string;
  role: AuthRole;
  profile: ManagerProfile;
  passwordHash: string;
  passwordSalt: string;
  mustSetup: boolean;
};

type ResetTokenRecord = {
  token: string;
  email: string;
  expiresAt: number;
};

type PersistedAuthState = {
  accounts: AuthAccount[];
  resetTokens: ResetTokenRecord[];
};

function getAuthStatePath() {
  return process.env.AUTH_STATE_PATH || path.join(process.cwd(), "data", "auth-state.json");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function createDefaultAccountFromPreset(preset: (typeof AUTH_TEST_ACCOUNT_PRESETS)[number]): AuthAccount {
  const salt = randomBytes(16).toString("hex");
  const initialSecret = preset.inviteCode ?? preset.password;

  return {
    id: preset.id,
    role: preset.role,
    profile: {
      name: preset.name,
      email: preset.email,
      teamName: preset.teamName,
    },
    passwordSalt: salt,
    passwordHash: hashPassword(initialSecret, salt),
    mustSetup: Boolean(preset.inviteCode),
  };
}

function createStateFromDefaults(): PersistedAuthState {
  return {
    accounts: AUTH_TEST_ACCOUNT_PRESETS.map(createDefaultAccountFromPreset),
    resetTokens: [],
  };
}

function saveState(state: PersistedAuthState) {
  const target = getAuthStatePath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(state, null, 2), "utf-8");
}

function isResetTokenRecord(input: unknown): input is ResetTokenRecord {
  if (!input || typeof input !== "object") {
    return false;
  }

  const maybe = input as Partial<ResetTokenRecord>;
  return typeof maybe.token === "string" && typeof maybe.email === "string" && typeof maybe.expiresAt === "number";
}

function normalizeResetTokens(input: unknown): ResetTokenRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter(isResetTokenRecord);
}

function isAuthAccount(input: unknown): input is AuthAccount {
  if (!input || typeof input !== "object") {
    return false;
  }

  const maybe = input as Partial<AuthAccount>;
  const profile = maybe.profile as Partial<ManagerProfile> | undefined;

  return (
    (maybe.role === "manager" || maybe.role === "admin") &&
    typeof maybe.id === "string" &&
    typeof maybe.passwordHash === "string" &&
    typeof maybe.passwordSalt === "string" &&
    typeof maybe.mustSetup === "boolean" &&
    !!profile &&
    typeof profile.name === "string" &&
    typeof profile.email === "string" &&
    typeof profile.teamName === "string"
  );
}

function loadState(): PersistedAuthState {
  const target = getAuthStatePath();

  if (!existsSync(target)) {
    const initial = createStateFromDefaults();
    saveState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as PersistedAuthState;

    if (Array.isArray(parsed.accounts)) {
      const validAccounts = parsed.accounts.filter(isAuthAccount);
      if (validAccounts.length > 0) {
        return {
          accounts: validAccounts,
          resetTokens: normalizeResetTokens(parsed.resetTokens),
        };
      }
    }

    const reset = createStateFromDefaults();
    saveState(reset);
    return reset;
  } catch {
    const reset = createStateFromDefaults();
    saveState(reset);
    return reset;
  }
}

let authState = loadState();

function findAccountByEmail(email: string): AuthAccount | undefined {
  return authState.accounts.find((account) => account.profile.email.toLowerCase() === email.toLowerCase());
}

function comparePassword(password: string, account: AuthAccount) {
  const candidate = Buffer.from(hashPassword(password, account.passwordSalt), "hex");
  const expected = Buffer.from(account.passwordHash, "hex");

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

function generateResetToken() {
  return `reset_${randomBytes(18).toString("base64url")}`;
}

function cleanupExpiredTokens() {
  const now = Date.now();
  authState.resetTokens = authState.resetTokens.filter((token) => token.expiresAt > now);
}

export type LoginStatus = {
  ok: boolean;
  requiresSetup: boolean;
};

export function authenticateManagerWithStatus(email: string, password: string): LoginStatus {
  cleanupExpiredTokens();

  const account = findAccountByEmail(email);
  if (!account) {
    return { ok: false, requiresSetup: false };
  }

  const ok = comparePassword(password, account);
  if (!ok) {
    return { ok: false, requiresSetup: false };
  }

  return { ok: true, requiresSetup: account.mustSetup };
}

export function authenticateManager(email: string, password: string): boolean {
  return authenticateManagerWithStatus(email, password).ok;
}

export function getProfileByEmail(email: string): ManagerProfile | null {
  const account = findAccountByEmail(email);
  return account ? account.profile : null;
}

export function getManagerProfile(): ManagerProfile {
  return (
    authState.accounts.find((account) => account.role === "manager")?.profile ?? {
      name: "Manager",
      email: "manager@gori.local",
      teamName: "FC Slot",
    }
  );
}

export function updateProfileByEmail(email: string, input: Pick<ManagerProfile, "name" | "teamName">): ManagerProfile | null {
  const accountIndex = authState.accounts.findIndex((account) => account.profile.email.toLowerCase() === email.toLowerCase());
  if (accountIndex === -1) {
    return null;
  }

  authState.accounts[accountIndex] = {
    ...authState.accounts[accountIndex],
    profile: {
      ...authState.accounts[accountIndex].profile,
      name: input.name,
      teamName: input.teamName,
    },
  };

  saveState(authState);
  return authState.accounts[accountIndex].profile;
}

export function updateManagerProfile(input: Pick<ManagerProfile, "name" | "teamName">): ManagerProfile {
  const manager = authState.accounts.find((account) => account.role === "manager");
  if (!manager) {
    authState = createStateFromDefaults();
    saveState(authState);
  }
  const refreshed = authState.accounts.find((account) => account.role === "manager") ?? authState.accounts[0];
  return (
    updateProfileByEmail(refreshed.profile.email, input) ?? {
      name: input.name,
      email: refreshed.profile.email,
      teamName: input.teamName,
    }
  );
}

export function changePassword(email: string, currentPassword: string, newPassword: string): boolean {
  const accountIndex = authState.accounts.findIndex((account) => account.profile.email.toLowerCase() === email.toLowerCase());
  if (accountIndex === -1) {
    return false;
  }

  const account = authState.accounts[accountIndex];
  if (!comparePassword(currentPassword, account)) {
    return false;
  }

  const salt = randomBytes(16).toString("hex");
  authState.accounts[accountIndex] = {
    ...account,
    passwordSalt: salt,
    passwordHash: hashPassword(newPassword, salt),
    mustSetup: false,
  };

  saveState(authState);
  return true;
}

export function completeInitialSetup(email: string, inviteCode: string, newPassword: string, teamName: string): boolean {
  const accountIndex = authState.accounts.findIndex((account) => account.profile.email.toLowerCase() === email.toLowerCase());
  if (accountIndex === -1) {
    return false;
  }

  const account = authState.accounts[accountIndex];
  if (!account.mustSetup) {
    return false;
  }

  if (!comparePassword(inviteCode, account)) {
    return false;
  }

  const salt = randomBytes(16).toString("hex");
  authState.accounts[accountIndex] = {
    ...account,
    passwordSalt: salt,
    passwordHash: hashPassword(newPassword, salt),
    mustSetup: false,
    profile: {
      ...account.profile,
      teamName: teamName.trim(),
    },
  };

  saveState(authState);
  return true;
}

export function createPasswordResetToken(email: string, ttlSeconds = 1800): string | null {
  cleanupExpiredTokens();

  const account = findAccountByEmail(email);
  if (!account) {
    return null;
  }

  const token = generateResetToken();
  authState.resetTokens.push({
    token,
    email: account.profile.email,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  saveState(authState);

  return token;
}

export function consumePasswordResetToken(token: string, newPassword: string): boolean {
  cleanupExpiredTokens();

  const foundIndex = authState.resetTokens.findIndex((entry) => entry.token === token);
  if (foundIndex === -1) {
    return false;
  }

  const found = authState.resetTokens[foundIndex];
  const accountIndex = authState.accounts.findIndex(
    (account) => account.profile.email.toLowerCase() === found.email.toLowerCase(),
  );

  if (accountIndex === -1) {
    return false;
  }

  const salt = randomBytes(16).toString("hex");
  authState.accounts[accountIndex] = {
    ...authState.accounts[accountIndex],
    passwordSalt: salt,
    passwordHash: hashPassword(newPassword, salt),
    mustSetup: false,
  };
  authState.resetTokens.splice(foundIndex, 1);
  saveState(authState);

  return true;
}

export function getPasswordResetLink(token: string): string {
  return `/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetAuthStateForTests() {
  const target = getAuthStatePath();
  if (existsSync(target)) {
    unlinkSync(target);
  }

  authState = loadState();
}
