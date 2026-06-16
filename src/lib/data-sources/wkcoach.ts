import type { NormalizedMatch } from "./match-events-merge";

type WkcoachApiPlayer = {
  fantasyplayer_id?: number;
  name?: string;
  player_name?: string;
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
  player_name?: string;
  fantasyplayer_id?: number;
  club_codename?: string;
  club_fullname?: string;
  position?: string;
  position_nl?: string;
  round_points?: number;
  total_points?: number;
  value?: number;
  is_sub?: boolean;
};

type WkcoachPointsDetailedPayload = {
  round_sequence?: number;
  players?: WkcoachApiPlayerEntry[];
};

type WkcoachApiMatchTeam = {
  full_name?: string;
  codename?: string;
};

type WkcoachApiMatch = {
  id?: number;
  round?: number;
  home_team?: WkcoachApiMatchTeam;
  away_team?: WkcoachApiMatchTeam;
  home_score?: number;
  away_score?: number;
  status?: string;
  start_date_str?: string;
};

export type WkcoachMatchSyncRow = {
  match_id: number;
  round: number;
  home_team: string;
  away_team: string;
  home_team_code: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  kickoff_at: string | null;
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
        const playerName = entry.player?.name ?? entry.player?.player_name ?? entry.player_name;
        return typeof playerName === "string" && playerName.trim().length > 0;
      })
      .map((entry) => {
        const p = entry.player;
        return {
          fantasyplayerId:
            typeof p?.fantasyplayer_id === "number"
              ? p.fantasyplayer_id
              : typeof entry.fantasyplayer_id === "number"
                ? entry.fantasyplayer_id
                : null,
          playerName: (p?.name ?? p?.player_name ?? entry.player_name ?? "").trim(),
          roundPoints: Number(p?.round_points ?? entry.round_points ?? 0),
          totalPoints: Number(p?.total_points ?? entry.total_points ?? 0),
          teamName: p?.club_fullname?.trim() || entry.club_fullname?.trim() || null,
          teamCode: p?.club_codename?.trim() || entry.club_codename?.trim() || null,
          position: p?.position?.trim() || p?.position_nl?.trim() || entry.position?.trim() || entry.position_nl?.trim() || null,
          value:
            typeof p?.value === "number"
              ? p.value
              : typeof entry.value === "number"
                ? entry.value
                : null,
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

/** Player returned by the search_all endpoint — INCLUDES POINTS */
export type WkcoachSearchPlayer = {
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
  round_points: number;
  total_points: number;
  has_played: boolean;
  num_played: number;
  performance_points: number;
  average_points: number;
  percentage_in_formations: number;
  point_events: Array<{ points: number; event_code: string; minute?: number }>;
};

export type WkcoachSearchResponse = {
  players: WkcoachSearchPlayer[];
  pagination: { page: number; page_size: number; total_count: number; total_pages: number };
};

const WKCOACH_UA = "Mozilla/5.0";
const FETCH_TIMEOUT_MS = 25_000;

function fetchWithTimeout(url: string | URL, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  return fetch(url, { ...init, signal }).finally(() => clearTimeout(timer));
}

async function wkcoachLogin(email: string, password: string): Promise<Record<string, string> | null> {
  const cookies: Record<string, string> = {};
  const loginPage = await fetchWithTimeout("https://www.wkcoach.nl/accounts/login/", {
    headers: { "User-Agent": WKCOACH_UA }, cache: "no-store",
  });
  if (!loginPage.ok) return null;
  Object.assign(cookies, parseSetCookies(loginPage.headers.get("set-cookie")));
  const html = await loginPage.text();
  const csrfMatch = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
  const csrf = csrfMatch?.[1] ?? cookies.csrftoken;
  if (!csrf) return null;
  const form = new URLSearchParams();
  form.set("csrfmiddlewaretoken", csrf); form.set("login", email); form.set("password", password);
  const lpRes = await fetchWithTimeout("https://www.wkcoach.nl/accounts/login/", {
    method: "POST",
    headers: {
      "User-Agent": WKCOACH_UA, Referer: "https://www.wkcoach.nl/accounts/login/",
      Origin: "https://www.wkcoach.nl", "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(cookies),
    },
    body: form.toString(), redirect: "manual", cache: "no-store",
  });
  Object.assign(cookies, parseSetCookies(lpRes.headers.get("set-cookie")));
  return cookies.sessionid ? cookies : null;
}

/**
 * Fetches all players WITH points from the search_all endpoint.
 * This is the endpoint the "Zoek spelers" page uses — paginates to get all 1248 players.
 */
export async function fetchWkcoachAllPlayersWithPoints(params: {
  email: string; password: string; roundSequence?: number; pageSize?: number;
}): Promise<WkcoachSearchPlayer[]> {
  const cookies = await wkcoachLogin(params.email, params.password);
  if (!cookies) return [];
  const seq = params.roundSequence ?? 1;
  const pageSize = params.pageSize ?? 100;
  const h = {
    "User-Agent": WKCOACH_UA, Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest", Referer: "https://www.wkcoach.nl/app/",
    Cookie: cookieHeader(cookies),
  };
  const firstRes = await fetchWithTimeout(
    `https://www.wkcoach.nl/api/players/search_all/${seq}/?page=1&page_size=${pageSize}&sort=-total_points&ts=${Date.now()}`,
    { headers: h, cache: "no-store" },
  );
  if (!firstRes.ok) return [];
  const firstData = (await firstRes.json()) as WkcoachSearchResponse;
  const all = [...(firstData.players ?? [])];
  for (let p = 2; p <= (firstData.pagination?.total_pages ?? 1); p++) {
    const r = await fetchWithTimeout(
      `https://www.wkcoach.nl/api/players/search_all/${seq}/?page=${p}&page_size=${pageSize}&sort=-total_points&ts=${Date.now()}`,
      { headers: h, cache: "no-store" },
    );
    if (!r.ok) break;
    const d = (await r.json()) as WkcoachSearchResponse;
    all.push(...(d.players ?? []));
  }
  return all;
}

export function mapWkcoachMatchesToSyncRows(matches: WkcoachApiMatch[], fallbackRoundSequence?: number): WkcoachMatchSyncRow[] {
  return matches
    .filter((match): match is WkcoachApiMatch & { id: number } => typeof match.id === "number")
    .map((match) => ({
      match_id: match.id,
      round: typeof match.round === "number" ? match.round : (fallbackRoundSequence ?? 1),
      home_team: match.home_team?.full_name?.trim() || "?",
      away_team: match.away_team?.full_name?.trim() || "?",
      home_team_code: match.home_team?.codename?.trim() || "",
      away_team_code: match.away_team?.codename?.trim() || "",
      home_score: typeof match.home_score === "number" && match.home_score >= 0 ? match.home_score : null,
      away_score: typeof match.away_score === "number" && match.away_score >= 0 ? match.away_score : null,
      status: match.status?.trim() || "NS",
      kickoff_at: match.start_date_str ?? null,
    }));
}

export async function fetchWkcoachMatches(params: {
  email: string;
  password: string;
  roundSequence?: number;
}): Promise<WkcoachMatchSyncRow[]> {
  const cookies = await wkcoachLogin(params.email, params.password);
  if (!cookies) return [];

  const seq = params.roundSequence ?? 1;
  const headers = {
    "User-Agent": WKCOACH_UA,
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.wkcoach.nl/app/",
    Cookie: cookieHeader(cookies),
  };

  const response = await fetchWithTimeout(
    `https://www.wkcoach.nl/api/teams/matches/?round_seq=${seq}&ts=${Date.now()}`,
    { headers, cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`WKCoach matches fetch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { matches?: WkcoachApiMatch[] } | WkcoachApiMatch[];
  const matches = Array.isArray(payload) ? payload : Array.isArray(payload.matches) ? payload.matches : [];
  return mapWkcoachMatchesToSyncRows(matches, seq);
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
