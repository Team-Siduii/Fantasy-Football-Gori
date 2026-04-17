export type ManagerProfile = {
  name: string;
  email: string;
  teamName: string;
};

type AuthState = {
  profile: ManagerProfile;
  password: string;
  resetTokens: Map<string, string>;
};

const authState: AuthState = {
  profile: {
    name: "Manager",
    email: "manager@gori.local",
    teamName: "FC Slot",
  },
  password: "gori1234",
  resetTokens: new Map<string, string>(),
};

function generateResetToken() {
  return `reset_${Math.random().toString(36).slice(2, 12)}`;
}

export function authenticateManager(email: string, password: string): boolean {
  return email.toLowerCase() === authState.profile.email.toLowerCase() && password === authState.password;
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

  return authState.profile;
}

export function createPasswordResetToken(email: string): string | null {
  if (email.toLowerCase() !== authState.profile.email.toLowerCase()) {
    return null;
  }

  const token = generateResetToken();
  authState.resetTokens.set(token, authState.profile.email);
  return token;
}

export function consumePasswordResetToken(token: string, newPassword: string): boolean {
  const email = authState.resetTokens.get(token);

  if (!email || email.toLowerCase() !== authState.profile.email.toLowerCase()) {
    return false;
  }

  authState.password = newPassword;
  authState.resetTokens.delete(token);
  return true;
}
