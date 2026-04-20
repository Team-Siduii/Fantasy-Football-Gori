# Functioneel Design — Fantasy-Football-Gori

Status: Draft v0.4
Owner: Team-Siduii
Laatste update: 2026-04-20

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

### 4.2 League management
- League aanmaken en spelers uitnodigen
- Configuratie: teamgrootte, draftvolgorde, transferregels, deadline per ronde
- Admin stelt aan het begin van seizoen transferregime in:
  - Standaard: 1 transfer per team per speelronde
  - Uitzondering: exact 3 vooraf ingestelde bonusrondes waarop 3 transfers toegestaan zijn
  - Bonusrondes worden vastgelegd als ronde-nummers; elke ronde heeft startdatum+tijd en einddatum+tijd
- Admin stelt startbudget per team in voor het seizoen
- Speelrondes worden op basis van competitieschema ingeladen bij seizoenstart
- Admin kan gedurende seizoen speelrondes corrigeren (wedstrijd-naar-ronde mapping + start/eindtijd ronde)

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
- Verkoop-selector wordt geblokkeerd tijdens een open transfer (placeholder actief) en toont expliciete hint om eerst een vervanger te kopen
- Bankverdeling is vast: altijd 4 bankslots met 1x GK, 1x DEF, 1x MID en 1x FWD
- Basiselftal-weergave op het veld toont per slot de echte speler op die index (geen naamherhaling binnen een linie); elke speler-id mag maar 1x tegelijk in teamstate voorkomen
- Pitch in basiselftal krijgt een visuele halve-veld overlay (midlijn/halve cirkel + zestienmeter) voor herkenbare voetbalcontext
- Strafschopgebied-visual bevat extra diepte, 5-metergebied en halve cirkel onderaan het strafschopgebied (realistische veldweergave)
- MVP transferbudget-cap voor managerteam: maximaal €32.0M totale teamwaarde; transferbevestiging blokkeert automatisch boven cap
- Demo-team (testseed) wordt standaard binnen budget opgebouwd (<= €32.0M) zodat testen direct valide start
- Mobiele volgorde op Team-pagina: basiselftal eerst, daarna wisselspelers, daarna statistiektegels
- Transfermarkt-kolommen zijn sorteerbaar op spelernaam, positie (GK→DEF→MID→FWD), club en transferwaarde

### 4.6 Notificaties
- Draft turn
- Notificatie wanneer een manager tijdens draft een speler terugzet naar vrije pool
- Geen andere notificaties in MVP

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
FR-043: Basiselftal-veld behoudt bestaande kaart/interactie maar gebruikt een perspectivische pitch-achtergrond met schuine dieptelijnen en realistische strafschopgebieden in referentiestijl, inclusief taps toelopend onderste strafschopgebied voor consistente diepte.
FR-044: Speelrondekaart ondersteunt browsen via links/rechts-knoppen: rechts navigeert naar volgende ronde (programma), links naar vorige ronde met uitslagenweergave.
FR-045: Manager-UI is responsive op mobiel/tablet: header, kaarten, opstellingsveld en bottom navigation blijven bruikbaar zonder horizontaal scrollen in de standaard flows.
FR-046: In mobiele Team-weergave staan de secties in deze volgorde: basiselftal, wisselspelers, daarna statistiektegels.
FR-047: Transfermarkt ondersteunt kolomsortering op spelernaam, positie (GK, DEF, MID, FWD), club en transferwaarde, met omschakelbare oplopend/aflopend sorteerrichting.
FR-048: Transfermarkt-filters blijven op mobiel volledig bruikbaar: Positie/Club/Zoek stacken verticaal en elk veld gebruikt full-width.
FR-049: Tijdens een open transfer (placeholder aanwezig) is de verkoop-selector tijdelijk disabled en krijgt de manager een expliciete hint om eerst een vervanger te kopen.

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
- [ ] Basiselftal gebruikt een perspectivische pitch-achtergrond met schuine dieptelijnen en realistische strafschopgebieden, inclusief taps toelopend onderste strafschopgebied (alleen veldlaag aangepast; kaarten/interactie gelijk)
- [ ] Links/rechts-knoppen browsen speelrondes: rechts toont volgende ronde-programma, links toont vorige ronde met uitslagen
- [ ] Manager-UI blijft mobiel bruikbaar (telefoon/tablet) met responsive header, opstellingskaarten, statistiektegels en bottom navigation
- [ ] In mobiele Team-weergave staat de volgorde als: basiselftal → wisselspelers → statistiektegels
- [ ] Transfermarkt-kolommen zijn klikbaar sorteerbaar op speler, positie (GK/DEF/MID/FWD), club en transferwaarde
- [ ] Transfermarkt-filters op mobiel zijn full-width en verticaal gestapeld (Positie/Club/Zoek zonder overlap of ingedrukte velden)
- [ ] Tijdens een open transfer is de verkoop-selector disabled en toont de UI een duidelijke hint om eerst een vervanger te kopen

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
