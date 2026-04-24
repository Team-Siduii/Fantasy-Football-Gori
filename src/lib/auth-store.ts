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

type LegacyPersistedAuthState = {
  profile?: ManagerProfile;
  passwordHash?: string;
  passwordSalt?: string;
  resetTokens?: ResetTokenRecord[];
};

function getAuthStatePath() {
  return process.env.AUTH_STATE_PATH || path.join(process.cwd(), "data", "auth-state.json");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function createDefaultAccountFromPreset(preset: (typeof AUTH_TEST_ACCOUNT_PRESETS)[number]): AuthAccount {
  const salt = randomBytes(16).toString("hex");

  return {
    id: preset.id,
    role: preset.role,
    profile: {
      name: preset.name,
      email: preset.email,
      teamName: preset.teamName,
    },
    passwordSalt: salt,
    passwordHash: hashPassword(preset.password, salt),
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
    !!profile &&
    typeof profile.name === "string" &&
    typeof profile.email === "string" &&
    typeof profile.teamName === "string"
  );
}

function getAccountByRole(accounts: AuthAccount[], role: AuthRole): AuthAccount | undefined {
  return accounts.find((account) => account.role === role);
}

function buildMigratedStateFromLegacy(parsed: LegacyPersistedAuthState): PersistedAuthState | null {
  if (!parsed.passwordHash || !parsed.passwordSalt || !parsed.profile?.email) {
    return null;
  }

  const managerPreset = AUTH_TEST_ACCOUNT_PRESETS.find((preset) => preset.role === "manager");
  const managerRole: AuthRole = managerPreset?.role ?? "manager";

  const managerAccount: AuthAccount = {
    id: managerPreset?.id ?? "manager",
    role: managerRole,
    profile: {
      name: parsed.profile.name,
      email: parsed.profile.email,
      teamName: parsed.profile.teamName,
    },
    passwordHash: parsed.passwordHash,
    passwordSalt: parsed.passwordSalt,
  };

  const defaults = AUTH_TEST_ACCOUNT_PRESETS.map(createDefaultAccountFromPreset);
  const adminDefault = getAccountByRole(defaults, "admin");
  const accounts = adminDefault ? [managerAccount, adminDefault] : [managerAccount];

  return {
    accounts,
    resetTokens: normalizeResetTokens(parsed.resetTokens),
  };
}

function loadState(): PersistedAuthState {
  const target = getAuthStatePath();

  if (!existsSync(target)) {
    const initial = createStateFromDefaults();
    saveState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as PersistedAuthState | LegacyPersistedAuthState;

    if (Array.isArray((parsed as PersistedAuthState).accounts)) {
      const validAccounts = (parsed as PersistedAuthState).accounts.filter(isAuthAccount);
      if (validAccounts.length > 0) {
        return {
          accounts: validAccounts,
          resetTokens: normalizeResetTokens((parsed as PersistedAuthState).resetTokens),
        };
      }
    }

    const migrated = buildMigratedStateFromLegacy(parsed as LegacyPersistedAuthState);
    if (migrated) {
      saveState(migrated);
      return migrated;
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

export function authenticateManager(email: string, password: string): boolean {
  cleanupExpiredTokens();

  const account = findAccountByEmail(email);
  if (!account) {
    return false;
  }

  return comparePassword(password, account);
}

export function getManagerProfile(): ManagerProfile {
  const manager = getAccountByRole(authState.accounts, "manager") ?? authState.accounts[0];

  return manager?.profile ?? { name: "Manager", email: "manager@gori.local", teamName: "FC Slot" };
}

export function updateManagerProfile(input: Pick<ManagerProfile, "name" | "teamName">): ManagerProfile {
  if (authState.accounts.length === 0) {
    authState = createStateFromDefaults();
  }

  const managerIndex = authState.accounts.findIndex((account) => account.role === "manager");
  const targetIndex = managerIndex >= 0 ? managerIndex : 0;

  authState.accounts[targetIndex] = {
    ...authState.accounts[targetIndex],
    profile: {
      ...authState.accounts[targetIndex].profile,
      name: input.name,
      teamName: input.teamName,
    },
  };

  saveState(authState);
  return authState.accounts[targetIndex].profile;
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
