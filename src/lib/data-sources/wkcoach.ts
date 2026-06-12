import type { NormalizedMatch } from "./match-events-merge";

type WkcoachApiPlayer = {
  fantasyplayer_id?: number;
  name?: string;
  club_codename?: string;
  club_fullname?: string;
  position?: string;
  position_nl?: string;
  round_points?: number;
  total_points?: number;
  value?: number;
  is_active?: boolean;
  has_played?: boolean;
};

type WkcoachApiPlayerEntry = {
  player?: WkcoachApiPlayer;
  is_sub?: boolean;
};

type WkcoachPointsDetailedPayload = {
  round_sequence?: number;
  players?: WkcoachApiPlayerEntry[];
};

export type WkcoachPointsSnapshot = {
  roundSequence: number | null;
  players: Array<{
    fantasyplayerId: number | null;
    playerName: string;
    roundPoints: number;
    totalPoints: number;
    teamName: string | null;
    teamCode: string | null;
    position: string | null;
    value: number | null;
    isSub: boolean;
  }>;
};

function parseSetCookies(setCookieHeader: string | null): Record<string, string> {
  if (!setCookieHeader) return {};
  const cookies: Record<string, string> = {};
  const parts = setCookieHeader.split(/,\s*(?=[^;]+?=)/g);
  for (const part of parts) {
    const first = part.split(";")[0];
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const key = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    cookies[key] = value;
  }
  return cookies;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export function mapWkcoachPointsDetailedToSnapshot(payload: WkcoachPointsDetailedPayload): WkcoachPointsSnapshot {
  return {
    roundSequence: payload.round_sequence ?? null,
    players: (payload.players ?? [])
      .filter((entry) => {
        const p = entry.player;
        return p && typeof p.name === "string" && p.name.trim().length > 0;
      })
      .map((entry) => {
        const p = entry.player!;
        return {
          fantasyplayerId: typeof p.fantasyplayer_id === "number" ? p.fantasyplayer_id : null,
          playerName: p.name!.trim(),
          roundPoints: Number(p.round_points ?? 0),
          totalPoints: Number(p.total_points ?? 0),
          teamName: p.club_fullname?.trim() || null,
          teamCode: p.club_codename?.trim() || null,
          position: p.position?.trim() || p.position_nl?.trim() || null,
          value: typeof p.value === "number" ? p.value : null,
          isSub: entry.is_sub === true,
        };
      }),
  };
}

/** Player returned by the /api/players/all/ endpoint */
export type WkcoachAllPlayer = {
  fantasyplayer_id: number;
  first_name: string;
  last_name: string;
  name: string;
  club_id: number;
  club_codename: string;
  club_fullname: string;
  position: string;
  position_nl: string;
  value: number;
  is_active: boolean;
};

export type WkcoachAllPlayersResponse = {
  players: WkcoachAllPlayer[];
};

/**
 * Fetches the full player pool from WKCoach (all 1248 players).
 * Includes names, teams, positions, prices — but NO points.
 *
 * Reuses the same auth flow as fetchWkcoachPointsSnapshot but calls
 * /api/players/all/ instead of the team-specific points endpoint.
 */
export async function fetchWkcoachAllPlayers(params: {
  email: string;
  password: string;
  roundSequence?: number;
}): Promise<WkcoachAllPlayer[]> {
  const ua = "Mozilla/5.0";
  const cookies: Record<string, string> = {};
  const seq = params.roundSequence ?? 1;

  const loginPage = await fetch("https://www.wkcoach.nl/accounts/login/", {
    headers: { "User-Agent": ua },
    cache: "no-store",
  });
  if (!loginPage.ok) return [];

  Object.assign(cookies, parseSetCookies(loginPage.headers.get("set-cookie")));
  const html = await loginPage.text();
  const csrfMatch = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
  const csrf = csrfMatch?.[1] ?? cookies.csrftoken;
  if (!csrf) return [];

  const form = new URLSearchParams();
  form.set("csrfmiddlewaretoken", csrf);
  form.set("login", params.email);
  form.set("password", params.password);

  const loginPost = await fetch("https://www.wkcoach.nl/accounts/login/", {
    method: "POST",
    headers: {
      "User-Agent": ua,
      Referer: "https://www.wkcoach.nl/accounts/login/",
      Origin: "https://www.wkcoach.nl",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(cookies),
    },
    body: form.toString(),
    redirect: "manual",
    cache: "no-store",
  });

  Object.assign(cookies, parseSetCookies(loginPost.headers.get("set-cookie")));
  if (!cookies.sessionid) return [];

  const commonHeaders = {
    "User-Agent": ua,
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.wkcoach.nl/app/",
    Cookie: cookieHeader(cookies),
  };

  const playersRes = await fetch(
    `https://www.wkcoach.nl/api/players/all/?round_seq=${seq}`,
    { headers: commonHeaders, cache: "no-store" },
  );
  if (!playersRes.ok) return [];

  const data = (await playersRes.json()) as WkcoachAllPlayersResponse;
  // Handle both { players: [...] } and { "0": {...}, "1": {...}, ... }
  if (Array.isArray(data.players)) return data.players;
  // Object with numeric keys
  if (typeof data === "object" && data !== null) {
    const values = Object.values(data as Record<string, unknown>);
    return values.filter(
      (v): v is WkcoachAllPlayer =>
        typeof v === "object" && v !== null && "fantasyplayer_id" in v,
    );
  }
  return [];
}

export async function fetchWkcoachPointsSnapshot(params: {
  email: string;
  password: string;
  roundSequence: number;
}): Promise<WkcoachPointsSnapshot | null> {
  const ua = "Mozilla/5.0";
  const cookies: Record<string, string> = {};

  const loginPage = await fetch("https://www.wkcoach.nl/accounts/login/", {
    headers: { "User-Agent": ua },
    cache: "no-store",
  });
  if (!loginPage.ok) return null;

  Object.assign(cookies, parseSetCookies(loginPage.headers.get("set-cookie")));
  const html = await loginPage.text();
  const csrfMatch = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
  const csrf = csrfMatch?.[1] ?? cookies.csrftoken;
  if (!csrf) return null;

  const form = new URLSearchParams();
  form.set("csrfmiddlewaretoken", csrf);
  form.set("login", params.email);
  form.set("password", params.password);

  const loginPost = await fetch("https://www.wkcoach.nl/accounts/login/", {
    method: "POST",
    headers: {
      "User-Agent": ua,
      Referer: "https://www.wkcoach.nl/accounts/login/",
      Origin: "https://www.wkcoach.nl",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(cookies),
    },
    body: form.toString(),
    redirect: "manual",
    cache: "no-store",
  });

  Object.assign(cookies, parseSetCookies(loginPost.headers.get("set-cookie")));
  if (!cookies.sessionid) return null;

  const commonHeaders = {
    "User-Agent": ua,
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.wkcoach.nl/app/",
    Cookie: cookieHeader(cookies),
  };

  const prepRes = await fetch(`https://www.wkcoach.nl/api/team/preparation/?round_seq=${params.roundSequence}`, {
    headers: commonHeaders,
    cache: "no-store",
  });
  if (!prepRes.ok) return null;
  const prepJson = (await prepRes.json()) as { fantasycoach_id?: number };
  if (!prepJson.fantasycoach_id) return null;

  const pointsRes = await fetch(
    `https://www.wkcoach.nl/api/team/points-detailed/${prepJson.fantasycoach_id}/?round_seq=${params.roundSequence}`,
    { headers: commonHeaders, cache: "no-store" },
  );
  if (!pointsRes.ok) return null;

  const pointsJson = (await pointsRes.json()) as WkcoachPointsDetailedPayload;
  return mapWkcoachPointsDetailedToSnapshot(pointsJson);
}

function normalizeName(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function enrichMatchesWithWkcoachPoints(matches: NormalizedMatch[], snapshot: WkcoachPointsSnapshot): Array<NormalizedMatch & { wkcoachRoundSequence: number | null }> {
  const byName = new Map(
    snapshot.players.map((player) => [normalizeName(player.playerName), player] as const),
  );

  return matches.map((match) => ({
    ...match,
    wkcoachRoundSequence: snapshot.roundSequence,
    events: match.events.map((event) => {
      const key = normalizeName(event.playerName);
      const found = byName.get(key);
      if (!found) return event;
      return {
        ...event,
        wkcoachRoundPoints: found.roundPoints,
        wkcoachTotalPoints: found.totalPoints,
      };
    }),
  }));
}
