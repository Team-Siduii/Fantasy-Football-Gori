"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
};

const eredivisieNavItems: NavItem[] = [
  { href: "/manager/my-team", label: "Team" },
  { href: "/manager/transfer-pool", label: "Transfers" },
  { href: "/manager/league", label: "Competities" },
  { href: "/profile", label: "Profiel" },
];

const wkNavItems: NavItem[] = [
  { href: "/manager/world-cup", label: "WK 2026" },
  { href: "/profile", label: "Profiel" },
];

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}

export function AppShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const activeNavItems = isWkMode ? wkNavItems : eredivisieNavItems;

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
            <Link href="/instellingen" className={`header-link ${isActive(pathname, "/instellingen") ? "active" : ""}`}>
              Instellingen
            </Link>
            <button onClick={handleLogout} className="logout-button" type="button">
              Log out
            </button>
          </div>
        </header>

        <section className="summary-strip" aria-label="Teamoverzicht">
          <article>
            <span>Team</span>
            <strong>Mijn Super Team</strong>
          </article>
          <article>
            <span>Rank</span>
            <strong>1st (29)</strong>
          </article>
          <article>
            <span>Totaal Punten</span>
            <strong>190</strong>
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
      </div>
    </div>
  );
}
