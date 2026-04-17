import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";

export type ManagerProfile = {
  name: string;
  email: string;
  teamName: string;
};

type ResetTokenRecord = {
  token: string;
  email: string;
  expiresAt: number;
};

type PersistedAuthState = {
  profile: ManagerProfile;
  passwordHash: string;
  passwordSalt: string;
  resetTokens: ResetTokenRecord[];
};

const DEFAULT_PROFILE: ManagerProfile = {
  name: "Manager",
  email: "manager@gori.local",
  teamName: "FC Slot",
};

function getAuthStatePath() {
  return process.env.AUTH_STATE_PATH || path.join(process.cwd(), "data", "auth-state.json");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function createStateFromDefaults(password = "gori1234"): PersistedAuthState {
  const salt = randomBytes(16).toString("hex");

  return {
    profile: DEFAULT_PROFILE,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    resetTokens: [],
  };
}

function saveState(state: PersistedAuthState) {
  const target = getAuthStatePath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(state, null, 2), "utf-8");
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

    if (!parsed.passwordHash || !parsed.passwordSalt || !parsed.profile?.email) {
      const reset = createStateFromDefaults();
      saveState(reset);
      return reset;
    }

    return {
      ...parsed,
      resetTokens: Array.isArray(parsed.resetTokens) ? parsed.resetTokens : [],
    };
  } catch {
    const reset = createStateFromDefaults();
    saveState(reset);
    return reset;
  }
}

let authState = loadState();

function comparePassword(password: string) {
  const candidate = Buffer.from(hashPassword(password, authState.passwordSalt), "hex");
  const expected = Buffer.from(authState.passwordHash, "hex");

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

  if (email.toLowerCase() !== authState.profile.email.toLowerCase()) {
    return false;
  }

  return comparePassword(password);
}

export function getManagerProfile(): ManagerProfile {
  return authState.profile;
}

export function updateManagerProfile(input: Pick<ManagerProfile, "name" | "teamName">): ManagerProfile {
  authState.profile = {
    ...authState.profile,
    name: input.name,
    teamName: input.teamName,
  };
  saveState(authState);

  return authState.profile;
}

export function createPasswordResetToken(email: string, ttlSeconds = 1800): string | null {
  cleanupExpiredTokens();

  if (email.toLowerCase() !== authState.profile.email.toLowerCase()) {
    return null;
  }

  const token = generateResetToken();
  authState.resetTokens.push({
    token,
    email: authState.profile.email,
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
  if (found.email.toLowerCase() !== authState.profile.email.toLowerCase()) {
    return false;
  }

  const salt = randomBytes(16).toString("hex");
  authState.passwordSalt = salt;
  authState.passwordHash = hashPassword(newPassword, salt);
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
