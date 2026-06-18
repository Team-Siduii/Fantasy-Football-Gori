"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PlayerCard } from "@/components/player-card";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { resolveCompatibleFormation } from "@/domain/roster-formation";
import { reorderAcrossZones, type ZoneName, type ZoneState } from "@/domain/lineup-state";
import { buildPitchRows } from "@/domain/pitch-layout";
import { calculateRemainingBudget, getTransferBudgetCapMillions, isWithinBudget } from "@/domain/team-budget";
import type { PlayerRecord } from "@/domain/player";
import { buildMarketPlayers } from "@/domain/transfer-workflow";
import { getTransferLimitForRound } from "@/domain/rules";
import { byPriceDesc, enrichPlayers, type EnhancedPlayer } from "@/lib/player-derived";
import { getCountryFlagImageUrl, withCountryFlag } from "@/lib/country-flags";
import { getInactivePlayer } from "@/lib/inactive-players";
import { getPlayerCardMeta } from "@/lib/player-card-display";
import { getCurrentOrNextRound, REMAINING_FIXTURES_2025_2026, type SeasonFixture } from "@/lib/season-schedule";
import { getWkMatchLiveMinuteLabel, mergeWorldCupFixturesWithSyncedMatches, hasVisibleFixtureScore, isLiveWkMatchStatus, type SyncedWkMatchLike } from "@/lib/wk-match-schedule";
import { WORLD_CUP_2026_FIXTURES, isRoundActive } from "@/lib/world-cup-schedule";

type Position = "GK" | "DEF" | "MID" | "FWD";

const BENCH_LIMIT = 4;
const BENCH_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const POSITION_SORT_ORDER: Record<Position, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};
const BONUS_ROUNDS = [5, 10, 20] as const;

type MarketSortField = "naam" | "positie" | "club" | "prijs" | "punten";
type MarketSortDirection = "asc" | "desc";

const MARKET_PAGE_SIZE = 40;

type ManagerStateResponse = {
  state?: {
    formation?: string;
    lineupIds?: string[];
    benchIds?: string[];
    pickedTransferId?: string | null;
    pendingSellId?: string | null;
    pendingBuyId?: string | null;
  };
};

type HydratedStateResult = {
  formation: string;
  state: ZoneState<EnhancedPlayer>;
};

type LeagueRuntimeConfigResponse = {
  config?: {
    budget?: {
      teamValueCapMillions?: number;
    };
  };
};

type WkMatchesApiResponse = {
  matches?: Array<{
    round: number;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string | null;
    minute?: number | null;
    kickoffAt: string | null;
  }>;
};

type TransferRoundEntryStatus = {
  managerId: string;
  email: string;
  displayName: string;
  teamName: string;
  rankingPosition: number;
  sellStatus: "PENDING" | "SKIPPED" | "SUBMITTED";
  sellPlayerId: string | null;
  buyStatus: "LOCKED" | "PENDING" | "SUBMITTED" | "COMPLETED" | "RETRY_REQUIRED";
  buyPlayerId: string | null;
  resolvedTransfer: { soldPlayerId: string; boughtPlayerId: string } | null;
};

type TransferRoundResponse = {
  state: {
    phase: "SELL" | "BUY" | "AWAITING_RETRY" | "COMPLETED";
    entries: TransferRoundEntryStatus[];
  };
  currentEntry: TransferRoundEntryStatus | null;
  pendingManagers: Array<Pick<TransferRoundEntryStatus, "managerId" | "displayName" | "teamName">>;
  blockedPlayerIds: string[];
};

function fallbackPlayers(): EnhancedPlayer[] {
  return enrichPlayers([
    { id: "1", naam: "Demo Keeper", positie: "GK", club: "PSV", prijs: 2 },
    { id: "2", naam: "Demo Def 1", positie: "DEF", club: "AJA", prijs: 2 },
    { id: "3", naam: "Demo Mid 1", positie: "MID", club: "FEY", prijs: 2.5 },
    { id: "4", naam: "Demo Mid 2", positie: "MID", club: "AZ", prijs: 2.5 },
    { id: "5", naam: "Demo Fwd 1", positie: "FWD", club: "UTR", prijs: 3 },
    { id: "6", naam: "Demo Def 2", positie: "DEF", club: "TWE", prijs: 2 },
    { id: "7", naam: "Demo Def 3", positie: "DEF", club: "SPA", prijs: 2 },
    { id: "8", naam: "Demo Def 4", positie: "DEF", club: "WIL", prijs: 1.5 },
    { id: "9", naam: "Demo Mid 3", positie: "MID", club: "HEE", prijs: 2 },
    { id: "10", naam: "Demo Fwd 2", positie: "FWD", club: "NEC", prijs: 3 },
    { id: "11", naam: "Demo Mid 4", positie: "MID", club: "GAE", prijs: 2 },
    { id: "12", naam: "Demo Def 5", positie: "DEF", club: "NAC", prijs: 1.5 },
    { id: "13", naam: "Demo Mid 5", positie: "MID", club: "PEC", prijs: 1.5 },
    { id: "14", naam: "Demo Fwd 3", positie: "FWD", club: "RKC", prijs: 2.5 },
    { id: "15", naam: "Demo Keeper 2", positie: "GK", club: "FOR", prijs: 1.5 },
  ]);
}

function createOpenSlot(position: string): EnhancedPlayer {
  return {
    id: `open-${position}-${Math.random().toString(36).slice(2, 8)}`,
    positie: position as Position,
    naam: "Open slot",
    club: "Voeg speler toe",
    prijs: 0,
    punten: 0,
  };
}

function TransferPlayerName({ player }: { player: EnhancedPlayer }) {
  const flagUrl = getCountryFlagImageUrl(player.club);

  return (
    <span className="transfer-player-name">
      {flagUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="transfer-country-flag"
          src={flagUrl}
          alt={`${player.club} vlag`}
          loading="lazy"
          width={24}
          height={18}
        />
      ) : null}
      <span>{player.naam}</span>
    </span>
  );
}

function countOpenSlots(state: ZoneState<EnhancedPlayer>) {
  return [...state.lineup, ...state.bench].filter((player) => player.id.startsWith("open-")).length;
}

function buildStateWithVacancies(
  players: EnhancedPlayer[],
  formation: string,
  vacancyCount: number,
): ZoneState<EnhancedPlayer> | null {
  const requiredLineup = buildFormationSlots(formation).flat();

  const byPosition = new Map<Position, EnhancedPlayer[]>([
    ["GK", []],
    ["DEF", []],
    ["MID", []],
    ["FWD", []],
  ]);

  for (const player of players) {
    const position = player.positie as Position;
    if (!byPosition.has(position)) {
      continue;
    }
    byPosition.get(position)?.push(player);
  }

  // Vooraf checken: per positie moet totaal benodigd (basis + bank) ≤ beschikbaar + open slots
  const requiredCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pos of requiredLineup) requiredCounts[pos] += 1;
  for (const pos of BENCH_POSITIONS) requiredCounts[pos] += 1;

  let totalDeficit = 0;
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    const available = (byPosition.get(pos)?.length ?? 0);
    const deficit = Math.max(0, (requiredCounts[pos] ?? 0) - available);
    totalDeficit += deficit;
  }

  if (totalDeficit > vacancyCount) {
    return null;
  }

  // Vul basisopstelling positiegewijs
  let remainingVacancies = vacancyCount;

  const takePlayerForPosition = (position: Position) => {
    const list = byPosition.get(position);
    if (!list || list.length === 0) {
      if (remainingVacancies <= 0) {
        return null;
      }
      remainingVacancies -= 1;
      return createOpenSlot(position);
    }
    return list.shift() ?? null;
  };

  const lineup: EnhancedPlayer[] = [];
  for (const position of requiredLineup) {
    const next = takePlayerForPosition(position as Position);
    if (!next) {
      return null;
    }
    lineup.push(next);
  }

  // Vul bank positiegewijs
  const bench: EnhancedPlayer[] = [];
  for (const position of BENCH_POSITIONS) {
    const next = takePlayerForPosition(position);
    if (!next) {
      return null;
    }
    bench.push(next);
  }

  const hasUnplacedPlayers = [...byPosition.values()].some((list) => list.length > 0);
  if (hasUnplacedPlayers || remainingVacancies !== 0) {
    return null;
  }

  return { lineup, bench };
}

function buildStateForFormation(players: EnhancedPlayer[], formation: string): ZoneState<EnhancedPlayer> {
  return buildStateWithVacancies(players, formation, 0) ?? {
    lineup: buildFormationSlots(formation).flat().map((position) => createOpenSlot(position)),
    bench: BENCH_POSITIONS.map((position) => createOpenSlot(position)),
  };
}

function buildBudgetDemoState(players: EnhancedPlayer[], formation: string, budgetCapMillions: number): ZoneState<EnhancedPlayer> {
  const ordered = [...players].sort((a, b) => a.prijs - b.prijs || a.naam.localeCompare(b.naam));
  const candidate = buildStateWithVacancies(ordered, formation, 0);

  if (candidate && isWithinBudget([...candidate.lineup, ...candidate.bench], budgetCapMillions)) {
    return candidate;
  }

  return buildStateForFormation(ordered, formation);
}

function buildStateForFormationWithVacancies(
  players: EnhancedPlayer[],
  formation: string,
  vacancyCount: number,
): ZoneState<EnhancedPlayer> | null {
  return buildStateWithVacancies(players, formation, vacancyCount);
}

function buildStateFromSaved(
  players: EnhancedPlayer[],
  formation: string,
  lineupIds: string[],
  benchIds: string[],
): HydratedStateResult {
  const byId = new Map(players.map((player) => [player.id, player]));
  const seen = new Set<string>();

  const savedPlayers: EnhancedPlayer[] = [];
  for (const id of [...lineupIds, ...benchIds]) {
    const player = byId.get(id);
    if (player && !seen.has(player.id)) {
      seen.add(player.id);
      savedPlayers.push(player);
    } else if (!player && !seen.has(id)) {
      // Speler niet in de actieve dataset (uit WK, uitgeschakeld land, etc.)
      // → toon als inactive placeholder met originele naam uit de graveyard
      const graveyard = getInactivePlayer(id);
      if (graveyard) {
        seen.add(id);
        savedPlayers.push({
          ...graveyard,
          punten: 0,
          inactive: true,
        });
      }
    }
  }

  const requiredSlotCount = buildFormationSlots(formation).flat().length + BENCH_POSITIONS.length;
  const vacancyCount = Math.max(0, requiredSlotCount - savedPlayers.length);
  const resolvedFormation = resolveCompatibleFormation({
    preferredFormation: formation,
    playerPositions: savedPlayers.map((player) => player.positie),
    vacancyCount,
  });

  return {
    formation: resolvedFormation,
    state:
      buildStateWithVacancies(savedPlayers, resolvedFormation, vacancyCount) ??
      buildStateForFormation(savedPlayers, resolvedFormation),
  };
}

function toPersistedIds(state: ZoneState<EnhancedPlayer>) {
  return {
    lineupIds: state.lineup.filter((player) => !player.id.startsWith("open-")).map((player) => player.id),
    benchIds: state.bench.filter((player) => !player.id.startsWith("open-")).map((player) => player.id),
  };
}

const CLUB_CODE: Record<string, string> = {
  Telstar: "TEL",
  Sparta: "SPA",
  'Go Ahead': "GAE",
  AZ: "AZ",
  PSV: "PSV",
  PEC: "PEC",
  Feyenoord: "FEY",
  Groningen: "GRO",
  Heerenveen: "HEE",
  Fortuna: "FOR",
  NAC: "NAC",
  Ajax: "AJA",
  Twente: "TWE",
  NEC: "NEC",
  Excelsior: "EXC",
  Utrecht: "UTR",
  Heracles: "HER",
  Volendam: "VOL",
  Algerije: "ALG",
  Argentinië: "ARG",
  Australië: "AUS",
  Oostenrijk: "AUT",
  België: "BEL",
  'Bosnië-Herzegovina': "BOS",
  Brazilië: "BRA",
  Canada: "CAN",
  Colombia: "COL",
  Congo: "COD",
  Curaçao: "CUR",
  Duitsland: "GER",
  Ecuador: "ECU",
  Egypte: "EGY",
  Engeland: "ENG",
  Frankrijk: "FRA",
  Ghana: "GHA",
  'Haïti': "HAI",
  Iran: "IRN",
  Irak: "IRQ",
  Ivoorkust: "IVO",
  Japan: "JPN",
  Jordanië: "JOR",
  Kaapverdië: "KAA",
  Kroatië: "CRO",
  Marokko: "MAR",
  Mexico: "MEX",
  Nederland: "NED",
  'Nieuw-Zeeland': "NZL",
  Noorwegen: "NOR",
  Oezbekistan: "UZB",
  Panama: "PAN",
  Paraguay: "PAR",
  Portugal: "POR",
  Qatar: "QAT",
  'Saoedi-Arabië': "SAU",
  Schotland: "SCO",
  Senegal: "SEN",
  Spanje: "ESP",
  Tsjechië: "CZE",
  Tunesië: "TUN",
  Turkije: "TUR",
  Uruguay: "URU",
  'Verenigde Staten': "USA",
  'Zuid-Afrika': "ZAF",
  'Zuid-Korea': "KOR",
  Zweden: "SWE",
  Zwitserland: "ZWI",
};

const CLUB_SHIRT: Record<string, string> = {
  Telstar: "tel",
  Sparta: "spa",
  'Go Ahead': "gae",
  AZ: "az",
  PSV: "psv",
  PEC: "pec",
  Feyenoord: "fey",
  Groningen: "gro",
  Heerenveen: "hee",
  Fortuna: "for",
  NAC: "nac",
  Ajax: "aja",
  Twente: "twe",
  NEC: "nec",
  Excelsior: "exc",
  Utrecht: "utr",
  Heracles: "her",
  Volendam: "vol",
  Algerije: "wk-alg",
  Argentinië: "wk-arg",
  Australië: "wk-aus",
  Oostenrijk: "wk-aut",
  België: "wk-bel",
  'Bosnië-Herzegovina': "wk-bih",
  Brazilië: "wk-bra",
  Canada: "wk-can",
  Colombia: "wk-col",
  Congo: "wk-cod",
  Curaçao: "wk-cuw",
  Duitsland: "wk-ger",
  Ecuador: "wk-ecu",
  Egypte: "wk-egy",
  Engeland: "wk-eng",
  Frankrijk: "wk-fra",
  Ghana: "wk-gha",
  'Haïti': "wk-hai",
  Iran: "wk-irn",
  Irak: "wk-irq",
  Ivoorkust: "wk-civ",
  Japan: "wk-jpn",
  Jordanië: "wk-jor",
  Kaapverdië: "wk-cpv",
  Kroatië: "wk-cro",
  Marokko: "wk-mar",
  Mexico: "wk-mex",
  Nederland: "wk-ned",
  'Nieuw-Zeeland': "wk-nzl",
  Noorwegen: "wk-nor",
  Oezbekistan: "wk-uzb",
  Panama: "wk-pan",
  Paraguay: "wk-par",
  Portugal: "wk-por",
  Qatar: "wk-qat",
  'Saoedi-Arabië': "wk-ksa",
  Schotland: "wk-sco",
  Senegal: "wk-sen",
  Spanje: "wk-esp",
  Tsjechië: "wk-cze",
  Tunesië: "wk-tun",
  Turkije: "wk-tur",
  Uruguay: "wk-uru",
  'Verenigde Staten': "wk-usa",
  'Zuid-Afrika': "wk-rsa",
  'Zuid-Korea': "wk-kor",
  Zweden: "wk-swe",
  Zwitserland: "wk-sui",
};

function toDutchDayAbbreviation(kickoffAt: string) {
  const day = new Date(kickoffAt).getDay();
  const labels = ["zon", "maa", "din", "woe", "don", "vri", "zat"];
  return labels[day] ?? "-";
}

function toClubCode(club: string) {
  return CLUB_CODE[club] ?? club.slice(0, 3).toUpperCase();
}

function toShirtClass(club: string) {
  return CLUB_SHIRT[club] ?? "default";
}

function toShortDate(kickoffAt: string) {
  const date = new Date(kickoffAt);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${day}-${month}`;
}

function chunkFixtures(fixtures: SeasonFixture[], perColumn: number) {
  const columns: SeasonFixture[][] = [];
  for (let index = 0; index < fixtures.length; index += perColumn) {
    columns.push(fixtures.slice(index, index + perColumn));
  }
  return columns;
}

function buildWorldCupGroupLookup(fixtures: SeasonFixture[]) {
  const groupStage = fixtures.filter((fixture) => fixture.round >= 1 && fixture.round <= 3);
  const parent = new Map<string, string>();

  const find = (team: string): string => {
    const current = parent.get(team);
    if (!current) {
      parent.set(team, team);
      return team;
    }
    if (current === team) {
      return team;
    }
    const root = find(current);
    parent.set(team, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(rb, ra);
    }
  };

  for (const fixture of groupStage) {
    union(fixture.home, fixture.away);
  }

  const groupsByRoot = new Map<string, string[]>();
  for (const team of parent.keys()) {
    const root = find(team);
    const list = groupsByRoot.get(root) ?? [];
    list.push(team);
    groupsByRoot.set(root, list);
  }

  const earliestKickoffByRoot = new Map<string, string>();
  for (const fixture of groupStage) {
    const root = find(fixture.home);
    const current = earliestKickoffByRoot.get(root);
    if (!current || fixture.kickoffAt < current) {
      earliestKickoffByRoot.set(root, fixture.kickoffAt);
    }
  }

  const rootsSorted = [...groupsByRoot.entries()]
    .sort((a, b) => {
      const kickoffA = earliestKickoffByRoot.get(a[0]) ?? "9999-12-31T23:59:59+00:00";
      const kickoffB = earliestKickoffByRoot.get(b[0]) ?? "9999-12-31T23:59:59+00:00";
      if (kickoffA !== kickoffB) {
        return kickoffA.localeCompare(kickoffB);
      }
      return a[1].slice().sort()[0].localeCompare(b[1].slice().sort()[0]);
    })
    .map(([root]) => root);

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const labelByRoot = new Map<string, string>();
  rootsSorted.forEach((root, index) => {
    labelByRoot.set(root, letters[index] ?? `X${index + 1}`);
  });

  const lookup = new Map<string, string>();
  for (const team of parent.keys()) {
    const root = find(team);
    const label = labelByRoot.get(root);
    if (label) {
      lookup.set(team, label);
    }
  }

  return lookup;
}

function getFixturePouleLabel(fixture: SeasonFixture, lookup: Map<string, string>) {
  const homeGroup = lookup.get(fixture.home);
  const awayGroup = lookup.get(fixture.away);
  if (!homeGroup || !awayGroup || homeGroup !== awayGroup) {
    return null;
  }
  return `Poule ${homeGroup}`;
}

function getCountdownParts(targetIso: string) {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  const safeDiff = Math.max(0, diffMs);
  const days = Math.floor(safeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((safeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((safeDiff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

export default function ManagerMyTeamPage() {
  const pathname = usePathname();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const scheduleFixtures = isWkMode ? WORLD_CUP_2026_FIXTURES : REMAINING_FIXTURES_2025_2026;
  const [budgetCapMillions, setBudgetCapMillions] = useState(() => getTransferBudgetCapMillions(isWkMode ? "wk" : "eredivisie"));
  const [wkSyncedMatches, setWkSyncedMatches] = useState<SyncedWkMatchLike[]>([]);
  const activeFixtures = useMemo(
    () => (isWkMode ? mergeWorldCupFixturesWithSyncedMatches(scheduleFixtures, wkSyncedMatches) : scheduleFixtures),
    [isWkMode, scheduleFixtures, wkSyncedMatches],
  );
  const clubLabel = isWkMode ? "Land" : "Club";
  const clubsLabel = isWkMode ? "landen" : "clubs";
  const searchLabel = isWkMode ? "Zoek speler/land" : "Zoek speler/club";
  const formationOptions = useMemo(() => getFormationOptions(), []);
  const currentRound = useMemo(() => getCurrentOrNextRound(activeFixtures, new Date()), [activeFixtures]);
  const roundNumbers = useMemo(
    () => Array.from(new Set(activeFixtures.map((fixture) => fixture.round))).sort((a, b) => a - b),
    [activeFixtures],
  );
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(() => {
    if (roundNumbers.length === 0) {
      return 0;
    }

    const currentIndex = currentRound ? roundNumbers.indexOf(currentRound) : -1;
    return currentIndex >= 0 ? currentIndex : 0;
  });
  const selectedRound = roundNumbers[selectedRoundIndex] ?? null;

  const [formation, setFormation] = useState(formationOptions[0]);
  const [allPlayers, setAllPlayers] = useState<EnhancedPlayer[]>(fallbackPlayers());
  const [state, setState] = useState<ZoneState<EnhancedPlayer>>(() =>
    buildBudgetDemoState(fallbackPlayers(), formationOptions[0], getTransferBudgetCapMillions("eredivisie")),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pendingSellId, setPendingSellId] = useState<string | null>(null);
  const [pendingBuyId, setPendingBuyId] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [allTeamPlayerIds, setAllTeamPlayerIds] = useState<Set<string>>(new Set());
  const [transfersLocked, setTransfersLocked] = useState(false);
  const [pendingSwap, setPendingSwap] = useState<{ zone: ZoneName; index: number; playerId: string } | null>(null);
  const [transferRound, setTransferRound] = useState<TransferRoundResponse["state"] | null>(null);
  const [currentTransferEntry, setCurrentTransferEntry] = useState<TransferRoundEntryStatus | null>(null);
  const [pendingTransferManagers, setPendingTransferManagers] = useState<TransferRoundResponse["pendingManagers"]>([]);
  const [blockedTransferPlayerIds, setBlockedTransferPlayerIds] = useState<string[]>([]);
  const [transferBusy, setTransferBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("ALL");
  const [selectedClub, setSelectedClub] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState(0);
  const [sellSelection, setSellSelection] = useState("");
  const [marketSortField, setMarketSortField] = useState<MarketSortField>("prijs");
  const [marketSortDirection, setMarketSortDirection] = useState<MarketSortDirection>("desc");
  const [marketPage, setMarketPage] = useState(1);

  const hydrated = useRef(false);
  const suppressNextPersist = useRef(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const initialRound =
          getCurrentOrNextRound(scheduleFixtures, new Date()) ??
          [...new Set(scheduleFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b)[0] ??
          1;

        const [playersResponse, managerStateResponse, leagueConfigResponse, ownedIdsResponse] = await Promise.all([
          fetch(`/api/players?mode=${isWkMode ? "wk" : "eredivisie"}&_t=${Date.now()}`, { cache: "no-store" }),
          fetch(`/api/manager/state?mode=${isWkMode ? "wk" : "eredivisie"}&roundNumber=${initialRound}&_t=${Date.now()}`, { cache: "no-store" }),
          fetch(`/api/admin/league-config?mode=${isWkMode ? "wk" : "eredivisie"}&_t=${Date.now()}`, { cache: "no-store" }),
          isWkMode
            ? fetch(`/api/wk/owned-player-ids?_t=${Date.now()}`, { cache: "no-store" })
            : Promise.resolve({ ok: true, json: async () => ({ ids: [] }) }),
        ]);

        if (!playersResponse.ok) {
          setError("Spelers konden niet geladen worden.");
          setLoading(false);
          return;
        }

        const playersData = (await playersResponse.json()) as { players: PlayerRecord[] };
        const managerData = managerStateResponse.ok
          ? ((await managerStateResponse.json()) as ManagerStateResponse)
          : { state: undefined };
        const leagueConfigData = leagueConfigResponse.ok
          ? ((await leagueConfigResponse.json()) as LeagueRuntimeConfigResponse)
          : { config: undefined };
        const fallbackBudgetCap = getTransferBudgetCapMillions(isWkMode ? "wk" : "eredivisie");
        const configBudgetCap = leagueConfigData.config?.budget?.teamValueCapMillions;
        const activeBudgetCap =
          typeof configBudgetCap === "number" && configBudgetCap > 0 ? configBudgetCap : fallbackBudgetCap;
        setBudgetCapMillions(activeBudgetCap);

        const enriched = enrichPlayers(playersData.players || []).sort(byPriceDesc);
        const nextPlayers = enriched.length > 0 ? enriched : fallbackPlayers();
        const savedFormation = managerData.state?.formation;
        const initialFormation =
          savedFormation && formationOptions.includes(savedFormation) ? savedFormation : formationOptions[0];

        setAllPlayers(nextPlayers);
        setFormation(initialFormation);

        // Filter out players owned by ANY team from the free agent pool
        if (ownedIdsResponse.ok) {
          const ownedData = (await ownedIdsResponse.json()) as { ids: number[] };
          setAllTeamPlayerIds(new Set(ownedData.ids.map(String)));
        }

        // Lock transfers + swaps tijdens een actieve speelronde
        setTransfersLocked(isRoundActive(initialRound));

        const managerLineupIds = managerData.state?.lineupIds ?? [];
        const managerBenchIds = managerData.state?.benchIds ?? [];
        const hasManagerPlayers = managerLineupIds.length > 0 || managerBenchIds.length > 0;

        const hydratedState = hasManagerPlayers
            ? buildStateFromSaved(
                nextPlayers,
                initialFormation,
                managerLineupIds,
                managerBenchIds,
              )
            : { formation: initialFormation, state: buildBudgetDemoState(nextPlayers, initialFormation, activeBudgetCap) };

        setFormation(hydratedState.formation);

        let nextState = isWithinBudget(
          [...hydratedState.state.lineup, ...hydratedState.state.bench],
          activeBudgetCap,
        )
          ? hydratedState.state
          : buildBudgetDemoState(nextPlayers, hydratedState.formation, activeBudgetCap);

        const savedPendingSellId = managerData.state?.pendingSellId ?? null;
        if (savedPendingSellId) {
          const playersWithoutSold = [...nextState.lineup, ...nextState.bench].filter(
            (player) => !player.id.startsWith("open-") && player.id !== savedPendingSellId,
          );
          const rebuilt = buildStateForFormationWithVacancies(playersWithoutSold, hydratedState.formation, 1);
          if (rebuilt) {
            nextState = rebuilt;
          }
        }
        setState(nextState);
        setPendingSellId(savedPendingSellId);
        setPendingBuyId(managerData.state?.pendingBuyId ?? managerData.state?.pickedTransferId ?? null);

        const maxAvailable = Math.max(0, ...nextPlayers.map((player) => player.prijs));
        setMaxPrice(maxAvailable);

        hydrated.current = true;
      } catch {
        setError("Netwerkfout bij het laden van spelers.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [formationOptions, isWkMode, scheduleFixtures]);

  useEffect(() => {
    if (!isWkMode || !selectedRound) {
      setWkSyncedMatches([]);
      return;
    }

    const controller = new AbortController();

    const loadWkMatches = async () => {
      try {
        const response = await fetch(`/api/wk/matches?round=${selectedRound}&_t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          setWkSyncedMatches([]);
          return;
        }

        const payload = (await response.json()) as WkMatchesApiResponse;
        const normalizedMatches: SyncedWkMatchLike[] = (payload.matches ?? []).map((match) => ({
          round: match.round,
          home_team: match.homeTeam,
          away_team: match.awayTeam,
          home_score: match.homeScore,
          away_score: match.awayScore,
          status: match.status,
          minute: match.minute,
          kickoff_at: match.kickoffAt,
        }));
        setWkSyncedMatches(normalizedMatches);
      } catch {
        setWkSyncedMatches([]);
      }
    };

    void loadWkMatches();

    return () => controller.abort();
  }, [isWkMode, selectedRound]);

  useEffect(() => {
    if (!hydrated.current || !selectedRound) {
      return;
    }

    const controller = new AbortController();

    const hydrateRoundState = async () => {
      try {
        const mode = isWkMode ? "wk" : "eredivisie";
        const [managerResponse, transferResponse] = await Promise.all([
          fetch(`/api/manager/state?mode=${mode}&roundNumber=${selectedRound}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/manager/transfer-round?mode=${mode}&roundNumber=${selectedRound}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (!managerResponse.ok) {
          return;
        }

        const managerData = (await managerResponse.json()) as ManagerStateResponse;
        const savedFormation = managerData.state?.formation;
        const nextFormation =
          savedFormation && formationOptions.includes(savedFormation) ? savedFormation : formationOptions[0];

        const roundLineupIds = managerData.state?.lineupIds ?? [];
        const roundBenchIds = managerData.state?.benchIds ?? [];
        const hasRoundPlayers = roundLineupIds.length > 0 || roundBenchIds.length > 0;

        const hydratedState = hasRoundPlayers
            ? buildStateFromSaved(
                allPlayers,
                nextFormation,
                roundLineupIds,
                roundBenchIds,
              )
            : { formation: nextFormation, state: buildBudgetDemoState(allPlayers, nextFormation, budgetCapMillions) };

        suppressNextPersist.current = true;
        setFormation(hydratedState.formation);
        setState(hydratedState.state);
        setTransfersLocked(isRoundActive(selectedRound));

        if (transferResponse.ok) {
          const transferData = (await transferResponse.json()) as TransferRoundResponse;
          setTransferRound(transferData.state);
          setCurrentTransferEntry(transferData.currentEntry);
          setPendingTransferManagers(transferData.pendingManagers);
          setBlockedTransferPlayerIds(transferData.blockedPlayerIds ?? []);
          setPendingSellId(transferData.currentEntry?.sellPlayerId ?? null);
          setPendingBuyId(transferData.currentEntry?.buyPlayerId ?? null);
        } else {
          setTransferRound(null);
          setCurrentTransferEntry(null);
          setPendingTransferManagers([]);
          setBlockedTransferPlayerIds([]);
          setPendingSellId(managerData.state?.pendingSellId ?? null);
          setPendingBuyId(managerData.state?.pendingBuyId ?? managerData.state?.pickedTransferId ?? null);
        }
      } catch {
        // no-op
      }
    };

    void hydrateRoundState();

    return () => controller.abort();
  }, [allPlayers, budgetCapMillions, formationOptions, isWkMode, selectedRound]);

  useEffect(() => {
    if (!hydrated.current) {
      return;
    }

    if (suppressNextPersist.current) {
      suppressNextPersist.current = false;
      return;
    }

    const { lineupIds, benchIds } = toPersistedIds(state);

    // Blokkeer persist van lege state — voorkomt dat demo/fallback spelers
    // per ongeluk de echte state overschrijven tijdens laad-race-conditions.
    if (lineupIds.length === 0 && benchIds.length === 0) {
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/manager/state?mode=${isWkMode ? "wk" : "eredivisie"}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formation,
        lineupIds,
        benchIds,
        pendingSellId,
        pendingBuyId,
        pickedTransferId: pendingBuyId,
        roundNumber: selectedRound,
        propagateToFutureRounds: true,
      }),
      signal: controller.signal,
    }).catch(() => {
      // no-op: UX blijft werken als persistence tijdelijk faalt
    });

    return () => controller.abort();
  }, [formation, isWkMode, pendingBuyId, pendingSellId, selectedRound, state]);

  const pitchRows = useMemo(() => {
    return buildPitchRows(formation, state.lineup);
  }, [formation, state.lineup]);

  const squadPlayers = useMemo(() => {
    return [...state.lineup, ...state.bench].filter((player) => !player.id.startsWith("open-"));
  }, [state.bench, state.lineup]);

  const remainingBudget = useMemo(
    () => calculateRemainingBudget(squadPlayers, budgetCapMillions),
    [budgetCapMillions, squadPlayers],
  );

  const marketPlayers = useMemo(() => {
    const { lineupIds, benchIds } = toPersistedIds(state);
    return buildMarketPlayers(allPlayers, lineupIds, benchIds, allTeamPlayerIds).filter(
      (player) => !blockedTransferPlayerIds.includes(player.id),
    );
  }, [allPlayers, allTeamPlayerIds, blockedTransferPlayerIds, state]);

  const availableClubs = useMemo(() => {
    return Array.from(new Set(marketPlayers.map((player) => player.club))).sort();
  }, [marketPlayers]);

  const maxAvailablePrice = useMemo(() => Math.max(0, ...marketPlayers.map((player) => player.prijs)), [marketPlayers]);

  useEffect(() => {
    setMaxPrice((current) => {
      if (maxAvailablePrice === 0) {
        return 0;
      }

      if (current <= 0 || current > maxAvailablePrice) {
        return maxAvailablePrice;
      }

      return current;
    });
  }, [maxAvailablePrice]);

  const filteredMarket = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matchingPlayers = marketPlayers.filter((player) => {
      const positionMatch = selectedPosition === "ALL" || player.positie === selectedPosition;
      const clubMatch = selectedClub === "ALL" || player.club === selectedClub;
      const searchMatch =
        query.length === 0 || player.naam.toLowerCase().includes(query) || player.club.toLowerCase().includes(query);
      const priceMatch = player.prijs <= maxPrice;

      return positionMatch && clubMatch && searchMatch && priceMatch;
    });

    return [...matchingPlayers].sort((left, right) => {
      let result = 0;

      if (marketSortField === "naam") {
        result = left.naam.localeCompare(right.naam, "nl", { sensitivity: "base" });
      } else if (marketSortField === "club") {
        result = left.club.localeCompare(right.club, "nl", { sensitivity: "base" });
      } else if (marketSortField === "positie") {
        const leftOrder = POSITION_SORT_ORDER[left.positie as Position] ?? 99;
        const rightOrder = POSITION_SORT_ORDER[right.positie as Position] ?? 99;
        result = leftOrder - rightOrder;
      } else if (marketSortField === "punten") {
        result = (left.punten ?? 0) - (right.punten ?? 0);
      } else {
        result = left.prijs - right.prijs;
      }

      if (result === 0) {
        result = left.naam.localeCompare(right.naam, "nl", { sensitivity: "base" });
      }

      return marketSortDirection === "asc" ? result : -result;
    });
  }, [marketPlayers, marketSortDirection, marketSortField, maxPrice, search, selectedClub, selectedPosition]);

  const marketTotalPages = Math.max(1, Math.ceil(filteredMarket.length / MARKET_PAGE_SIZE));
  const currentMarketPage = Math.min(marketPage, marketTotalPages);
  const pagedMarket = useMemo(() => {
    const startIndex = (currentMarketPage - 1) * MARKET_PAGE_SIZE;
    return filteredMarket.slice(startIndex, startIndex + MARKET_PAGE_SIZE);
  }, [currentMarketPage, filteredMarket]);

  useEffect(() => {
    setMarketPage(1);
  }, [selectedPosition, selectedClub, search, maxPrice, marketSortField, marketSortDirection]);

  useEffect(() => {
    if (marketPage > marketTotalPages) {
      setMarketPage(marketTotalPages);
    }
  }, [marketPage, marketTotalPages]);

  function toggleMarketSort(field: MarketSortField) {
    if (marketSortField === field) {
      setMarketSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setMarketSortField(field);
    setMarketSortDirection(field === "prijs" ? "desc" : "asc");
  }

  function sortIndicator(field: MarketSortField) {
    if (marketSortField !== field) {
      return "↕";
    }

    return marketSortDirection === "asc" ? "↑" : "↓";
  }


  const selectedRoundFixtures = useMemo(() => {
    if (!selectedRound) {
      return [] as SeasonFixture[];
    }

    return activeFixtures
      .filter((fixture) => fixture.round === selectedRound)
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  }, [activeFixtures, selectedRound]);

  const fixtureColumns = useMemo(() => chunkFixtures(selectedRoundFixtures, 3), [selectedRoundFixtures]);

  const wkGroupLookup = useMemo(() => {
    if (!isWkMode) {
      return new Map<string, string>();
    }
    return buildWorldCupGroupLookup(activeFixtures);
  }, [activeFixtures, isWkMode]);

  const roundCountdown = useMemo(() => {
    const firstFixture = selectedRoundFixtures[0];
    if (!firstFixture) {
      return null;
    }

    return getCountdownParts(firstFixture.kickoffAt);
  }, [selectedRoundFixtures]);

  const roundHasVisibleScores = useMemo(
    () => selectedRoundFixtures.some((fixture) => hasVisibleFixtureScore(fixture)),
    [selectedRoundFixtures],
  );

  const isPastRound = selectedRound !== null && currentRound !== null && selectedRound < currentRound;
  const currentTransferLimit = currentRound ? getTransferLimitForRound(currentRound, [...BONUS_ROUNDS]) : 1;
  const transferPhase = transferRound?.phase ?? "SELL";
  const ownTransferCanSell = currentTransferEntry?.sellStatus === "PENDING";
  const ownTransferCanBuy =
    (transferPhase === "BUY" || transferPhase === "AWAITING_RETRY") &&
    (currentTransferEntry?.buyStatus === "PENDING" || currentTransferEntry?.buyStatus === "RETRY_REQUIRED");
  const pendingTransferLabel =
    pendingTransferManagers.length > 0
      ? pendingTransferManagers.map((entry) => entry.teamName || entry.displayName).join(", ")
      : "niemand";

  async function syncTransferRound(action: "submit-sell" | "skip-sell" | "submit-buy", playerId?: string) {
    if (!selectedRound) {
      setTransferMessage("Geen actieve ronde geselecteerd.");
      return false;
    }

    setTransferBusy(true);
    try {
      const response = await fetch(`/api/manager/transfer-round?mode=${isWkMode ? "wk" : "eredivisie"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, roundNumber: selectedRound, playerId }),
      });
      const payload = (await response.json()) as TransferRoundResponse & { error?: string };
      if (!response.ok) {
        setTransferMessage(payload.error ?? "Transferactie mislukt.");
        return false;
      }

      setTransferRound(payload.state);
      setCurrentTransferEntry(payload.currentEntry);
      setPendingTransferManagers(payload.pendingManagers);
      setBlockedTransferPlayerIds(payload.blockedPlayerIds ?? []);
      setPendingSellId(payload.currentEntry?.sellPlayerId ?? null);
      setPendingBuyId(payload.currentEntry?.buyPlayerId ?? null);

      const managerStateResponse = await fetch(
        `/api/manager/state?mode=${isWkMode ? "wk" : "eredivisie"}&roundNumber=${selectedRound}`,
        { cache: "no-store" },
      );
      if (managerStateResponse.ok) {
        const managerData = (await managerStateResponse.json()) as ManagerStateResponse;
        const savedFormation = managerData.state?.formation;
        const nextFormation =
          savedFormation && formationOptions.includes(savedFormation) ? savedFormation : formationOptions[0];
        const hydratedState =
          managerData.state?.lineupIds || managerData.state?.benchIds
            ? buildStateFromSaved(
                allPlayers,
                nextFormation,
                managerData.state?.lineupIds ?? [],
                managerData.state?.benchIds ?? [],
              )
            : { formation: nextFormation, state: buildBudgetDemoState(allPlayers, nextFormation, budgetCapMillions) };
        suppressNextPersist.current = true;
        setFormation(hydratedState.formation);
        setState(hydratedState.state);
      }

      return true;
    } catch {
      setTransferMessage("Netwerkfout tijdens transferactie.");
      return false;
    } finally {
      setTransferBusy(false);
    }
  }

  const scheduleSubtitle = useMemo(() => {
    if (!selectedRound || selectedRoundFixtures.length === 0) {
      return <p>Opstelling, wissels en transfermarkt in één overzicht.</p>;
    }

    return (
      <div className="round-schedule" data-testid="team-round-schedule">
        <div className="round-schedule-head">
          <button
            type="button"
            className="round-nav-button"
            onClick={() => setSelectedRoundIndex((index) => Math.max(0, index - 1))}
            disabled={selectedRoundIndex === 0}
            aria-label="Vorige speelronde"
          >
            ‹
          </button>

          <div className="round-title-wrap">
            <span className="round-title-label">Ronde</span>
            <strong className="round-title-value">{selectedRound}</strong>
          </div>

          {isPastRound || roundHasVisibleScores ? (
            <div className="round-result-pill">Uitslagen</div>
          ) : roundCountdown ? (
            <div className="round-countdown" aria-label="Start volgende speelronde">
              <span className="round-countdown-start">START</span>
              <span>{roundCountdown.days}d</span>
              <span>{roundCountdown.hours}u</span>
              <span>{roundCountdown.minutes}m</span>
            </div>
          ) : null}

          <button
            type="button"
            className="round-nav-button"
            onClick={() => setSelectedRoundIndex((index) => Math.min(roundNumbers.length - 1, index + 1))}
            disabled={selectedRoundIndex >= roundNumbers.length - 1}
            aria-label="Volgende speelronde"
          >
            ›
          </button>
        </div>

        <div className="round-fixtures-grid">
          {fixtureColumns.map((column, columnIndex) => (
            <ul key={`fixture-column-${columnIndex}`} className="round-fixture-column">
              {column.map((fixture) => {
                const fixtureHasVisibleScore = hasVisibleFixtureScore(fixture);
                const showFixtureScore = isWkMode ? fixtureHasVisibleScore : isPastRound;
                const fixtureIsLive = fixtureHasVisibleScore && isLiveWkMatchStatus(fixture.status);
                const liveMinuteLabel = getWkMatchLiveMinuteLabel(fixture.minute, fixture.status);
                const fixtureTimeClassName = [
                  "fixture-time",
                  showFixtureScore ? "fixture-time--scored" : null,
                  fixtureIsLive ? "fixture-time--live" : null,
                  showFixtureScore && !fixtureIsLive ? "fixture-time--finished" : null,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                <li key={`${fixture.kickoffAt}-${fixture.home}-${fixture.away}`} className="round-fixture-row">
                  <span className="fixture-team fixture-team--home">
                    <span className="fixture-team-code">{toClubCode(fixture.home)}</span>
                    <span className={`team-shirt team-shirt--${toShirtClass(fixture.home)}`} aria-hidden="true" />
                  </span>
                  <span className={fixtureTimeClassName}>
                    {showFixtureScore ? (
                      <>
                        <strong className="fixture-score">
                          {fixture.homeScore ?? "-"} - {fixture.awayScore ?? "-"}
                        </strong>
                        {fixtureIsLive && liveMinuteLabel ? (
                          <small className="fixture-live-minute" aria-label={`Wedstrijd bezig: ${liveMinuteLabel}`}>
                            {liveMinuteLabel}
                          </small>
                        ) : null}
                        {isWkMode ? <small>{getFixturePouleLabel(fixture, wkGroupLookup) ?? "Knock-out"}</small> : null}
                      </>
                    ) : (
                      <>
                        {toDutchDayAbbreviation(fixture.kickoffAt)} {fixture.kickoff}
                        <small>{toShortDate(fixture.kickoffAt)}</small>
                        {isWkMode ? <small>{getFixturePouleLabel(fixture, wkGroupLookup) ?? "Knock-out"}</small> : null}
                      </>
                    )}
                  </span>
                  <span className="fixture-team fixture-team--away">
                    <span className="fixture-team-code">{toClubCode(fixture.away)}</span>
                    <span className={`team-shirt team-shirt--${toShirtClass(fixture.away)}`} aria-hidden="true" />
                  </span>
                </li>
              )})}
            </ul>
          ))}
        </div>
      </div>
    );
  }, [
    fixtureColumns,
    isPastRound,
    isWkMode,
    roundCountdown,
    roundHasVisibleScores,
    roundNumbers.length,
    selectedRound,
    selectedRoundFixtures,
    selectedRoundIndex,
    wkGroupLookup,
  ]);

  function handleFormationChange(nextFormation: string) {
    const nonOpen = [...state.lineup, ...state.bench].filter((player) => !player.id.startsWith("open-"));
    const openCount = countOpenSlots(state);

    if (openCount > 0) {
      const rebuilt = buildStateForFormationWithVacancies(nonOpen, nextFormation, openCount);
      if (!rebuilt) {
        setTransferMessage("je kunt niet in deze formatie spelen met deze spelers");
        return;
      }

      setFormation(nextFormation);
      setState(rebuilt);
      return;
    }

    const rebuilt = buildStateWithVacancies(nonOpen.length > 0 ? nonOpen : allPlayers, nextFormation, 0);
    if (!rebuilt) {
      setTransferMessage("je kunt niet in deze formatie spelen met deze spelers");
      return;
    }
    setFormation(nextFormation);
    setState(rebuilt);
  }

  function onDragStart(zone: ZoneName, index: number) {
    return (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData("text/plain", JSON.stringify({ zone, index }));
      event.dataTransfer.effectAllowed = "move";
    };
  }

  function onDrop(targetZone: ZoneName, targetIndex: number) {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("text/plain");
      if (!raw) return;

      const parsed = JSON.parse(raw) as { zone: ZoneName; index: number };
      setState((prev) =>
        reorderAcrossZones(
          prev,
          {
            sourceZone: parsed.zone,
            sourceIndex: parsed.index,
            targetZone,
            targetIndex,
          },
          {
            enforceLineupPosition: true,
            getPosition: (player) => player.positie,
          },
        ),
      );
    };
  }

  function handleSwapClick(zone: ZoneName, index: number) {
    if (transfersLocked) return;

    const clickedPlayer = state[zone][index];
    if (!clickedPlayer || clickedPlayer.id.startsWith("open-")) return;

    // If same player clicked again → deselect
    if (pendingSwap && pendingSwap.playerId === clickedPlayer.id) {
      setPendingSwap(null);
      return;
    }

    // If a player is already selected for swap
    if (pendingSwap) {
      const pendingPlayer = state[pendingSwap.zone][pendingSwap.index];
      if (!pendingPlayer) {
        setPendingSwap(null);
        return;
      }

      // Must be opposite zones and same position
      if (pendingSwap.zone === zone) {
        // Same zone — switch selection to this player
        setPendingSwap({ zone, index, playerId: clickedPlayer.id });
        return;
      }

      if (pendingPlayer.positie !== clickedPlayer.positie) {
        // Different position — not allowed, show briefly then clear
        setPendingSwap(null);
        return;
      }

      // Execute the swap
      setState((prev) =>
        reorderAcrossZones(
          prev,
          { sourceZone: pendingSwap.zone, sourceIndex: pendingSwap.index, targetZone: zone, targetIndex: index },
          { enforceLineupPosition: true, getPosition: (player) => player.positie },
        ),
      );
      setPendingSwap(null);
      return;
    }

    // No pending swap — select this player
    setPendingSwap({ zone, index, playerId: clickedPlayer.id });
  }

  function handlePickIncoming(player: EnhancedPlayer) {
    if (!ownTransferCanBuy) {
      setTransferMessage("Je kunt nu nog geen speler kopen.");
      return;
    }

    const alreadyInSquad = squadPlayers.some((squadPlayer) => squadPlayer.id === player.id);
    if (alreadyInSquad) {
      setTransferMessage("Deze speler zit al in je team.");
      return;
    }

    void syncTransferRound("submit-buy", player.id).then((ok) => {
      if (!ok) {
        return;
      }

      if (transferPhase === "AWAITING_RETRY") {
        setTransferMessage("Nieuwe koopkeuze opgeslagen. Zodra alle verliezende managers opnieuw gekozen hebben, wordt opnieuw beslist.");
        return;
      }

      setTransferMessage("Koopkeuze opgeslagen. Zodra iedereen klaar is, wordt de transferfase automatisch afgehandeld.");
    });
  }

  return (
    <AppShell title="Team" subtitle={scheduleSubtitle}>
      <div className="grid">
        <section className="card col-8">
          <div className="team-topbar" aria-label="Team overzicht">
            <div className="team-topbar__metric team-topbar__metric--left">
              <span>Resterende waarde</span>
              <strong>€ {remainingBudget.toFixed(1)}M</strong>
            </div>
            <div className="team-topbar__metric team-topbar__metric--center">
              <span>Totaal punten</span>
              <strong>{(() => {
                const lineupPts = state.lineup.reduce((sum, p) => sum + p.punten, 0);
                const benchPts = state.bench.reduce((sum, p) => sum + Math.ceil(p.punten / 2), 0);
                return lineupPts + benchPts;
              })()}</strong>
            </div>
            <label className="formation-select team-topbar__formation">
              <span>Formatie</span>
              <select value={formation} onChange={(event) => handleFormationChange(event.target.value)} data-testid="formation-select">
                {formationOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="formation-header">
            <h2>Basiselftal</h2>
          </div>

          {loading ? <p className="muted-note">Spelers laden...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="pitch">
            {pitchRows.map((row, rowIndex) => {
              const rowStart = pitchRows.slice(0, rowIndex).reduce((sum, current) => sum + current.length, 0);

              return (
                <div key={`row-${rowIndex}`} className="pitch-row" data-size={row.length}>
                  {row.map((player, colIndex) => {
                    const lineupIndex = rowStart + colIndex;
                    const cardMeta = getPlayerCardMeta(player);

                    return (
                      <PlayerCard
                        key={`lineup-${lineupIndex}-${player.id}`}
                        data-testid={`lineup-card-${lineupIndex}`}
                        draggable={!player.id.startsWith("open-")}
                        inactive={player.inactive === true}
                        position={cardMeta.flag}
                        club={cardMeta.countryCode}
                        name={cardMeta.displayName}
                        pointsLabel={cardMeta.priceLabel}
                        scoreBadge={!player.id.startsWith("open-") ? String(player.punten) : null}
                        className={[
                          pendingSellId === player.id ? "player-card--sell" : "",
                          pendingSwap?.playerId === player.id ? "player-card--swap-selected" : "",
                          player.id.startsWith("open-") ? "player-card--open" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
                        onDragStart={onDragStart("lineup", lineupIndex)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={onDrop("lineup", lineupIndex)}
                      >
                        {!player.id.startsWith("open-") && !player.inactive && !transfersLocked ? (
                          <button
                            type="button"
                            className="swap-button"
                            onClick={(event) => { event.stopPropagation(); handleSwapClick("lineup", lineupIndex); }}
                            title="Wissel met bank"
                            aria-label="Wissel met bank"
                          >
                            ↻
                          </button>
                        ) : null}
                      </PlayerCard>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </section>

        <section className="card col-4">
          <h2>Wisselspelers</h2>
          <div className="bench-grid">
            {state.bench.slice(0, BENCH_LIMIT).map((player, benchIndex) => {
              const cardMeta = getPlayerCardMeta(player);

              return (
                <PlayerCard
                  key={`bench-${benchIndex}-${player.id}`}
                  data-testid={`bench-card-${benchIndex}`}
                  draggable={!player.id.startsWith("open-")}
                  inactive={player.inactive === true}
                  position={cardMeta.flag}
                  club={cardMeta.countryCode}
                  name={player.naam}
                  pointsLabel={cardMeta.priceLabel}
                  scoreBadge={!player.id.startsWith("open-") ? String(Math.ceil(player.punten / 2)) : null}
                  className={[
                    "player-card--bench-row",
                    pendingSellId === player.id ? "player-card--sell" : "",
                    pendingSwap?.playerId === player.id ? "player-card--swap-selected" : "",
                    player.id.startsWith("open-") ? "player-card--open" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined}
                  onDragStart={onDragStart("bench", benchIndex)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDrop("bench", benchIndex)}
                >
                  {!player.id.startsWith("open-") && !player.inactive && !transfersLocked ? (
                    <button
                      type="button"
                      className="swap-button"
                      onClick={(event) => { event.stopPropagation(); handleSwapClick("bench", benchIndex); }}
                      title="Wissel met basis"
                      aria-label="Wissel met basis"
                    >
                      ↻
                    </button>
                  ) : null}
                </PlayerCard>
              );
            })}
          </div>
        </section>


        <section className="card col-12" id="transfermarkt">
          <h2>Transfermarkt</h2>

          {transfersLocked ? (
            <div className="alert alert-warning" data-testid="transfers-locked-banner">
              ⏸️ <strong>Transfers gesloten.</strong> De speelronde is bezig. Transfers zijn alleen mogelijk tussen de speelrondes.
            </div>
          ) : null}
          <div className="transfer-status-wrap" style={{ marginBottom: 16 }}>
            <p className="muted-note">
              Fase: <strong>{transferPhase === "SELL" ? "1 · verkopen/skippen" : transferPhase === "BUY" ? "2 · kopen" : transferPhase === "AWAITING_RETRY" ? "4 · verliezers kiezen opnieuw" : "4 · afgerond"}</strong>
            </p>
            <p className="muted-note">
              Wachten op: <strong>{pendingTransferLabel}</strong>
            </p>
            {currentTransferEntry?.buyStatus === "RETRY_REQUIRED" ? (
              <p className="error-text">Je hebt een conflict verloren op ranglijstprioriteit en moet vóór de volgende ronde opnieuw een speler kiezen.</p>
            ) : null}
            {currentTransferEntry?.resolvedTransfer ? (
              <p className="success-text">Jouw transfer is verwerkt voor deze ronde.</p>
            ) : null}
          </div>

          <div className="grid transfer-controls">
            <label className="col-4">
              1) Verkoop speler
              <select
                value={sellSelection}
                onChange={(event) => {
                  setSellSelection(event.target.value);
                }}
                data-testid="sell-player-select"
                disabled={!ownTransferCanSell || transferBusy || transfersLocked}
              >
                <option value="skip">Niemand verkopen</option>
                {squadPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {withCountryFlag(player.club, player.naam)} ({player.positie}) - {player.club}
                  </option>
                ))}
              </select>
              {ownTransferCanSell ? (
                <>
                  <small className="transfer-hint">Je mag 1 speler verkopen of expliciet kiezen voor geen transfer.</small>
                  <button
                    type="button"
                    onClick={() => {
                      const playerId = sellSelection;
                      if (playerId === "skip" || !playerId) {
                        void syncTransferRound("skip-sell").then((ok) => {
                          if (ok) {
                            setTransferMessage("Je hebt gekozen om niemand te verkopen deze ronde.");
                          }
                        });
                      } else {
                        const player = squadPlayers.find((p) => p.id === playerId);
                        if (!player) return;
                        void syncTransferRound("submit-sell", playerId).then((ok) => {
                          if (ok) {
                            setTransferMessage(`Je hebt ${player.naam} verkocht. We wachten tot alle managers fase 1 hebben afgerond.`);
                          }
                        });
                      }
                    }}
                    disabled={transferBusy || !sellSelection}
                    style={{ marginTop: 8 }}
                  >
                    {sellSelection === "skip" || !sellSelection
                      ? "Niemand verkopen"
                      : `${(() => {
                          const player = squadPlayers.find((p) => p.id === sellSelection);
                          return player ? player.naam : "";
                        })()} verkopen`}
                  </button>
                </>
              ) : !currentTransferEntry ? (
                <small className="transfer-hint">
                  Transfergroep voor deze ronde wordt geladen.
                </small>
              ) : currentTransferEntry.sellStatus === "SKIPPED" ? (
                <small className="transfer-hint">
                  Je hebt deze ronde gekozen om niemand te verkopen.
                </small>
              ) : currentTransferEntry.sellPlayerId ? (
                <small className="transfer-hint">Verkoopkeuze staat vast voor deze ronde.</small>
              ) : null}
            </label>

            <label className="col-2">
              Positie
              <select
                value={selectedPosition}
                onChange={(event) => setSelectedPosition(event.target.value)}
                data-testid="transfer-position"
                disabled={transfersLocked}
              >
                <option value="ALL">Alle posities</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
            </label>

            <label className="col-3">
              {clubLabel}
              <select value={selectedClub} onChange={(event) => setSelectedClub(event.target.value)} data-testid="transfer-club" disabled={transfersLocked}>
                <option value="ALL">Alle {clubsLabel}</option>
                {availableClubs.map((club) => (
                  <option key={club} value={club}>
                    {club}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-3">
              {searchLabel}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Bijv. Veerman"
                data-testid="transfer-search"
                disabled={transfersLocked}
              />
            </label>

            <label className="col-6 transfer-price-filter">
              Transferwaarde t/m € {maxPrice.toFixed(2)}M
              <input
                type="range"
                min={0}
                max={maxAvailablePrice || 0}
                step={0.1}
                value={maxPrice}
                onChange={(event) => setMaxPrice(Number(event.target.value))}
                data-testid="transfer-price-slider"
                disabled={transfersLocked}
              />
            </label>

            <div className="col-6 transfer-status-wrap">
              <p className="muted-note">
                Resultaten: {filteredMarket.length} • Pagina {currentMarketPage}/{marketTotalPages}
              </p>
              <p className="muted-note">Transferlimiet deze ronde: {currentTransferLimit}</p>
              {transferMessage ? <p className="success-text">{transferMessage}</p> : null}
            </div>
          </div>

          <div className="table-wrap">
            <div className="table-pagination" aria-label="Paginering transfermarkt boven">
              <button
                type="button"
                onClick={() => setMarketPage((page) => Math.max(1, page - 1))}
                disabled={currentMarketPage <= 1}
                data-testid="market-page-prev-top"
              >
                ← Vorige
              </button>
              <span className="muted-note" data-testid="market-page-indicator-top">
                Pagina {currentMarketPage} van {marketTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setMarketPage((page) => Math.min(marketTotalPages, page + 1))}
                disabled={currentMarketPage >= marketTotalPages}
                data-testid="market-page-next-top"
              >
                Volgende →
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="sortable-header-button"
                      onClick={() => toggleMarketSort("naam")}
                      data-testid="sort-name"
                    >
                      Speler {sortIndicator("naam")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortable-header-button"
                      onClick={() => toggleMarketSort("positie")}
                      data-testid="sort-position"
                    >
                      Positie {sortIndicator("positie")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortable-header-button"
                      onClick={() => toggleMarketSort("club")}
                      data-testid="sort-club"
                    >
                      {clubLabel} {sortIndicator("club")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortable-header-button"
                      onClick={() => toggleMarketSort("punten")}
                      data-testid="sort-points"
                    >
                      Punten {sortIndicator("punten")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortable-header-button"
                      onClick={() => toggleMarketSort("prijs")}
                      data-testid="sort-price"
                    >
                      Transferwaarde {sortIndicator("prijs")}
                    </button>
                  </th>
                  <th>Beschikb.</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {pagedMarket.map((item, index) => (
                  <tr key={item.id} data-testid={`transfer-row-${index}`}>
                    <td><TransferPlayerName player={item} /></td>
                    <td>{item.positie}</td>
                    <td>{item.club}</td>
                    <td>{item.punten}</td>
                    <td>€ {item.prijs.toFixed(2)}M</td>
                    <td style={{ textAlign: "center" }}>{item.owned ? "❌" : "✅"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handlePickIncoming(item)}
                        disabled={!ownTransferCanBuy || transferBusy || transfersLocked || item.owned}
                        data-testid={`transfer-pick-${index}`}
                      >
                        {pendingBuyId === item.id ? "Geselecteerd" : "Koop"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-pagination table-pagination--bottom" aria-label="Paginering transfermarkt onder">
              <button
                type="button"
                onClick={() => setMarketPage((page) => Math.max(1, page - 1))}
                disabled={currentMarketPage <= 1}
                data-testid="market-page-prev-bottom"
              >
                ← Vorige
              </button>
              <span className="muted-note" data-testid="market-page-indicator-bottom">
                Pagina {currentMarketPage} van {marketTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setMarketPage((page) => Math.min(marketTotalPages, page + 1))}
                disabled={currentMarketPage >= marketTotalPages}
                data-testid="market-page-next-bottom"
              >
                Volgende →
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
