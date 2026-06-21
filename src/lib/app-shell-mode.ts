export type AppShellPreferredMode = "eredivisie" | "wk";

export function resolveAppShellMode(pathname: string, preferredMode: AppShellPreferredMode = "eredivisie"): AppShellPreferredMode {
  if (pathname.startsWith("/manager/world-cup")) {
    return "wk";
  }

  if (pathname === "/draft" || pathname.startsWith("/manager/")) {
    return "eredivisie";
  }

  return preferredMode;
}
