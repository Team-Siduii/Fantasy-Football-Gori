export const LEAGUE_COORDINATOR_EMAIL = "s.j.m.duindam@gmail.com";

export function shouldUseWkcoachByDefault(includeWkcoachParam: string | null): boolean {
  if (includeWkcoachParam === null) return true;
  return includeWkcoachParam.toLowerCase() !== "false";
}

export function getPlayerPointsPriority(): string {
  return "wkcoach(primary)>fallback";
}

export function isLeagueCoordinator(email: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === LEAGUE_COORDINATOR_EMAIL;
}

export function buildWkcoachCoordinatorAlert(params: {
  email: string | null;
  wkcoachRequested: boolean;
  wkcoachEnabled: boolean;
  hasCredentials: boolean;
}): string | null {
  if (!isLeagueCoordinator(params.email)) return null;
  if (!params.wkcoachRequested) return null;
  if (params.wkcoachEnabled) return null;

  if (!params.hasCredentials) {
    return "WKCoach is primaire waarheid, maar staat uit: WKCOACH_EMAIL/WKCOACH_PASSWORD ontbreken in environment.";
  }

  return "WKCoach is primaire waarheid, maar enrichment faalde. Fallback-data wordt gebruikt; check login/session of rate limits.";
}
