# Functioneel Design — Fantasy-Football-Gori

Status: Draft v0.4
Owner: Team-Siduii
Laatste update: 2026-05-04

## 1. Productvisie
Doel van de app:
- Een fantasy football app voor de Nederlandse Eredivisie, met focus op teambeheer en transfers.

Probleem dat we oplossen:
- Bestaande games laten vaak overlap in spelers toe; in deze app is een speler uniek per league.
- Eenvoudige, duidelijke flow voor draft + transferrondes zonder dure live-data API.

Doelgroep:
- Kleine tot middelgrote vriendengroepen/private leagues.

## 2. Scope
In scope (MVP):
- [x] League met unieke spelerspool per league
- [x] Draft ronde aan het begin van seizoen/competitie
- [x] Teambeheer (line-up/bank optioneel in MVP-lite)
- [x] Transferrondes tussen speelrondes
- [x] Free pool mechaniek met directe transfers (drop + add)
- [x] Adminschermen voor import/updaten van spelerslijst
- [x] Mobielvriendelijke responsive UI (telefoon + tablet) voor managerflows
- [x] Aparte WK 2026 module naast reguliere competitie (landen + faseschema)

Out of scope (voor later):
- [ ] Live match events en realtime scoring
- [ ] Geavanceerde statistieken/rankings
- [ ] Betaalde premium features

## 3. Gebruikersrollen
Rollen:
- Gast
- Speler
- League Admin
- Platform Admin

Per rol belangrijkste rechten:
- Gast: bekijken openbare info/invite flow
- Speler: team beheren, draft picks, transfers aanvragen/claims doen
- League Admin: league instellingen, draft starten, transferwindow openen/sluiten, regels wijzigen
- Platform Admin: brondata beheren, moderatie, platform configuratie

## 4. Kernfunctionaliteiten
### 4.1 Authenticatie & accounts
- E-mail/social login
- Lid worden via invite code/link
- MVP testauth bevat 2 seed-accounts: Test Manager (`manager@gori.local`) en Test Admin (`admin@gori.local`)
- Login-UI biedt accountknoppen die e-mail + wachtwoord direct prefillen voor snelle QA (wachtwoorden niet onthouden nodig)

### 4.2 League management
- League aanmaken en spelers uitnodigen
- Configuratie: teamgrootte, draftvolgorde, transferregels, deadline per ronde
- League-config module is direct bereikbaar via globale headerknop `Instellingen` in de manager-UI
- `Instellingen` route is auth-protected en alleen bereikbaar na login
- Admin stelt aan het begin van seizoen transferregime in:
  - Standaard: 1 transfer per team per speelronde
  - Uitzondering: exact 3 vooraf ingestelde bonusrondes waarop 3 transfers toegestaan zijn
  - Bonusrondes worden vastgelegd als ronde-nummers; elke ronde heeft startdatum+tijd en einddatum+tijd
- Admin stelt startbudget per team in voor het seizoen
- Speelrondes worden op basis van competitieschema ingeladen bij seizoenstart
- Admin kan gedurende seizoen speelrondes corrigeren (wedstrijd-naar-ronde mapping + start/eindtijd ronde)
- Regels draaien op een versieerbaar RuleSet v1-profiel per league (rules-as-data), inclusief validatie van bonusrondes, budget-cap en bankopbouw
- League Admin kan per ronde een lock/unlock uitvoeren met verplichte reden en actorregistratie

### 4.3 Teams & spelers
- Speler kan maar in 1 team tegelijk zitten binnen dezelfde league
- Zelfde speler mag in andere league opnieuw gekozen worden
- Elke speler heeft een vaste monetaire waarde (initieel via seizoens-CSV)
- Spelersdatabase is gedurende het seizoen aanpasbaar (mutaties/correcties)
- Teamgrootte is vast: 15 spelers totaal
- Posities: Keeper, Verdediger, Middenvelder, Aanvaller
- Selectie-opbouw:
  - 11 basisspelers
  - 4 wisselspelers: exact 1 keeper, 1 verdediger, 1 middenvelder, 1 aanvaller
- Basiself regels:
  - Exact 1 keeper verplicht
  - Veldspelers moeten in een toegestane formatie staan
  - Toegestane formaties: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 5-3-2

### 4.4 Draft flow
- Draftvolgorde wordt door admin ingevoerd (op basis van eindstand vorig jaar)
- Draftpatroon per blok van 3 rondes:
  - Ronde 1: ingevoerde volgorde (bijv. 1-2-3-4-5)
  - Ronde 2: ingevoerde volgorde (bijv. 1-2-3-4-5)
  - Ronde 3: omgekeerde volgorde (bijv. 5-4-3-2-1)
- Daarmee kiest de nummer laatst van vorig jaar in 2 van elke 3 rondes als eerste
- Draft loopt tot elk team 15 spelers heeft
- Roster-validatie wordt tijdens draft al afgedwongen (teamopbouw/formatieregels)
- Tijdens draft mag manager intern schuiven tussen basis/bank en formatie (voor zover geldig met al gekozen spelers)
- Tijdens draft mag manager een eerder gekozen speler teruggeven aan de vrije pool
- Bij teruggeven aan de vrije pool ontvangen andere managers een notificatie
- Geen pick timer in MVP
- Geen auto-pick in MVP

### 4.5 Transfers (kern van MVP)
- Er is een vrije pool met beschikbare spelers
- Transfers zijn direct (drop + add), zonder geavanceerde conflictresolutie in fase 1
- Transferflow in manager-UI is nu: (1) speler verkopen (direct placeholder op veld/bank), (2) optioneel formatie wisselen met placeholder(s), (3) vervanger kopen op open positie
- Aankoop op open placeholder verwerkt transfer direct (geen extra confirm-stap)
- Placeholder-slots zijn visueel lichtgrijs/transparant zodat open plekken direct herkenbaar zijn t.o.v. bezette slots
- Simultane transfer op dezelfde vrije speler: first-write-wins met database lock
- Vrije pool wordt elk uur ververst op basis van alle uitgevoerde transfers
- Basisregel blijft: binnen een league kan een speler maar in 1 team zitten
- Positiebehoud op wissels: spelerwissel tussen basis en bank is alleen toegestaan als de doel-slotpositie gelijk blijft (bijv. MID↔MID, DEF↔DEF)
- Na draft kan manager vrij transfers doen uit de vrije pool binnen het transferwindow
- Transferlimiet:
  - Standaard maximaal 1 transfer per team per speelronde
  - Op 3 admin-geconfigureerde momenten: maximaal 3 transfers per team in die ronde
- Budgetregel:
  - Elk team krijgt een seizoensbudget bij start
  - Transacties mogen budget niet overschrijden
  - Budgetmodel: remaining cash (prijs oude speler komt vrij, prijs nieuwe speler wordt afgetrokken)
  - Budget mag op 0 eindigen, maar nooit negatief worden
- Speciale vervangingsregel:
  - Als een speler naar het buitenland vertrekt, mag manager de ontstane lege plek vullen met een vrije speler
  - Deze vervanging telt niet mee in transferlimiet van de ronde
  - Budgetverrekening blijft gelijk aan normale transfer
- Directe manager-naar-manager transfer (pre-season):
  - Alleen toegestaan vanaf afronden draft tot start van de eerste competitiewedstrijd
  - Spelers worden direct tussen teams gewisseld (gaan niet via vrije pool)
  - Pakketdeals zijn toegestaan (n-voor-m)
  - Expliciete goedkeuring door beide managers is verplicht
  - Voorstel eindigt alleen bij: start competitie, expliciete weigering door ontvanger, of intrekken door verzender
  - Deze transfer telt niet mee in transferlimieten per speelronde (want alleen pre-season)
  - Enige limiet is budgetvalidatie voor beide managers (geen negatief budget)
- Transfervenster per speelronde:
  - Open: direct na laatste wedstrijd van huidige speelronde
  - Dicht: exact bij starttijd van eerste wedstrijd van volgende speelronde
  - Bij admin-aanpassing van rondetijden worden nieuwe grenzen direct actief
- Fase 2: conflictresolutie (waiver/priority/queue) toevoegen
- Managerpagina toont transfermarkt onder teamoverzicht zodat basiselftal/bank en transferkeuzes tegelijk zichtbaar zijn
- In de Team-paginaheader (regel direct onder titel "Team") wordt de standaardtekst vervangen door een compacte speelrondekaart met ronde-nummer, start-countdown en een wedstrijdraster met 1-op-1 shirt-icoontjes per club, plus datum+tijd per duel.
- Speelrondekaart heeft browsen met links/rechts-knoppen: rechts toont de volgende ronde (programma), links toont de vorige ronde met uitslagen.
- Transfermarkt-filters in MVP: positie, club en maximale transferwaarde (slider)
- In mobiele weergave stacken transfermarkt-filters onder elkaar met full-width velden (geen samengedrukte Positie/Club/Zoek-layout)
- Mobile transfermarkt-filters gebruiken extra label-contrast en spacing voor leesbaarheid en touch-bruikbaarheid
- Verkoop-selector respecteert transferlimiet van de actieve ronde: in normale rondes max 1 open verkoop, in bonusrondes (3 transfers) tot 3 open verkopen vóórdat kopen verplicht wordt
- UI toont bij open verkopen een duidelijke teller/hint (bijv. 1/3, 2/3) en blokkeert nieuwe verkoop pas bij bereikt limiet
- Transfer policy-engine berekent per ronde deterministisch: transferlimiet, open-sell ruimte en koop-toestemming op basis van bonusrondeconfig + voltooide transfers
- Bankverdeling is vast: altijd 4 bankslots met 1x GK, 1x DEF, 1x MID en 1x FWD
- Basiselftal-weergave op het veld toont per slot de echte speler op die index (geen naamherhaling binnen een linie); elke speler-id mag maar 1x tegelijk in teamstate voorkomen
- Pitch in basiselftal gebruikt exact de aangeleverde referentie-afbeelding als achtergrondasset (`/public/images/pitch-reference.jpg`) met sterke zoom-in (`background-size: 200% auto`) zodat het veld close-up in beeld staat
- Voor scherper beeld gebruikt de pitch-laag subtiele beeldversterking (`contrast(1.12) saturate(1.08) brightness(1.02)`) zonder spelerskaarten of interacties te beïnvloeden
- MVP transferbudget-cap voor managerteam: maximaal €32.0M totale teamwaarde; transferbevestiging blokkeert automatisch boven cap
- Demo-team (testseed) wordt standaard binnen budget opgebouwd (<= €32.0M) zodat testen direct valide start
- Mobiele volgorde op Team-pagina: basiselftal eerst, daarna wisselspelers, daarna statistiektegels
- Transfermarkt-kolommen zijn sorteerbaar op spelernaam, positie (GK→DEF→MID→FWD), club en transferwaarde

### 4.6 Notificaties
- Draft turn
- Notificatie wanneer een manager tijdens draft een speler terugzet naar vrije pool
- Notificatie-eventbus v1 met persistente events voor:
  - TRANSFER_WINDOW_OPENED
  - TRANSFER_WINDOW_CLOSING_SOON
  - TRADE_APPROVAL_REQUESTED
- Eventbus is uitleesbaar met filters op manager, league en event type

## 5. Belangrijkste user journeys
1) Nieuwe gebruiker maakt account en joint league
- Trigger: invite link
- Steps: account -> join league -> teamnaam kiezen
- Succescriteria: gebruiker zichtbaar in league

2) League admin start draft
- Trigger: alle deelnemers gejoined
- Steps: draft instellingen -> start draft -> picks lopen
- Succescriteria: elk team heeft initiële selectie

3) Speler doet transfer vanuit vrije pool
- Trigger: speler wil selectie wijzigen
- Steps: speler A droppen -> speler B uit vrije pool toevoegen -> uur-refresh verwerkt poolstatus
- Succescriteria: teamupdate lukt en speler B verdwijnt uit vrije pool binnen refresh-cyclus

## 6. Functionele requirements (FR)
FR-001: Binnen een league is elke speler op elk moment aan maximaal 1 team gekoppeld.
FR-002: Draft pick is atomisch; 2 managers kunnen nooit dezelfde speler tegelijk picken.
FR-003: Transfers worden direct verwerkt als drop+add mutatie (fase 1).
FR-004: Vrije pool wordt minimaal elk uur gesynchroniseerd met uitgevoerde transfers.
FR-005: Drop+add wordt als 1 transactie verwerkt (geen half-voltooide teamstatus).
FR-006: Binnen een league blijft exclusiviteit leidend: geen dubbele spelerstoewijzing over teams.
FR-007: Volledige audittrail van picks, drops, adds en sync-runs.
FR-008 (fase 2): deterministische conflictresolutie voor gelijktijdige claims.
FR-009: Roster-validatie dwingt tijdens draft geldige teamopbouw af; bij draft-einde geldt exact 15 spelers met bankverdeling (1K/1V/1M/1A).
FR-010: Basisopstelling bevat exact 1 keeper en een geldige veldformatie uit de toegestane set.
FR-011: Transferlimiet is standaard 1 per ronde, met precies 3 vooraf ingestelde bonusrondes met limiet 3.
FR-012: Team kan geen transfer bevestigen die budget overschrijdt.
FR-013: Players kunnen via admin mutaties krijgen gedurende seizoen zonder historieverlies.
FR-014: Buitenland-transfer van roster speler activeert een toegestane vervangingsactie vanuit vrije pool.
FR-015: Transfervenster opent direct na laatste wedstrijd van huidige ronde en sluit exact bij eerste wedstrijd van volgende ronde.
FR-016: Admin kan speelrondes en wedstrijd-naar-ronde mapping tijdens seizoen aanpassen met audittrail.
FR-017: Simultane transfer op dezelfde speler gebruikt first-write-wins met lock om dubbele toewijzing te voorkomen.
FR-018: Budget na transfer is altijd >= 0; budget == 0 is toegestaan.
FR-019: Wijzigingen in rondegrenzen door admin hebben direct effect op open/gesloten transfervenster.
FR-020: Draftvolgorde volgt verplicht het 3-rondes patroon: A, A, reverse(A), herhalend.
FR-021: Draft heeft geen pick timer en geen auto-pick in MVP.
FR-022: Draft wordt pas afgesloten wanneer elk team exact 15 spelers heeft.
FR-023: Directe manager-naar-manager transfer is alleen pre-season toegestaan (na draft, vóór eerste competitiewedstrijd), gaat buiten vrije pool om en ondersteunt pakketdeals (n-voor-m).
FR-024: Directe manager-naar-manager transfer vereist expliciete goedkeuring van beide managers.
FR-025: Manager-transfervoorstel vervalt alleen bij start competitie, expliciete afwijzing door ontvanger of intrekken door verzender.
FR-026: Pre-season manager-transfers tellen niet mee in transferlimieten per speelronde; budgetvalidatie voor beide managers blijft verplicht.
FR-027: Bij mislukte vrije-pool refresh volgt precies 3x retry met 1 minuut interval; daarna alleen admin-alert.
FR-028: Tijdens draft kan een manager een gekozen speler terugzetten naar vrije pool; andere managers ontvangen hiervan een notificatie.
FR-029: Bonusrondes voor 3 transfers worden als ronde-nummers geconfigureerd; iedere ronde heeft startdatum+tijd en einddatum+tijd.
FR-030: Wissels tussen basis en bank behouden slotpositie; een MID mag geen DEF-slot innemen en vice versa.
FR-031: Transferkandidaat uit vrije pool kan alleen gekozen worden nadat een verkoopspeler is geselecteerd.
FR-032: Transfer wordt direct verwerkt bij aankoop op een open placeholder; er is geen extra confirm-stap.
FR-033: Transfermarkt in managerweergave ondersteunt filtering op positie, club en maximale transferwaarde.
FR-034: Basiselftal-rendering gebruikt unieke lineup-index mapping zodat spelersnamen niet onterecht per linie gedupliceerd worden.
FR-035: Teamweergave op het veld bevat een halve-veld visualisatie als achtergrond zonder drag/drop-interactie te blokkeren.
FR-036: Teamwaarde voor manager-opstelling is hard begrensd op €32.0M in MVP; transfers die de cap overschrijden worden geweigerd.
FR-037: Competitiepagina bevat het resterende Eredivisie-schema opgesplitst in speelrondes 31 t/m 34, inclusief datum/tijd en sponsorvermelding (Staatsloterij).
FR-038: Na verkoop verschijnt direct een open placeholder op het veld of op de bank; formatie wisselen gebruikt deze placeholder(s) voor opbouw.
FR-039: Als gekozen formatie met huidige spelers + beschikbare placeholders niet haalbaar is, toont UI exact: "je kunt niet in deze formatie spelen met deze spelers".
FR-040: Bij aankoop wordt pas op dat moment gevalideerd of positie in de gekozen formatie op een open slot past; zo niet toont UI exact: "deze speler past niet in de gekozen formatie".
FR-041: Bank bevat altijd exact 1 keeper, 1 verdediger, 1 middenvelder en 1 aanvaller (bezette speler of placeholder).
FR-042: Team-paginaheader (onder titel "Team", boven basiselftal) toont een speelrondekaart met ronde-nummer, countdown naar eerste aftrap en wedstrijden in referentie-layout met datum+tijd en club-shirticoon per thuis/uit-team.
FR-043: Basiselftal-veld behoudt bestaande kaarten/interactie maar rendert de expliciet aangeleverde referentie-afbeelding als pitch-achtergrond (`/public/images/pitch-reference.jpg`) zodat de visuele veldstijl 1-op-1 overeenkomt met het goedgekeurde voorbeeld.
FR-044: Speelrondekaart ondersteunt browsen via links/rechts-knoppen: rechts navigeert naar volgende ronde (programma), links naar vorige ronde met uitslagenweergave.
FR-045: Manager-UI is responsive op mobiel/tablet: header, kaarten, opstellingsveld en bottom navigation blijven bruikbaar zonder horizontaal scrollen in de standaard flows.
FR-046: In mobiele Team-weergave staan de secties in deze volgorde: basiselftal, wisselspelers, daarna statistiektegels.
FR-047: Transfermarkt ondersteunt kolomsortering op spelernaam, positie (GK, DEF, MID, FWD), club en transferwaarde, met omschakelbare oplopend/aflopend sorteerrichting.
FR-048: Transfermarkt-filters blijven op mobiel volledig bruikbaar: Positie/Club/Zoek stacken verticaal en elk veld gebruikt full-width.
FR-049: Verkoop-selector staat open totdat de transferlimiet van de actieve ronde is bereikt; in rondes met limiet 1 is na 1 open placeholder een koopactie vereist, in bonusrondes met limiet 3 mogen eerst tot 3 verkopen worden gedaan.
FR-050: League RuleSet v1 is versieerbaar en valideert strikt op: defaultLimit=1, bonusRoundLimit=3, exact 3 unieke bonusronde-nummers, budget-cap en bankcompositie (GK/DEF/MID/FWD elk 1).
FR-051: Transfer policy-engine bepaalt per ronde deterministisch of SELL en BUY zijn toegestaan op basis van RuleSet, aantal voltooide transfers en aantal open verkopen.
FR-052: Admin kan speelrondes locken/unlocken via API; elke lock-statuswijziging schrijft een audit-entry met actie-type, actor, target, reden en timestamp.
FR-053: Notificatie-eventbus v1 slaat transferwindow- en trade-approval-events persistent op met type, league, manager, payload en timestamp.
FR-054: Eventbus-API ondersteunt uitlezen met filters op managerId, leagueId en event type.
FR-055 (fase 2): Waiver/Blind bid mode ondersteunt gesloten biedingen tot reveal en kiest per speler deterministisch een winnaar via configureerbare tie-breaker policy (PRIORITY of EARLIEST_BID).
FR-056 (fase 2): Admin kan een waiver-ronde cancelen en heropenen met verplichte audit-entry (actor, reden, timestamp).
FR-057 (fase 2): League ondersteunt scoring profiles met backward-compatible default `Classic` en valideerbare `Custom` bonus/malus-parameters.
FR-058 (fase 2): Competition abstraction v1 ondersteunt parallel zowel `League table` als `Cup knockout`, met expliciete configureerbare tie-breakers.
FR-059 (fase 2): Rollenmodel owner/commissioner/manager forceert permission matrix in API; admin overrides zijn uitsluitend toegestaan met juiste rolrechten.
FR-060 (fase 2): Admin-UI toont en beheert league-configuratie voor scoring profile, waiver tie-breaker, competition tie policy en role assignments.
FR-061: Auth-MVP ondersteunt twee testaccounts (manager + admin) en de login-UI prefillt standaard de gekozen account-credentials voor snelle testtoegang.
FR-062: Manager-UI bevat een globale `Instellingen` navigatieknop; route `/instellingen` toont league-config module en redirectt naar login zonder actieve sessie.
FR-063: Elk instelveld in de league-config module toont een hover/focus-help (`?`) met korte uitleg van de regel en de impact op competitiegedrag.
FR-064: Manager-UI bevat een aparte WK 2026 module naast de Eredivisie-competitie met eigen route en navigatie-entry.
FR-065: WK module toont een vaste lijst van 48 deelnemende landen inclusief hoststatus en confederatie.
FR-066: WK module toont het toernooischema op fase-niveau (groepsfase t/m finale) met start/einddatum en aantal wedstrijden per fase.
FR-067: In het manager-menu kan de gebruiker expliciet schakelen tussen `Eredivisie mode` en `WK mode`; beide modes tonen dezelfde manager-navigatiestructuur (Team, Transfers, Competities, Profiel) binnen hun eigen route-namespace.
FR-068: WK mode gebruikt hetzelfde teambeheer- en transfer-UX patroon als Eredivisie mode (zelfde pagina-opbouw, pitch, bank, transfermarkt en interacties).
FR-069: In WK mode betekent speelronde 1/2/3 dat alle landen respectievelijk hun 1e/2e/3e groepswedstrijd hebben gespeeld.
FR-070: Manager-state persistence is competitiegescheiden: Eredivisie mode en WK mode bewaren opstelling/bench/pending transfer-status volledig los van elkaar.
FR-071: Deploy-config ondersteunt optionele gescheiden storage paths via `MANAGER_STATE_PATH` (Eredivisie) en `MANAGER_STATE_WK_PATH` (WK) voor veilige runtime-isolatie.
FR-072: Instellingenpagina toont een debug-sectie met het actieve state-opslagpad voor Eredivisie mode en WK mode zodat runtime-config snel te verifiëren is.
FR-073: In WK mode gebruikt de manager-UI overal de term `Land` waar Eredivisie mode `Club` toont (filters, zoeklabel en sorteerkolom) zonder gedragswijziging van filtering/sortering.

## 7. Niet-functionele requirements (NFR)
Performance:
- Vrije-pool refresh job draait elk uur en verwerkt updates binnen < 60s per league.

Beschikbaarheid:
- 99.5% voor MVP voldoende.

Beveiliging:
- Role-based access; server-side validatie op alle roster-mutaties.

Audit/logging:
- Event log per league (wie, wat, wanneer, resultaat).

Privacy/GDPR:
- Minimale persoonsgegevens; export/verwijderoptie account.

## 8. Data & domein (hoog niveau)
Belangrijkste entiteiten:
- User
- League
- Team
- Player
- TeamBudget
- Draft
- DraftPick
- RosterSlot
- TransferPolicy
- LeagueRuleSet
- RoundLock
- AdminActionLog
- NotificationEvent
- FreePoolSnapshot
- TransferSyncRun
- TransactionLog

Relaties en business rules:
- Player is uniek per league-roster-context (technisch via league_id + player_id unique op actieve roster).
- Transferactie bevat drop_player_id + add_player_id + timestamp + actor.
- Uurjob reconstrueert vrije pool uit transacties en markeert inconsistenties.
- Conflictresolutie-entiteiten (WaiverClaim/Priority) komen pas in fase 2.
- Player minimale velden voor MVP: id, naam, club, positie, prijs.
- TeamBudget houdt resterend budget en alle budgetmutaties per transfer bij.
- TransferPolicy bevat ronde-limieten + 3 bonusrondes (3 transfers) op specifieke ronde-nummers met start/eindtijd.
- LeagueRuleSet v1 bewaart versie + gevalideerde configuratie voor transfer, budget en bankopbouw.
- RoundLock bewaart per ronde of mutaties tijdelijk geblokkeerd zijn.
- AdminActionLog bewaart alle lock/unlock-acties met actor+reden voor audittrail.
- NotificationEvent bewaart notificatie-events per manager/league voor transferwindow-open, transferwindow-close-soon en trade-approval.
- WaiverRound bewaart gesloten blind bids, reveal status, tie-breaker policy en reveal-resultaten per speler.
- ScoringProfile ondersteunt Classic (default) en Custom puntenprofielen met validatie op bonus/malus-ranges.
- CompetitionConfig ondersteunt parallelle formats (League table + Cup knockout) met configureerbare tie-breakers.
- LeagueRoleAssignment bewaart owner/commissioner/manager en drijft server-side permission checks.
- ManagerTradeProposal bevat pre-season pakketdealregels, proposal-status en beide approvals.

## 9. Databronstrategie (Coach van het Jaar)
Bron:
- Startpunt: spelerslijst gebaseerd op Coach van het Jaar.

Scrapen — haalbaarheid:
- Technisch waarschijnlijk haalbaar (site en robots.txt publiek bereikbaar).
- In JS zijn API endpoints zichtbaar; waarschijnlijk deels login/flow-afhankelijk.
- Juridisch/ToS check blijft verplicht voordat we structureel scrapen.

Aanbevolen aanpak (toekomstbestendig + goedkoop):
1) MVP: semi-handmatige import (CSV/JSON) van spelersbasis.
2) Daarna: scraper als periodieke job met change detection.
3) Fallback: admin kan handmatig corrections doen in beheerscherm.

Waarom zo:
- Minder fragiel dan volledig live scraping
- Lagere kosten en minder operationeel risico
- Sneller naar werkend product

## 10. Integraties
- GitHub (development workflow)
- Vercel (deployments)
- Linear (planning)
- Optioneel: scraper worker + scheduler

## 11. Acceptatiecriteria MVP
- [ ] Draft kan volledig worden afgerond zonder dubbele spelers in league
- [ ] Draftvolgorde volgt correct patroon A, A, reverse(A) in elke 3-rondes cyclus
- [ ] Draft sluit alleen af bij exact 15 spelers per team
- [ ] Directe drop+add transfer werkt stabiel zonder dubbele spelerstoewijzing
- [ ] Vrije pool wordt elk uur correct ververst vanuit transferlog
- [ ] Drop+add werkt atomisch
- [ ] Admin kan spelerslijst importeren/updaten
- [ ] Ongeldige opstellingen (verkeerde aantallen/formatie) worden server-side afgekeurd
- [ ] Transferlimieten per ronde + 3 bonusrondes worden correct afgedwongen
- [ ] Budgetoverschrijdende transfers worden geblokkeerd
- [ ] Transfervenster volgt automatisch: open na laatste wedstrijd ronde, dicht bij eerste wedstrijd volgende ronde
- [ ] Buitenland-vervanging telt niet mee in transferlimiet en rekent budget normaal af
- [ ] Bij gelijktijdige transferpogingen wint first-write-wins en blijft speler uniek toegewezen
- [ ] Budget kan exact 0 bereiken maar geen enkele transactie mag budget negatief maken
- [ ] Admin-aanpassing van rondegrenzen werkt direct door in transferwindow-status
- [ ] Enige notificaties in MVP zijn "draft aan de beurt" en "speler teruggezet naar vrije pool tijdens draft"
- [ ] Directe manager-naar-manager transfer werkt alleen pre-season (na draft, vóór eerste competitiewedstrijd), buiten vrije pool en met pakketdeals (n-voor-m)
- [ ] Directe manager-transfer vereist expliciete goedkeuring door beide managers
- [ ] Manager-transfervoorstel eindigt alleen bij start competitie, afwijzing door ontvanger of intrekken door verzender
- [ ] Pre-season manager-transfers tellen niet mee in transferlimieten per speelronde; budget van beide teams mag niet negatief worden
- [ ] Bij mislukte vrije-pool refresh draait exact 3x retry met 1 minuut interval en volgt daarna alleen admin-alert
- [ ] Tijdens draft kan manager gekozen speler teruggeven aan vrije pool en ontvangen andere managers hierover een notificatie
- [ ] Wissels tussen basis en bank blokkeren positieconflicten (bijv. MID↔DEF) en laten alleen geldige slotwissels toe
- [ ] Transferflow vereist: eerst verkoop selecteren, daarna vervanger kiezen op open placeholder; transfer wordt direct verwerkt zonder aparte confirm
- [ ] Transfermarkt staat onder teamoverzicht en ondersteunt filters op positie, club en maximale transferwaarde
- [ ] Basiselftal toont de daadwerkelijk geselecteerde spelers per slot (geen visuele naamduplicatie door renderfout)
- [ ] Basiselftal heeft een halve-veld achtergrondvisual (zoals voetbalveld-helft) terwijl kaarten volledig bruikbaar blijven
- [ ] Teamwaarde blijft op of onder €32.0M; transfer boven cap wordt geblokkeerd met duidelijke melding
- [ ] Competitiepagina toont alle resterende wedstrijden ingedeeld in speelrondes 31, 32, 33 en 34 met correcte datum/tijd
- [ ] Verkoopactie maakt direct een zichtbare placeholder op juiste plek (veld of bank)
- [ ] Formatie-wissel met actieve placeholder blokkeert onhaalbare formaties met melding: "je kunt niet in deze formatie spelen met deze spelers"
- [ ] Pitch-visual toont strafschopgebied met diepte, 5-metergebied en halve cirkel
- [ ] Placeholder-slots zijn lichtgrijs/transparant en visueel duidelijk anders dan bezette spelerskaarten
- [ ] Bank toont altijd precies 1 GK, 1 DEF, 1 MID en 1 FWD
- [ ] Bij koop op ongeldige positie verschijnt exact: "deze speler past niet in de gekozen formatie"
- [ ] Team-paginaheader (onder "Team", boven basiselftal) toont een speelrondekaart met ronde-nummer, start-countdown, wedstrijdrijen met shirt-icoontjes en strak referentie-grid (datum+tijd per duel)
- [ ] Basiselftal gebruikt exact de aangeleverde referentie-afbeelding als pitch-achtergrond (`/public/images/pitch-reference.jpg`), met ongewijzigde kaarten/interactie erbovenop
- [ ] Links/rechts-knoppen browsen speelrondes: rechts toont volgende ronde-programma, links toont vorige ronde met uitslagen
- [ ] Manager-UI blijft mobiel bruikbaar (telefoon/tablet) met responsive header, opstellingskaarten, statistiektegels en bottom navigation
- [ ] In mobiele Team-weergave staat de volgorde als: basiselftal → wisselspelers → statistiektegels
- [ ] Transfermarkt-kolommen zijn klikbaar sorteerbaar op speler, positie (GK/DEF/MID/FWD), club en transferwaarde
- [ ] Transfermarkt-filters op mobiel zijn full-width en verticaal gestapeld (Positie/Club/Zoek zonder overlap of ingedrukte velden)
- [ ] Verkoop-selector volgt ronde-limiet voor open placeholders: limiet 1-rondes blokkeren na 1 open verkoop, bonusrondes blokkeren pas na 3 open verkopen; UI toont duidelijke teller/hint
- [ ] Waiver/Blind bid mode werkt met gesloten biedingen tot reveal; winner-resolutie per speler volgt configureerbare tie-breaker (priority of earliest bid)
- [ ] Admin kan waiver-ronde cancelen en heropenen met audittrail (actor, reason, timestamp)
- [ ] League ondersteunt scoring profile selectie (Classic/Custom) en valideert custom bonus/malus parameters
- [ ] Competition abstraction ondersteunt gelijktijdig League table en Cup knockout met configureerbare tie-breakers
- [ ] Rollenmodel owner/commissioner/manager wordt server-side afgedwongen; admin overrides geven 403 zonder juiste permissie
- [ ] Instellingenpagina toont en beheert league-config voor waiver/scoring/competition/roles
- [ ] Login toont Test Manager + Test Admin quick-select en prefillt bij keuze direct e-mail + wachtwoord voor beide accounts
- [ ] Header bevat zichtbare `Instellingen` knop en `/instellingen` is alleen bereikbaar met actieve login (anders redirect naar `/login`)
- [ ] Instellingenvelden tonen `?` hover/focus-help met korte uitleg van scoring, waiver tie-breaker, cup tie policy en rol-lijsten
- [ ] Manager-navigatie bevat een aparte `WK 2026` entry naast `Competities`
- [ ] WK-module toont 48 deelnemende landen met hoststatus en confederatie
- [ ] WK-module toont faseschema (groepsfase t/m finale) met datumbereik en matchaantallen
- [ ] Manager-menu bevat mode-switch waarmee je direct wisselt tussen Eredivisie mode en WK mode
- [ ] In WK mode ziet Team/Transfers/Competities eruit en werkt het hetzelfde als in Eredivisie mode (zelfde UX-structuur)
- [ ] WK-rondebetekenis is expliciet: ronde 1/2/3 = alle landen hebben hun 1e/2e/3e groepsduel gespeeld
- [ ] Manager-state is gescheiden per competitie-mode: wijzigingen in WK-opstelling overschrijven Eredivisie-opstelling niet (en vice versa)
- [ ] Runtime ondersteunt aparte state-paden voor Eredivisie en WK (`MANAGER_STATE_PATH` en `MANAGER_STATE_WK_PATH`)
- [ ] Instellingenpagina toont zichtbare debug-regels met actieve state-opslagpaden voor Eredivisie en WK
- [ ] In WK mode zijn alle transfermarkt-termen mode-correct: `Land`, `Alle landen`, `Zoek speler/land` en kolomheader `Land`; in Eredivisie mode blijft dit `Club`

## 12. Open vragen
- [x] Limiet bevestigd: standaard 1 transfer per team per speelronde, met 3 bonusrondes van 3 transfers
- [x] Bonusrondes worden als ronde-nummers ingesteld; elke ronde heeft start/eindtijd
- [x] Refresh-falen: exact 3 retries met 1 minuut interval, daarna alleen admin-alert
- [x] Fase 2 conflictresolutie: mogelijk in seizoen 1, maar alleen na akkoord van alle managers
- [x] Buitenland-vervanging telt niet mee in transferlimiet; budgetverrekening blijft normaal
- [x] Budgetmodel bevestigd: remaining cash
- [x] Player velden MVP bevestigd: id, naam, club, positie, prijs
- [x] Simultane transferregel bevestigd: first-write-wins met lock
- [x] Budgetgrens bevestigd: 0 toegestaan, negatief verboden
- [x] Admin ronde-aanpassingen gelden direct
- [x] Draft bevestigd: patroon A, A, reverse(A), zonder timer/auto-pick
- [x] Tijdens draft is roster-validatie actief
- [x] Tijdens draft kan manager speler teruggeven aan vrije pool; andere managers krijgen notificatie
- [x] Notificaties MVP: draft turn + terugzetten speler naar vrije pool tijdens draft
- [x] Teamgrootte tijdens draft bevestigd: 15 spelers
- [x] Na draft zijn vrije-pool transfers toegestaan binnen transferwindow
- [x] Directe manager-naar-manager transfers: alleen pre-season, pakketdeals toegestaan, expliciete goedkeuring door beide kanten
- [x] Manager-transfervoorstel eindigt alleen bij competitie-start, afwijzing ontvanger of intrekken verzender
- [x] Pre-season manager-transfers tellen niet mee in per-ronde transferlimieten; alleen budgetlimiet geldt
- [x] MVP transfer-UX bevestigd: eerst verkopen, dan kopen op open placeholder, zonder aparte confirm-stap
- [x] Wissels op het veld respecteren positie-slots (geen MID op DEF-slot)
- [x] Transfermarkt blijft op managerpagina zichtbaar onder teamoverzicht met filters op positie, club en transferwaarde
- [x] MVP transferbudget-cap vastgesteld op €32.0M en demo-team start binnen deze cap
- [x] Resterend schema vastgesteld: speelronde 31 (22-26 apr), 32 (2-3 mei), 33 (10 mei), 34 (17 mei), met sponsorvermelding Staatsloterij
- [x] Transferflow aangepast naar verkoop->placeholder->(formatie wissel)->aankoop zonder aparte confirm
- [x] Positiekeuze in transfermarkt blijft vrij; positionele fit-check gebeurt bij koopactie op open slot
- [x] Testauth uitgebreid met manager+admin account en login prefill voor snelle QA
- [x] WK 2026 module naast reguliere competitie: aparte route + nav-entry, met deelnemende landenlijst en faseschema op toernooidatums
- [x] Menu-switch toegevoegd voor managers om direct te wisselen tussen Eredivisie mode en WK mode
- [x] WK mode uitgelijnd op dezelfde manager-UX als Eredivisie mode (zelfde Team/Transfers/Competities-structuur, aparte WK-routes)
- [x] WK-speelschema in app wordt gevuld vanuit KPN bronpagina (`/entertainment/sport/wk-voetbal/speelschema`) en bevat 104 wedstrijden met ronde-indeling: speelronde 1-3 (groepsfase), zestiende finales, achtste finales, kwartfinales, halve finales, troostfinale en finale
- [x] WK-rondebetekenis vastgelegd: ronde 1/2/3 mapt op groepswedstrijd 1/2/3 per land
- [x] Optionele deploy-isolatie toegevoegd met aparte env-paden voor state-opslag per mode (`MANAGER_STATE_PATH` en `MANAGER_STATE_WK_PATH`)
- [x] Instellingenpagina toont debug-sectie met actieve state-opslagpaden voor Eredivisie en WK

## 13. Besluitenlog
- 2026-04-16: Repo + Vercel + baseline workflow opgezet.
- 2026-04-16: Functioneel design document gestart.
- 2026-04-16: Productfocus aangescherpt naar: draft + unieke spelers + transferwindow/waiver.
- 2026-04-16: MVP vereenvoudigd: directe transfers + vrije pool refresh per uur; conflictresolutie naar fase 2.
- 2026-04-16: Transfer- en budgetregels toegevoegd: 1 transfer per ronde, 3 bonusmomenten met 3 transfers, seizoensbudget per team.
- 2026-04-16: Rondevenster en budgetmechaniek bevestigd: transfers open na laatste wedstrijd en dicht bij eerste wedstrijd volgende ronde; buitenland-vervanging buiten limiet; Player CSV minimaal id/naam/club/positie/prijs.
- 2026-04-16: Concurrency en budgetvloer bevestigd: first-write-wins met lock, budget mag 0 zijn maar niet negatief, rondewijzigingen admin direct actief.
- 2026-04-16: Draft bevestigd op patroon A, A, reverse(A) zonder timer; notificaties MVP beperkt tot draft turn.
- 2026-04-16: Draft afgerond op 15 spelers; na draft vrije-pool transfers + directe manager-transfers toegevoegd; refresh-falen via auto-retry + admin-alert; fase 2 alleen na unaniem manager-akkoord.
- 2026-04-16: Directe manager-transfers aangescherpt naar pre-season pakketdeals met dubbele expliciete goedkeuring, voorstel-lifecycle vastgelegd; bonusrondes als ronde-nummers met start/eindtijd; refresh-policy vastgezet op 3 retries/1 min; draft-terugzetten naar vrije pool + notificatie toegevoegd.
- 2026-04-17: Manager My Team + transfermarkt geïntegreerd met positie-veilige drag/drop, expliciete sell→buy→confirm transferflow, banklimiet in UI en filters op positie/club/transferwaarde; leesbaarheid van naamkaartjes verhoogd.
- 2026-04-18: Bugfix op pitch-row mapping zodat elke lineup-slot de juiste speler toont (geen DEF/MID/FWD-naamherhaling per rij) + halve-veld achtergrond toegevoegd aan basiselftal.
- 2026-04-18: Budgetbeleid aangescherpt naar harde cap €32.0M (incl. transferblokkade boven cap), demo-teamseed aangepast naar <= €32.0M en resterend Eredivisie-schema toegevoegd in speelrondes 31-34 met sponsorlabel Staatsloterij.
- 2026-04-18: Transferflow herwerkt naar directe verkoop met placeholder + formatiewissel op basis van placeholders; onhaalbare formatie toont vaste fouttekst. Pitch-visual uitgebreid met diepte in strafschopgebied, 5-metergebied en halve cirkel.
- 2026-04-18: Placeholder-visuals lichtgrijs/transparant gemaakt; banklogica vastgezet op 1x GK/DEF/MID/FWD; koopvalidatie gewijzigd naar check-op-koop met foutmelding "deze speler past niet in de gekozen formatie".
- 2026-04-18: Summary-strip wijziging teruggedraaid; wedstrijdschema verplaatst naar Team-paginaheader (regel onder titel "Team", boven basiselftal) en uitgebreid naar alle wedstrijden van de actieve speelronde met datum+tijd.
- 2026-04-18: Team-paginaheader visueel herwerkt naar speelrondekaart (ronde + START-countdown + wedstrijdkolommen) op basis van aangeleverde referentie; pitch-achtergrond van basiselftal vervangen door nieuwe groene veldstijl terwijl kaarten/interacties gelijk bleven.
- 2026-04-18: Tweede visual-pass op referenties: speelrondekaart verfijnd naar strakker grid met shirt-icoontjes per club en compactere spacing; pitch opnieuw gemodelleerd met perspectivische schuine lijnen en realistischer strafschopvakken.
- 2026-04-18: Interactie-uitbreiding speelrondekaart: links/rechts browseknoppen toegevoegd (volgende ronde programma, vorige ronde uitslagen) en onderste strafschopgebied extra taps gemaakt voor consistente diepte.
- 2026-04-19: Onderste strafschopgebied opnieuw gealigneerd met veldperspectief (gespiegeld op bovenste dieptelogica) zodat de diepte consistent is over het hele veld.
- 2026-04-19: Responsive mobiele UI aangescherpt voor managerflows (compactere header/cards, pitch + stat-tiles op kleine schermen, bottom nav met safe-area ondersteuning).
- 2026-04-20: Team mobile-layout verfijnd: wisselspelers onder basiselftal en statistiektegels daarna; overbodige hulptrij-teksten verwijderd; transfermarktkolommen klikbaar sorteerbaar gemaakt (naam/positie/club/transferwaarde).
- 2026-04-20: Transfermarkt-mobile formulierfix: Positie/Club/Zoek-velden nu full-width en verticaal gestapeld; kolombreedtes (col-2/col-3) expliciet gedefinieerd en op mobiel naar 12 kolommen gezet om overlap/compressie te voorkomen.
- 2026-04-20: Mobile transfermarkt UI gepolijst met betere label-contrast, extra vertical spacing en grotere input-typografie voor leesbaarheid.
- 2026-04-20: Verkoop-flow UX verduidelijkt: sell-dropdown reset na keuze, wordt disabled tijdens open transfer en toont expliciete hint (voorkomt indruk dat selectie “niets doet” op mobiel).
- 2026-04-21: Transferlimiet-gedrag in Team-flow aangepast: in bonusrondes (3 transfers) mogen managers eerst meerdere spelers verkopen (tot 3 open placeholders) voordat kopen verplicht is; in 1-transferrondes blijft direct vervangen na 1 verkoop vereist.
- 2026-04-24: Sprint 1 fundament toegevoegd: RuleSet v1-validatie (versieerbare regels), transfer policy-engine (deterministische SELL/BUY-beslissing per ronde) en admin ronde lock/unlock met audittrail + API-endpoint.
- 2026-04-24: Notificatie-eventbus v1 toegevoegd met persistente events + API-filters voor transferwindow-open, transferwindow-close-soon en trade-approval notifications.
- 2026-04-24: Sprint 2 basislaag toegevoegd: waiver/blind-bid domeinmodule met reveal+tiebreak + cancel/reopen audit, scoring profile module (Classic/Custom validatie), competition abstraction (league table + cup knockout) en rollenmodel owner/commissioner/manager.
- 2026-04-24: League-config API + instellingen-UI uitgebreid voor fase 2 configuratie; admin round-lock API nu role-gated via permission matrix.
- 2026-04-24: Auth-MVP uitgebreid met test admin account (`admin@gori.local`) naast manager-account en login quick-select met prefilled credentials voor beide testaccounts.
- 2026-04-24: Discoverability verbeterd: globale headerknop `Instellingen` toegevoegd en route `/instellingen` onder auth-middleware geplaatst.
- 2026-04-24: League-config opslag gefixt voor Vercel runtime: standaardpad valt nu terug op `/tmp/league-admin-config.json` zodat instellingen op staging/prod niet meer falen op read-only filesystem.
- 2026-04-24: League-config UX verduidelijkt: per instelregel een `?` hover/focus-help toegevoegd met korte functionele uitleg.
- 2026-05-04: Aparte WK 2026 module toegevoegd naast reguliere competitie (route `/manager/world-cup` + nav-entry), inclusief 48 deelnemende landen met confederatie/hoststatus en faseschema (groepsfase t/m finale).
- 2026-05-04: Manager-menu uitgebreid met expliciete mode-switch (`Eredivisie` / `WK 2026`); actieve mode bepaalt zichtbare navigatie-items.
- 2026-05-04: WK mode functioneel gelijkgetrokken met Eredivisie mode via dezelfde Team/Transfers/Competities-paginaflow, met WK-routes en WK-speelrondes waarbij ronde 1/2/3 de groepswedstrijdvolgorde per land representeren.
- 2026-05-04: Manager-state opslag gesplitst per mode (`eredivisie` vs `wk`) via scope-aware API en aparte persistencebestanden, zodat opstellingen en transferstatus volledig onafhankelijk blijven.
- 2026-05-04: Runtime-isolatie uitgebreid met optionele env-variabele `MANAGER_STATE_WK_PATH` naast `MANAGER_STATE_PATH`, zodat ook bestandslocaties per mode expliciet te scheiden zijn op staging/prod.
- 2026-05-04: Instellingenpagina uitgebreid met een zichtbare debug-sectie die de actieve manager-state opslagpaden voor Eredivisie en WK toont.
- 2026-05-04: Pitch-achtergrond vanaf nul opnieuw opgebouwd door de laatst aangeleverde referentie-afbeelding direct als asset te gebruiken (`/public/images/pitch-reference.jpg`), zodat veldvisual exact overeenkomt met het voorbeeld; overlays/dieptelijnen verwijderd.
- 2026-05-04: Pitch-referentiebeeld ingesteld op 200% zoom en visueel aangescherpt via subtiele contrast/saturatie/brightness-filtering op de achtergrondlaag, met ongewijzigde kaart-interactie.
- 2026-05-04: WK-mode terminologie aangepast: overal in transfermarkt `Club` vervangen door `Land` (incl. `Alle landen`, `Zoek speler/land` en sorteerkolomheader).
- 2026-05-04: WK-speelschema vervangen met KPN-brondata (104 wedstrijden) en correcte ronde-opbouw van groepsfase t/m finale, inclusief zestiende finales en troostfinale.
