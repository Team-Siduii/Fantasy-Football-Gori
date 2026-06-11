export function getPlayerPointsPriority(): string {
  return "wkcoach(primary)>fallback";
}

export function shouldUseWkcoachByDefault(param: string | null): boolean {
  if (param === "false" || param === "0") return false;
  return true;
}

export function buildWkcoachCoordinatorAlert(input: {
  email: string | null | undefined;
  wkcoachRequested: boolean;
  wkcoachEnabled: boolean;
  hasCredentials: boolean;
}): { show: boolean; message: string } | null {
  if (!input.wkcoachRequested) return null;
  if (input.wkcoachEnabled) return null;

  const isCoordinator = input.email === "s.j.m.duindam@gmail.com";
  if (!isCoordinator) return null;

  if (!input.hasCredentials) {
    return {
      show: true,
      message: "WKCoach credentials niet ingesteld. Punten kunnen niet worden opgehaald.",
    };
  }
  return {
    show: true,
    message: "WKCoach niet beschikbaar. Punten konden niet worden opgehaald.",
  };
}
