"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
};

const eredivisieNavItems: NavItem[] = [
  { href: "/manager/my-team", label: "Team" },
  { href: "/draft", label: "Draft" },
  { href: "/manager/transfer-pool", label: "Transfers" },
  { href: "/account", label: "Account" },
];

const wkNavItems: NavItem[] = [
  { href: "/manager/world-cup", label: "Team" },
  { href: "/manager/world-cup/draft", label: "Draft" },
  { href: "/manager/world-cup/transfer-pool", label: "Transfers" },
  { href: "/account", label: "Account" },
];

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}

type SubpouleSummaryResponse = {
  teamName?: string;
  standing?: {
    subpoule: string;
    rank: number;
    totalManagersInSubpoule: number;
    points: number;
  } | null;
};

export function AppShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const activeNavItems = isWkMode ? wkNavItems : eredivisieNavItems;
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [summaryTeamName, setSummaryTeamName] = useState("Team laden…");
  const [summaryRankLabel, setSummaryRankLabel] = useState("-");
  const [summaryPoints, setSummaryPoints] = useState("-");

  useEffect(() => {
    const mode = isWkMode ? "wk" : "eredivisie";
    const load = async () => {
      const response = await fetch(`/api/manager/subpoule-summary?mode=${mode}`, { cache: "no-store" });
      if (response.status === 401) {
        setIsAuthenticated(false);
        setSummaryTeamName("Niet ingelogd");
        setSummaryRankLabel("-");
        setSummaryPoints("-");
        return;
      }

      if (!response.ok) return;

      setIsAuthenticated(true);
      const data = (await response.json()) as SubpouleSummaryResponse;

      setSummaryTeamName(data.teamName ?? "Teamnaam ontbreekt");

      if (data.standing) {
        setSummaryRankLabel(`#${data.standing.rank} (${data.standing.totalManagersInSubpoule}) · Poule ${data.standing.subpoule}`);
        setSummaryPoints(String(data.standing.points));
      }
    };

    void load();
  }, [isWkMode]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="top-header">
          <div className="brand-wrap">
            <p className="brand-eyebrow">{isWkMode ? "world cup" : "eredivisie"}</p>
            <h1>{isWkMode ? "FANTASY WK" : "FANTASY EREDIVISIE"}</h1>
          </div>

          <div className="header-actions">
            {isAuthenticated === true ? (
              <>
                <Link href={isWkMode ? "/manager/world-cup/draft" : "/draft"} className={`header-link ${isActive(pathname, isWkMode ? "/manager/world-cup/draft" : "/draft") ? "active" : ""}`}>
                  Draft
                </Link>
                <Link href="/account" className={`header-link ${isActive(pathname, "/account") ? "active" : ""}`}>
                  Naam aanpassen
                </Link>
                <Link href="/instellingen" className={`header-link ${isActive(pathname, "/instellingen") ? "active" : ""}`}>
                  Instellingen
                </Link>
                <button onClick={handleLogout} className="logout-button" type="button">
                  Log out
                </button>
              </>
            ) : isAuthenticated === false ? (
              <Link href="/login" className="header-link">
                Log in
              </Link>
            ) : null}
            <Link href="/spelregels" className={`header-link ${isActive(pathname, "/spelregels") ? "active" : ""}`}>
              Spelregels
            </Link>
          </div>
        </header>

        <section className="summary-strip" aria-label="Teamoverzicht">
          <article>
            <span>Team</span>
            <strong>{summaryTeamName}</strong>
          </article>
          <article>
            <span>Subpoule rank</span>
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
            <Link href="/manager/my-team" className={`mode-switch-button ${!isWkMode ? "active" : ""}`}>
              Eredivisie
            </Link>
            <Link href="/manager/world-cup" className={`mode-switch-button ${isWkMode ? "active" : ""}`}>
              WK 2026
            </Link>
          </div>
        </section>

        <header className="page-head">
          <h2>{title}</h2>
          {typeof subtitle === "string" ? <p>{subtitle}</p> : subtitle}
        </header>

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
      </div>
    </div>
  );
}
