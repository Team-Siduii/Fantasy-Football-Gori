# Implementatieplan — transfermechanisme poulewedstrijden

## Doel
Implementeer een ronde-gestuurde transferflow voor poulewedstrijden met 4 fases:
1. **Sell-fase**: elke manager kiest 1 speler om te verkopen óf kiest expliciet voor geen transfer.
2. **Buy-fase**: alleen managers die verkocht hebben kiezen een vervanger.
3. **Resolutie-fase**: dubbele koopkeuzes worden opgelost op basis van **lagere positie op de ranglijst = voorrang**.
4. **Afronding-fase**: gewonnen transfers worden uitgevoerd; verliezers van een conflict moeten vóór de volgende ronde een nieuwe koopkeuze maken.

Tijdens alle fases moet de UI zichtbaar maken:
- op welke fase de ronde zit;
- welke managers nog actie moeten uitvoeren;
- welke managers klaar zijn;
- welke managers opnieuw moeten kiezen wegens verloren conflict.

Daarnaast blijven bestaande beperkingen gelden:
- geldige formatie;
- budget cap;
- max 2 spelers per land;
- exclusiviteit van spelers binnen de league.

## Huidige situatie / impactanalyse

### Bestaande flow
De huidige transferflow leeft grotendeels in `src/app/manager/my-team/page.tsx` en is lokaal/account-gebonden:
- verkopen zet direct een placeholder in teamstate;
- kopen vult direct de placeholder;
- state wordt per manager/ronde opgeslagen via `/api/manager/state` + `src/lib/manager-state.ts`;
- er is **geen gedeelde ronde-state** voor transfers over alle managers heen;
- er is **geen conflictresolutie** tussen managers behalve implicit first-write-wins;
- ranking bestaat al via `src/app/api/manager/league-ranking/route.ts`.

### Gevolgen voor bestaande architectuur
Deze feature raakt meerdere lagen:

1. **Nieuw domein / shared store nodig**
   - huidige `pendingSellId`/`pendingBuyId` zijn niet genoeg;
   - er is rondebrede transfercoördinatie nodig per mode (`eredivisie|wk`) en per ronde;
   - status moet managers, fases, picks, conflicts en winners/losers kunnen bewaren.

2. **Manager-state blijft relevant, maar krijgt andere rol**
   - manager persoonlijke teamstate blijft bron voor roster/layout;
   - gedeelde transferstate wordt bron voor workflowstatus;
   - teammutatie mag pas definitief plaatsvinden bij resolutie/winnaars.

3. **UI-impact op My Team**
   - huidige directe drop+add UX moet worden vervangen door fase-gestuurde keuzes;
   - transfermarkt en sell-selector moeten fase-aware worden;
   - overzichtskaarten voor `wachten op managers` en `fase-status` moeten worden toegevoegd.

4. **Regel-/validatie-impact**
   - transfervalidaties moeten centraal herbruikbaar worden;
   - bestaande draft-validatie voor `max 2 spelers per land` moet ook voor transfers toepasbaar worden;
   - budget/formatie/open-slot checks mogen niet alleen client-side blijven.

5. **Ranking/tiebreak-impact**
   - ranglijst moet gebruikt kunnen worden als tie-break input;
   - resolutie moet deterministic zijn en testbaar.

6. **Documentatie-impact**
   - `docs/functioneel-design.md` beschrijft nu nog directe drop+add / first-write-wins;
   - moet worden herschreven naar nieuwe 4-fasen transferflow.

## Voorgestelde aanpak

### A. Nieuw transfer-round domein introduceren
Maak een nieuw domein + persistente store voor gedeelde transferrondes, bijvoorbeeld:
- `src/domain/transfer-round.ts`
- `src/lib/transfer-round-state.ts`
- `src/app/api/manager/transfer-round/route.ts`

### Voorstel datamodel
Per mode + ronde bewaren we ongeveer:
- `roundNumber`
- `phase: "SELL" | "BUY" | "RESOLUTION" | "AWAITING_RETRY" | "COMPLETED"`
- `entries[]` per manager:
  - `managerId`
  - `displayName`
  - `teamName`
  - `rankingPosition`
  - `sellChoice: { status: "PENDING" | "SKIP" | "SOLD", playerId? }`
  - `buyChoice: { status: "PENDING" | "SUBMITTED" | "WON" | "LOST" | "RETRY_REQUIRED", playerId? }`
  - `resolvedTransfer?: { soldPlayerId, boughtPlayerId }`
- `conflicts[]`:
  - `playerId`
  - `candidateManagerIds[]`
  - `winnerManagerId`
  - `loserManagerIds[]`
- `auditLog[]`

### B. Centrale domeinfuncties bouwen
In `src/domain/transfer-round.ts` pure functies voor:
- opbouwen/initialiseren van ronde-state op basis van accepted participants;
- submit sell/skip;
- bepalen of fase 1 klaar is;
- submit buy;
- bepalen of fase 2 klaar is;
- conflictgroepering op `playerId`;
- winnerselectie obv laagste rankingpositie;
- markeren van losers als `RETRY_REQUIRED`;
- afronden van gewonnen transfers;
- bepalen van pending managers per fase.

### C. Server-side validaties centraliseren
Maak herbruikbare transfervalidatie, liefst in een nieuw domeinbestand of uitbreiding van bestaande transferlogica:
- speler bestaat;
- speler zit niet al in eigen team;
- speler past in open positie / formatie;
- team blijft binnen budget cap;
- max 2 spelers per land blijft geldig;
- transfer mag geen dubbele roster-speler creëren.

Mogelijke plek:
- uitbreiding `src/domain/transfer-workflow.ts`
- of nieuw `src/domain/transfer-validation.ts`

### D. API-laag toevoegen
Nieuwe route voor shared workflow, bijvoorbeeld:
- `GET /api/manager/transfer-round?mode=wk&roundNumber=1`
- `POST` acties:
  - `submit-sell`
  - `skip-sell`
  - `submit-buy`
  - `resolve-round`
  - `retry-buy`

Server doet:
- auth-check;
- manager-id resolve;
- accepted participant check;
- ranking ophalen/afleiden;
- validatie;
- persist shared transfer-round state;
- bij gewonnen transfers: manager teamstate muteren via `saveManagerStateForRoundPersistent`.

### E. My Team UI migreren naar fasegestuurde flow
In `src/app/manager/my-team/page.tsx`:
- laad transfer-round status naast manager-state;
- vervang huidige directe sell->placeholder->instant buy flow door:
  - fasekaart boven transfermarkt;
  - overzicht `wachten op` managers;
  - knoppen/teksten afhankelijk van actieve fase en eigen status;
- alleen de manager die actie moet doen krijgt relevante controls;
- losers van conflicts krijgen expliciete melding + nieuwe buy-selectie;
- managers met `skip` zijn na fase 1 klaar.

### F. Functioneel design synchroniseren
Update `docs/functioneel-design.md` met:
- aangepaste transferbeschrijving;
- nieuwe FR’s voor faseflow/wachtoverzicht/ranking-priority/retry-flow;
- bijgewerkte acceptatiecriteria;
- open vragen/besluitenlog sync.

## Waarschijnlijke bestanden die wijzigen

### Nieuw
- `src/domain/transfer-round.ts`
- `src/lib/transfer-round-state.ts`
- `src/app/api/manager/transfer-round/route.ts`
- `tests/domain/transfer-round.test.ts`
- mogelijk `tests/lib/transfer-round-state.test.ts`

### Bestaand
- `src/app/manager/my-team/page.tsx`
- `src/domain/transfer-workflow.ts`
- `src/domain/transfer-policy.ts` (mogelijk)
- `src/lib/manager-state.ts` (alleen als shared helpers nodig zijn)
- `src/app/api/manager/league-ranking/route.ts` (mogelijk helper extractie of ranking metadata)
- `docs/functioneel-design.md`
- `tests/e2e/manager-flows.spec.ts` (waarschijnlijk aanpassen/vervangen)

## Implementatiestappen
1. Shared transfer-round domein ontwerpen en unit tests schrijven.
2. Persistente store voor transfer-round state toevoegen.
3. API-route bouwen voor read/write acties.
4. Centrale transfervalidatie voor budget/formatie/max per land toevoegen.
5. My Team UI refactoren naar faseflow + wachtoverzichten.
6. Integreren van resolutie en retry-flow.
7. Functioneel design updaten.
8. Unit tests + lint + build draaien.
9. Reviewen, committen, pushen naar `staging` en deploy verifiëren.

## Teststrategie

### Unit
- `tests/domain/transfer-round.test.ts`
  - sell/skip gating
  - buy gating
  - conflict detectie
  - winnaar obv lagere rankingpositie
  - retry required voor verliezer
  - completed zodra alle open conflicts verwerkt zijn

- transfervalidaties:
  - budgetblokkade
  - ongeldige formatie/open slot
  - max 2 spelers per land
  - dubbele speler blokkeren

### Integratie / store
- persist read/write per mode + ronde
- accepted participants worden correct geïnitialiseerd

### E2E / smoke
- manager A verkoopt/kies speler
- manager B kiest dezelfde speler
- resolutie geeft lagere ranking voorrang
- verliezende manager ziet retry-status

## Risico’s / aandachtspunten
- huidige page-component is groot; kans op regressies in bestaande team-UX;
- ranking-route gebruikt nu subpoule/seed-logica die mogelijk niet generiek genoeg is voor alle managers;
- directe teammutaties pas doen bij resolutie voorkomt inconsistentie, maar vereist zorgvuldige migratie van bestaande `pendingSellId`/`pendingBuyId` gedrag;
- bestaande e2e-transferflow lijkt verouderd en moet vrijwel zeker mee aangepast worden.

## Werkafspraak voor uitvoering
- Branch: `staging`
- Code + functioneel design in dezelfde change set
- Voor push minimaal: relevante vitest tests + lint + build
- Daarna push `origin/staging` + staging deploy verificatie
