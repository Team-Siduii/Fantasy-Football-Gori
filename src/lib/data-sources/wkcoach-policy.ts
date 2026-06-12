export function getPlayerPointsPriority(): string {
  return "wkcoach(primary)>fallback";
}

export function shouldUseWkcoachByDefault(param: string | null): boolean {
  if (param === "false" || param === "0") return false;
  return true;
}

export function isLeagueCoordinator(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === "s.j.m.duindam@gmail.com";
}

export function buildWkcoachCoordinatorAlert(input: {
  email: string | null | undefined;
  wkcoachRequested: boolean;
  wkcoachEnabled: boolean;
  hasCredentials: boolean;
}): { show: boolean; message: string } | null {
  if (!input.wkcoachRequested) return null;
  if (input.wkcoachEnabled) return null;

  if (!isLeagueCoordinator(input.email)) return null;

  if (!input.hasCredentials) {
    return {
      show: true,
      message: "WKCoach is primaire waarheid voor spelerspunten, maar credentials zijn niet ingesteld. Punten kunnen niet worden opgehaald.",
    };
  }
  return {
    show: true,
    message: "WKCoach is primaire waarheid voor spelerspunten, maar is nu niet beschikbaar. Punten konden niet worden opgehaald.",
  };
}
