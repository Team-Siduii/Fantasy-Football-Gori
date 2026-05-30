# Dataplan — Gratis databronnen voor WK-wedstrijden (Gori)

> Doel: een robuuste gratis datalaag opzetten voor wedstrijd-events, met duidelijke fallback en datakwaliteit-labels.

## 1) Benodigde velden (vereisten)

Per wedstrijd willen we:
- tussenstand (HT) en eindstand (FT)
- doelpuntenmakers
- assistgevers
- aantal reddingen keeper
- gele kaarten
- rode kaarten

## 2) Geverifieerde gratis bronnen

## Bron A — OpenLigaDB (primair voor score + goals)
- API: `https://api.openligadb.de/`
- Bevestigd beschikbaar: wedstrijdmeta, tussen/eindresultaten (`matchResults`), goals (`goals[]` met minuut/scorer)
- Sterk in:
  - HT/FT score
  - goalscorers
- Zwak in:
  - assists
  - keeper saves
  - kaarten als complete eventfeed

## Bron B — TheSportsDB (secundair/fallback)
- API: `https://www.thesportsdb.com/api/v1/json/3/`
- Bevestigd beschikbaar: events + basis scores
- Sterk in:
  - fixtures/scores
- Zwakker/variabel in:
  - volledig eventdetail (assists/saves/cards)

## Bron C — worldcupjson (lichte fallback)
- API: `https://worldcupjson.net/matches`
- Bevestigd beschikbaar: wedstrijdniveau
- Gebruik: alleen als extra fallback voor schema/score, niet voor complete eventstats

## 3) Aanbevolen datamodel in Gori

Per match-record:
- `source`: `openligadb | thesportsdb | worldcupjson`
- `sourceMatchId`
- `kickoffAt`
- `homeTeam`, `awayTeam`
- `scoreHT`: `{ home, away } | null`
- `scoreFT`: `{ home, away } | null`
- `events[]`:
  - `type`: `goal | assist | yellow_card | red_card | goalkeeper_save`
  - `minute`
  - `team`
  - `playerName`
  - `playerExternalId`
  - `relatedPlayerName` (bijv. assist bij goal)
  - `source`
  - `confidence`: `high | medium | low`
- `quality`:
  - `hasScoreHT`, `hasScoreFT`, `hasGoals`, `hasAssists`, `hasSaves`, `hasCards`
  - `completeness`: 0–100

## 4) Mapping-strategie (source -> Gori)

Stapvolgorde:
1. Match op `external_player_id` (indien aanwezig)
2. Anders normalize op naam (`lowercase`, accenten strippen, spaties/tekens normaliseren)
3. Team + positie als tie-breaker
4. Ambigue match -> `unresolved` queue, niet blind mergen

## 5) Ingestie-architectuur (gratis-first)

1. **Fetch layer**
   - Pull OpenLigaDB voor wedstrijd + goals + HT/FT
   - Pull TheSportsDB voor aanvullende events waar beschikbaar
2. **Normalize layer**
   - Alles naar één intern `MatchEvent` schema
3. **Merge layer**
   - Prioriteit per veld:
     - HT/FT: OpenLigaDB > TheSportsDB > worldcupjson
     - Goals: OpenLigaDB > TheSportsDB
     - Assists/Saves/Cards: TheSportsDB > OpenLigaDB
4. **Quality layer**
   - Zet quality flags per wedstrijd
   - Zet `confidence` per event
5. **Storage layer**
   - Opslaan per ronde in Gori state/store
6. **Consumption layer**
   - UI toont waarden + (optioneel) quality indicator bij incomplete velden

## 6) Fallback-regels

- Als assist/saves/cards ontbreken:
  - waarde `null` houden
  - quality-flag op `false`
  - geen fake 0 invullen
- Als alle events ontbreken maar score wel bekend is:
  - score tonen
  - events-sectie markeren als “onvolledig uit gratis bron”

## 7) Cron/sync voorstel

- Frequentie: elke 10-15 min tijdens actieve wedstrijddagen, anders elk uur
- Safe mode:
  - bij lege response of rate-limit: vorige geldige snapshot behouden
  - retries met backoff
  - foutmelding loggen zonder UI hard-fail

## 8) Implementatieplan (kort)

1. `src/lib/data-sources/` adapters toevoegen voor OpenLigaDB + TheSportsDB
2. Normalizer + merger bouwen naar intern schema
3. Quality/completeness scorer toevoegen
4. Opslag per ronde integreren
5. UI-label “data compleetheid” toevoegen
6. Tests:
   - mapping tests
   - merge-priority tests
   - incomplete data tests

## 9) Resultaatverwachting

Met gratis bronnen kun je nu al betrouwbaar leveren:
- tussenstand/eindstand
- goalscorers

En met lagere zekerheid/regelmatige gaten:
- assists
- keeper saves
- gele/rode kaarten

Dat is een prima MVP-laag; later kun je premium provider pluggen zonder modelwijziging (alleen nieuwe adapter).