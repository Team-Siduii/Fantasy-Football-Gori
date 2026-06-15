# WK punten database-only + teamhistorie implementation plan

> **For Hermes:** voer dit plan taak-voor-taak uit met TDD en houd `docs/functioneel-design.md` synchroon.

**Goal:** Zorg dat WK-punten overal uitsluitend uit de database komen, dat de ruwe WKCoach-events de bron blijven maar de uiteindelijke punten door onze eigen rekenregels worden bepaald, en dat draftdata volledig losstaat van latere team- en puntensnapshots.

**Architecture:** We splitsen het probleem in drie expliciete bronnen: (1) draft-bron voor initiële selectie/pickhistorie, (2) manager/team-snapshots per ronde voor de feitelijke opstelling/bench van dat moment, en (3) berekende team-puntensnapshots per ronde op basis van database-events. Ranking, teamview en my-team lezen daarna uit dezelfde score-service in plaats van losse ad-hoc berekeningen.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL (`pg`), persistente JSON fallback store, Vitest.

---

## Scopebesluiten

1. **Database only voor WK-punten**
   - Geen ranking/view mag nog punten uit CSV of `derivePlayerPoints()` halen voor WK.
   - CSV blijft alleen bron voor statische metadata: naam, positie, club, prijs.

2. **WKCoach events zijn input, niet eindscore**
   - `wk_player_events` blijft de ruwe eventbron uit WKCoach.
   - `wk_player_points` mag niet langer als autoritatieve eindscore worden vertrouwd voor businesslogica.
   - We berekenen onze eigen round/total player points vanuit events + eigen regels (o.a. clean-sheet-correctie voor verdedigers).

3. **Draft en teams volledig ontkoppelen na seeding**
   - Draft-state en team-roster-state blijven historische/admin artefacten van de draftkamer.
   - Teamweergave, ranking en scoreberekening mogen na draft niet meer impliciet terugsyncen vanuit draft-state.
   - Alleen een expliciete seed/repairflow mag draftdata omzetten naar manager/team snapshots.

4. **Behaalde teampunten zijn aparte datastore**
   - Historische teampunten per ronde worden opgeslagen als aparte team-score snapshots.
   - We rekenen niet telkens terug vanaf het huidige team, omdat transfers de oude ronde-opstelling ongeldig maken.

---

## Wijzigingsgebieden

- `src/lib/wk-sync-store.ts`
- `src/lib/league-ranking.ts`
- `src/lib/draft-manager-sync.ts`
- `src/lib/manager-state.ts`
- `src/app/api/manager/view-team/route.ts`
- `src/app/api/manager/subpoule-summary/route.ts`
- `src/app/api/manager/league-ranking/route.ts`
- `src/app/api/players/route.ts`
- `src/app/api/manager/state/route.ts`
- `src/lib/persistent-json-store.ts`
- nieuwe libs voor scoreberekening / team-history snapshots
- tests in `tests/lib/*`
- `docs/functioneel-design.md`

---

## Task 1: Leg de nieuwe domeinregels vast in het functioneel design

**Objective:** Documenteer expliciet dat WK-punten database-only zijn, dat events de input vormen voor eigen scoring, en dat draft niet langer de live teambron is.

**Files:**
- Modify: `docs/functioneel-design.md`
- Create: `docs/plans/2026-06-15-wk-punten-database-team-history-plan.md`

**Implementation notes:**
- Werk secties 4.4 (Draft), 4.5 (Transfers), competitie/ranking en requirements bij.
- Voeg requirements toe voor:
  - database-only WK puntenbron
  - event-based recalculatie met eigen scoring rules
  - aparte team score snapshots per ronde
  - draft alleen als seed/historische bron

**Verification:**
- Lees relevante ranges na met `read_file`.
- Zoek op oude tegenstrijdige termen zoals “draft synchroniseert direct naar manager-state” en herschrijf die waar nodig.

---

## Task 2: Voeg een aparte persistente store toe voor team score snapshots

**Objective:** Maak een nieuwe datastore voor behaalde teampunten per manager per ronde.

**Files:**
- Modify: `src/lib/persistent-json-store.ts`
- Create: `src/lib/team-score-state.ts`
- Test: `tests/lib/team-score-state.test.ts`

**Design:**
- Nieuwe store key: `team-score-state`
- Snapshotvorm per manager/per ronde:
  - `roundNumber`
  - `lineupIds`
  - `benchIds`
  - `lineupPoints`
  - `benchPoints`
  - `totalPoints`
  - `calculatedAt`
  - optioneel `source: "wk-events-v1"`
- Helpers:
  - `readTeamScoreStatePersistent(scope)`
  - `saveTeamScoreSnapshotPersistent(scope, managerKey, snapshot)`
  - `getManagerRoundScorePersistent(scope, managerKey, roundNumber)`
  - `getManagerScoreSummaryPersistent(scope, managerKey)`

**TDD:**
1. Test dat snapshots per manager en ronde persistent worden opgeslagen.
2. Test dat cumulative summary correct optelt.
3. Test dat ontbrekende rondes veilig 0 teruggeven.

---

## Task 3: Bouw een centrale WK player scoring service op basis van database-events

**Objective:** Maak één service die de definitieve WK spelerpunten per ronde en cumulatief berekent uit DB-events, niet uit CSV of ruwe total_points.

**Files:**
- Create: `src/lib/wk-player-scoring.ts`
- Modify: `src/lib/wk-sync-store.ts`
- Test: `tests/lib/wk-player-scoring.test.ts`

**Design:**
- Exporteer helpers zoals:
  - `calculateWkPlayerRoundPointsFromEvents(...)`
  - `buildWkPlayerRoundPointsMap(round)`
  - `buildWkPlayerTotalPointsMapThroughRound(round)`
- Regels:
  - gebruik `wk_player_events` als basis
  - clean sheet voor verdedigers corrigeren naar gewenste Gori-regel
  - berekening moet deterministisch en repeatable zijn
- `wk_player_points` blijft metadata/ingest snapshot, maar businesslogica leest de berekende values.

**TDD:**
1. Test dat defender clean-sheet bonus afwijkt van WKCoach wanneer events `CS` bevatten.
2. Test dat niet-verdedigers geen extra CS-bonus krijgen.
3. Test dat total points worden opgebouwd uit meerdere rondes.

---

## Task 4: Stop impliciete draft->team synchronisatie in live read paths

**Objective:** Zorg dat lezen van team/ranking/state niet langer automatisch draftdata naar manager-state blijft trekken.

**Files:**
- Modify: `src/lib/draft-manager-sync.ts`
- Modify: `src/app/api/manager/state/route.ts`
- Modify: `src/app/api/manager/view-team/route.ts`
- Modify: `src/lib/league-ranking.ts`
- Test: `tests/lib/draft-manager-sync.test.ts`

**Design:**
- Verwijder/stop live repaircalls op read paths die draft-state als fallback gebruiken.
- Introduceer een expliciete seed/repair helper, bijv.:
  - `seedManagerTeamFromDraftPersistent(...)`
  - alleen bedoeld voor draft completion / admin repair
- Bestaande current-state reads moeten alleen manager/team snapshots vertrouwen.

**TDD:**
1. Test dat `view-team`/ranking geen draft sync meer triggeren.
2. Test dat expliciete seed wel werkt bij lege manager-state.
3. Test dat corrupte partial state niet stilzwijgend door draft-readpath wordt “verstopt”.

---

## Task 5: Maak ronde-snapshots de enige bron voor historische teampunten

**Objective:** Borg dat teampunten per ronde worden gekoppeld aan de opstelling van die ronde, niet aan het huidige team.

**Files:**
- Modify: `src/lib/manager-state.ts`
- Create: `src/lib/team-score-engine.ts`
- Test: `tests/lib/team-score-engine.test.ts`

**Design:**
- Gebruik `roundStates` als historische teamopstelling per manager.
- Voor elke ronde:
  - lees de lineup/bench snapshot van die ronde
  - haal player round points uit `wk-player-scoring`
  - bereken team round result
  - persist naar `team-score-state`
- Voeg helper toe:
  - `recalculateManagerRoundScorePersistent(scope, managerKey, roundNumber)`
  - `recalculateAllManagerRoundScoresPersistent(scope, roundNumber)`

**TDD:**
1. Test dat een transfer in ronde 2 ronde-1 score niet verandert.
2. Test dat bench half meetelt volgens bestaande regel.
3. Test dat cumulative total = som van opgeslagen rondescores.

---

## Task 6: Koppel sync-ingest direct aan herberekening van team scores

**Objective:** Na een WK sync moet de app de relevante player scores én team round snapshots opnieuw berekenen.

**Files:**
- Modify: `src/app/api/wk/sync-points/route.ts`
- Modify: `src/app/api/wk/sync-points-ingest/route.ts`
- Modify: `src/lib/wk-sync-store.ts`
- Test: `tests/lib/wk-sync-store.test.ts` of `tests/lib/wk-player-scoring.test.ts`

**Design:**
- Na event save voor een round:
  - recalc player round maps
  - recalc team round score snapshots voor alle accepted managers in WK mode
- Response van sync endpoint mag teruggeven:
  - `recalculatedManagersCount`
  - `recalculatedRound`

---

## Task 7: Laat alle manager-facing WK endpoints dezelfde score service gebruiken

**Objective:** Ranking, team-view, subpoule summary en player list moeten één consistente WK scorebron gebruiken.

**Files:**
- Modify: `src/lib/league-ranking.ts`
- Modify: `src/app/api/manager/view-team/route.ts`
- Modify: `src/app/api/manager/subpoule-summary/route.ts`
- Modify: `src/app/api/players/route.ts`
- Test: `tests/lib/league-ranking.test.ts`
- Test: nieuwe route/lib tests waar nodig

**Design:**
- `league-ranking` leest team totals uit `team-score-state`
- `view-team` toont spelerpunten uit `wk-player-scoring` en team total/current round vanuit dezelfde bron
- `subpoule-summary` leest team cumulative score uit `team-score-state`
- `/api/players?mode=wk` toont alleen DB/event-based berekende punten

**TDD:**
1. Test dat ranking niet meer overal 0 teruggeeft als events aanwezig zijn.
2. Test dat ranking en subpoule summary dezelfde teamscore tonen.
3. Test dat spelersroute geen ruwe `total_points` van WKCoach vertrouwt bij defender clean sheets.

---

## Task 8: Corrupte manager-state van Simon veilig herstellen zonder draft als live bron te houden

**Objective:** Repareer bestaande productie-data door een eenmalige seed/backfill uit draft artefacten naar manager/team snapshots te doen, daarna loskoppelen.

**Files:**
- Create or modify: `src/lib/gori-state-integrity.ts`
- Create: admin/backfill helper of script (repo-conform)
- Test: `tests/lib/gori-state-integrity.test.ts` of `tests/lib/draft-manager-sync.test.ts`

**Design:**
- Expliciete backfillflow:
  - als manager-state aantoonbaar corrupt is (bijv. 1 speler) en draft completed 15 picks heeft
  - seed manager round snapshot voor initiële ronde
  - schrijf géén blijvende read-time dependency op draft
- Integriteitsregels:
  - accepted manager in WK draft => verwacht 15 seeded spelers bij ronde 1 start
  - mismatch rapporteren

---

## Task 9: End-to-end validatie, docs sync en productie-deploy

**Objective:** Verifieer regressies, werk docs bij en zet de wijziging live.

**Files:**
- Modify: `docs/functioneel-design.md`
- Possibly modify/add tests under `tests/lib/*`

**Verification commands:**
- `npx vitest run tests/lib/wk-player-scoring.test.ts`
- `npx vitest run tests/lib/team-score-engine.test.ts`
- `npx vitest run tests/lib/league-ranking.test.ts tests/lib/draft-manager-sync.test.ts`
- `npm run build`

**Production verification:**
- Login als Simon
- Controleer:
  - team heeft correcte seeded/huidige spelers
  - ranking toont niet overal 0
  - Simon score komt overeen met opgeslagen team-score snapshots
  - transferwijziging in latere ronde verandert eerdere ronde-score niet

---

## Acceptatiecriteria

- WK-ranking leest geen spelerpunten meer uit CSV/`derivePlayerPoints()`.
- WK spelerpunten worden bepaald uit database-events + Gori-scoringregels.
- Defender clean-sheet punten volgen de Gori-regel, niet blind WKCoach totals.
- Draft-state is niet langer impliciete live bron voor manager/team reads.
- Historische teampunten blijven stabiel wanneer een team later via transfers verandert.
- Team total/current round in ranking, subpoule summary, my-team en view-team zijn consistent.
- Productie toont Simon met correct team en niet langer met een 1-speler state.

---

## Risico’s / let op

- `manager-state` bevat legacy fallback-gedrag; let op backward compatibility.
- Live read paths mogen geen verborgen self-heal meer doen die state maskeert.
- Recalc mag productie niet blokkeren; werk ronde-gericht en deterministic.
- Backfill moet idempotent zijn zodat reruns veilig zijn.
