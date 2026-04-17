"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  badge?: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/draft", label: "Draft" },
  { href: "/teams", label: "Teams" },
  { href: "/transfers", label: "Transfers" },
  { href: "/admin/players", label: "Spelers CSV", badge: "MVP" },
  { href: "/instellingen", label: "Instellingen" },
];

export function AppShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Fantasy Football Gori</div>
        <nav className="nav">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`}>
                <span>{item.label}</span>
                {item.badge ? <span className="badge">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="content">
        <header className="page-head">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {children}
      </main>
    </div>
  );
}
