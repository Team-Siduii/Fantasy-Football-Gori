export type HeaderMenuItem = {
  href: string;
  label: string;
  authOnly?: boolean;
};

export function getHeaderMenuItems(isAuthenticated: boolean, isWkMode: boolean): HeaderMenuItem[] {
  if (!isAuthenticated) {
    return [{ href: "/login", label: "Log in" }];
  }

  return [
    { href: isWkMode ? "/manager/world-cup/draft" : "/draft", label: "Draft", authOnly: true },
    { href: "/account", label: "Naam aanpassen", authOnly: true },
    { href: "/instellingen", label: "Instellingen", authOnly: true },
    { href: "/spelregels", label: "Spelregels", authOnly: true },
    { href: "/admin/players", label: "CSV import", authOnly: true },
  ];
}
