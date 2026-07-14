"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { resolveAppShellMode, type AppShellPreferredMode } from "@/lib/app-shell-mode";
import { getHeaderMenuItems } from "@/lib/app-shell-menu";
import { countPlayers, resolveModeFallbackPath } from "@/lib/manager-route-utils";

type NavItem = {
  href: string;
  label: string;
};

const eredivisieNavItems: NavItem[] = [
  { href: "/manager/my-team", label: "Mijn team" },
  { href: "/draft", label: "Draft" },
  { href: "/manager/transfer-pool", label: "Transfers" },
  { href: "/manager/league", label: "Competitie" },
  { href: "/instellingen", label: "Instellingen" },
];

const wkNavItems: NavItem[] = [
  { href: "/manager/world-cup", label: "Mijn team" },
  { href: "/manager/world-cup/draft", label: "Draft" },
  { href: "/manager/world-cup/transfer-pool", label: "Transfers" },
  { href: "/manager/world-cup/league", label: "Competitie" },
  { href: "/instellingen", label: "Instellingen" },
];

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}

const MODE_SWITCH_MAP: Record<string, string> = {
  "/draft": "/manager/world-cup/draft",
  "/manager/my-team": "/manager/world-cup",
  "/manager/transfer-pool": "/manager/world-cup/transfer-pool",
  "/manager/league": "/manager/world-cup/league",
  "/account": "/account",
  "/instellingen": "/instellingen",
  "/spelregels": "/spelregels",
  "/manager/world-cup/draft": "/draft",
  "/manager/world-cup": "/manager/my-team",
  "/manager/world-cup/transfer-pool": "/manager/transfer-pool",
  "/manager/world-cup/league": "/manager/league",
};

function switchModePath(currentPath: string): string {
  if (MODE_SWITCH_MAP[currentPath]) return MODE_SWITCH_MAP[currentPath];
  // Fallback: if on a WK page, go to Eredivisie team; otherwise go to WK team
  if (currentPath.startsWith("/manager/world-cup")) return "/manager/my-team";
  return "/manager/world-cup";
}

type SubpouleSummaryResponse = {
  teamName?: string;
  leagueName?: string;
  standing?: {
    subpoule: string;
    rank: number;
    totalManagersInSubpoule: number;
    points: number;
  } | null;
};

type PreferredModeResponse = {
  mode?: AppShellPreferredMode;
  route?: string;
};

type ManagerStateCountResponse = {
  state?: {
    lineupIds?: string[];
    benchIds?: string[];
  };
};

export function AppShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preferredMode, setPreferredMode] = useState<AppShellPreferredMode>("eredivisie");
  const shellMode = resolveAppShellMode(pathname, preferredMode);
  const isWkMode = shellMode === "wk";
  const activeNavItems = isWkMode ? wkNavItems : eredivisieNavItems;
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [summaryTeamName, setSummaryTeamName] = useState("Team laden…");
  const [summaryLeagueName, setSummaryLeagueName] = useState("");
  const [summaryRankLabel, setSummaryRankLabel] = useState("-");
  const [summaryPoints, setSummaryPoints] = useState("-");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const headerMenuItems = getHeaderMenuItems(isAuthenticated === true, isWkMode);

  useEffect(() => {
    let cancelled = false;

    const explicitMode = pathname.startsWith("/manager/world-cup")
      ? "wk"
      : pathname === "/draft" || pathname.startsWith("/manager/")
        ? "eredivisie"
        : null;

    if (explicitMode) {
      setPreferredMode(explicitMode);
      return () => {
        cancelled = true;
      };
    }

    const loadPreferredMode = async () => {
      const response = await fetch("/api/manager/preferred-mode", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as PreferredModeResponse;
      if (!cancelled && (data.mode === "wk" || data.mode === "eredivisie")) {
        setPreferredMode(data.mode);
      }
    };

    void loadPreferredMode();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const mode = isWkMode ? "wk" : "eredivisie";
    const load = async () => {
      const response = await fetch(`/api/manager/subpoule-summary?mode=${mode}`, { cache: "no-store" });
      if (response.status === 401) {
        setIsAuthenticated(false);
        setAuthChecked(true);
        router.push("/login");
        return;
      }

      if (!response.ok) return;

      setIsAuthenticated(true);
      setAuthChecked(true);
      const data = (await response.json()) as SubpouleSummaryResponse;

      setSummaryTeamName(data.teamName ?? "Teamnaam ontbreekt");
      setSummaryLeagueName(data.leagueName ?? "");

      if (data.standing) {
        setSummaryRankLabel(`#${data.standing.rank} (${data.standing.totalManagersInSubpoule})`);
        setSummaryPoints(String(data.standing.points));
      }
    };

    void load();
  }, [isWkMode, router]);

  useEffect(() => {
    let cancelled = false;

    const loadModeFallback = async () => {
      const [eredivisieResponse, wkResponse] = await Promise.all([
        fetch(`/api/manager/state?mode=eredivisie`, { cache: "no-store" }),
        fetch(`/api/manager/state?mode=wk`, { cache: "no-store" }),
      ]);

      if (!eredivisieResponse.ok || !wkResponse.ok || cancelled) {
        return;
      }

      const [eredivisieData, wkData] = await Promise.all([
        eredivisieResponse.json() as Promise<ManagerStateCountResponse>,
        wkResponse.json() as Promise<ManagerStateCountResponse>,
      ]);

      if (cancelled) {
        return;
      }

      const fallbackPath = resolveModeFallbackPath({
        currentPath: pathname,
        eredivisieCount: countPlayers(eredivisieData.state?.lineupIds, eredivisieData.state?.benchIds),
        wkCount: countPlayers(wkData.state?.lineupIds, wkData.state?.benchIds),
      });

      if (fallbackPath && fallbackPath !== pathname) {
        const query = searchParams.toString();
        router.replace(query ? `${fallbackPath}?${query}` : fallbackPath);
      }
    };

    void loadModeFallback();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setIsMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    if (typeof window !== "undefined") {
      window.location.assign("/");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="top-header">
          <div className="brand-wrap">
            <p className="brand-eyebrow">{isWkMode ? "world cup" : "eredivisie"}</p>
            <h1>{summaryLeagueName || (isWkMode ? "FANTASY WK" : "FANTASY EREDIVISIE")}</h1>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className={`menu-toggle ${isMenuOpen ? "active" : ""}`}
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-expanded={isMenuOpen}
              aria-controls="app-shell-menu"
            >
              <span>Menu</span>
              <span aria-hidden="true">☰</span>
            </button>

            {isMenuOpen ? (
              <nav id="app-shell-menu" className="header-menu" aria-label="Snelmenu">
                {headerMenuItems.map((item) => (
                  <Link key={item.href} href={item.href} className={`header-menu-link ${isActive(pathname, item.href) ? "active" : ""}`}>
                    {item.label}
                  </Link>
                ))}

                {isAuthenticated === true ? (
                  <button onClick={handleLogout} className="header-menu-link header-menu-button" type="button">
                    Log out
                  </button>
                ) : null}
              </nav>
            ) : null}
          </div>
        </header>

        <section className="summary-strip" aria-label="Teamoverzicht">
          <article>
            <span>Team</span>
            <strong>{summaryTeamName}</strong>
          </article>
          <article>
            <span>{summaryLeagueName || "Competitie"}</span>
            <strong>{summaryRankLabel}</strong>
          </article>
          <article>
            <span>Totaal Punten</span>
            <strong>{summaryPoints}</strong>
          </article>
        </section>

        <section className="mode-switch" aria-label="Spelmodus wissel">
          <span className="mode-switch-label">Mode</span>
          <div className="mode-switch-buttons">
            <Link href={isWkMode ? switchModePath(pathname) : pathname} className={`mode-switch-button ${!isWkMode ? "active" : ""}`}>
              Eredivisie
            </Link>
            <Link href={isWkMode ? pathname : switchModePath(pathname)} className={`mode-switch-button ${isWkMode ? "active" : ""}`}>
              WK 2026
            </Link>
          </div>
        </section>

        <header className="page-head">
          <h2>{title}</h2>
          {typeof subtitle === "string" ? <p>{subtitle}</p> : subtitle}
        </header>

        {authChecked ? (
          <>
            <main className="content">{children}</main>

            {isAuthenticated === true ? (
              <nav className="bottom-nav" aria-label="Hoofdnavigatie">
                {activeNavItems.map((item) => (
                  <Link key={item.href} href={item.href} className={`bottom-link ${isActive(pathname, item.href) ? "active" : ""}`}>
                    {item.label}
                  </Link>
                ))}

                <Link href="/admin/players" className={`fab-link ${isActive(pathname, "/admin/players") ? "active" : ""}`}>
                  CSV
                </Link>
              </nav>
            ) : null}
          </>
        ) : (
          <main className="content">
            <p style={{ textAlign: "center", padding: "2rem", color: "var(--brand)" }}>Controleren login…</p>
          </main>
        )}
      </div>
    </div>
  );
}
