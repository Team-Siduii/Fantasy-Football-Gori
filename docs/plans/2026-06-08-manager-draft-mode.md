# Manager Draft Mode — Implementatieplan

> **Voor Hermes:** Gebruik subagent-driven-development skill om dit plan task-by-task te implementeren.

**Goal:** Bouw een "manager draft mode" waarbij elke deelnemende manager via zijn eigen account spelers kiest, configureerbaar via de admin console. In deze modus kan een manager alleen picken als het zijn beurt is en alleen voor zijn eigen team.

**Architecture:** Voeg een `draftMode` veld toe aan `LeagueAdminConfig` (`"admin"` of `"manager"`). De draft API route valideert bij `registerPick` dat de authenticated user matcht met de team-manager. De draft pagina toont/verbergt de admin controls op basis van deze mode en enforceert client-side dat alleen de juiste manager kan picken.

**Tech Stack:** TypeScript, Next.js 15, React 19, bestaande auth-session codec

**Files:**
- Modify: `src/lib/league-admin-config.ts` — voeg DraftMode type + default toe
- Modify: `src/components/league-config-editor.tsx` — voeg draft mode selector toe
- Modify: `src/lib/draft-manager-sync.ts` — voeg `resolveDraftTeamManagerEmail` export check
- Modify: `src/app/api/draft/route.ts` — enforce manager-mode pick validatie
- Modify: `src/app/draft/page.tsx` — toon/verberg admin controls, enforce my-turn-only picking
- Modify: `src/app/manager/world-cup/draft/page.tsx` — idem voor WK modus (indien apart bestand)
- Test: `tests/lib/league-admin-config.test.ts` — voeg draftMode test toe
- Test: `tests/lib/draft-state.test.ts` — voeg manager-mode validatie test toe

---

### Task 1: Voeg `DraftMode` type toe aan `LeagueAdminConfig`

**Objective:** Definieer het draft mode veld en default waarde

**Files:**
- Modify: `src/lib/league-admin-config.ts`

**Step 1: Voeg type en veld toe**

```typescript
// Bovenin, na LeagueMode type:
export type DraftMode = "admin" | "manager";

// In LeagueAdminConfig type, breid draft uit:
export type LeagueAdminConfig = {
  // ... bestaande velden ...
  draft: {
    totalRounds: number;
    mode: DraftMode;  // ← nieuw veld
  };
  // ...
};
```

**Step 2: Voeg default toe in `defaultConfig()`**

In `defaultConfig(mode: LeagueMode)`, pas de `draft` sectie aan:

```typescript
draft: {
  totalRounds: 15,
  mode: "admin" as DraftMode,  // default: admin doet alles
},
```

**Step 3: Voeg toe in `normalize()` merge**

In `normalize(input, mode)`, voeg toe in de merge:

```typescript
draft: {
  totalRounds: typeof input.draft?.totalRounds === "number" ? input.draft.totalRounds : base.draft.totalRounds,
  mode: input.draft?.mode === "manager" ? "manager" : (base.draft.mode || "admin"),
},
```

**Step 4: Build check**

```bash
cd /tmp/gori && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add src/lib/league-admin-config.ts
git commit -m "feat: add DraftMode type and default to LeagueAdminConfig"
```

---

### Task 2: Update `mergeLeagueAdminConfig` voor `draft.mode`

**Objective:** Zorg dat merge de nieuwe `draft.mode` correct overschrijft

**Files:**
- Modify: `src/lib/league-admin-config.ts` — de `mergeLeagueAdminConfig` functie

**Step 1: Lees de merge functie**

Zoek `function mergeLeagueAdminConfig` in league-admin-config.ts. Voeg `draft.mode` toe aan de merge:

```typescript
draft: {
  totalRounds: next.draft?.totalRounds ?? current.draft.totalRounds,
  mode: next.draft?.mode ?? current.draft.mode,
},
```

**Step 2: Build check**

```bash
cd /tmp/gori && npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/lib/league-admin-config.ts
git commit -m "fix: include draft.mode in mergeLeagueAdminConfig"
```

---

### Task 3: Update `league-config-editor.tsx` type en UI

**Objective:** Voeg draft mode selector toe aan de admin config UI

**Files:**
- Modify: `src/components/league-config-editor.tsx`

**Step 1: Update de client-side `LeagueAdminConfig` type**

In de component, pas de `draft` property aan:

```typescript
type LeagueAdminConfig = {
  // ... bestaand ...
  draft: { totalRounds: number; mode: "admin" | "manager" };
  // ...
};
```

**Step 2: Update `cloneConfig()`**

```typescript
draft: { 
  totalRounds: input.draft?.totalRounds ?? 15,
  mode: input.draft?.mode ?? "admin",
},
```

**Step 3: Voeg de draft mode radio/select toe in de UI**

Vind de draft-rondes sectie (regel 304-319) en voeg er direct onder toe:

```tsx
<label className="field col-12">
  <span className="field-label">Draft modus</span>
  <select
    value={config.draft.mode}
    onChange={(event) =>
      setConfig({
        ...config,
        draft: {
          ...config.draft,
          mode: event.target.value as "admin" | "manager",
        },
      })
    }
  >
    <option value="admin">Admin (beheerder kiest voor iedereen)</option>
    <option value="manager">Manager (iedereen kiest zelf)</option>
  </select>
  <span className="field-hint">
    {config.draft.mode === "manager"
      ? "Elke manager kiest spelers vanuit zijn eigen account. Alleen jouw beurt is actief."
      : "De beheerder voert alle picks uit via het draft-scherm."}
  </span>
</label>
```

**Step 4: Build check**

```bash
cd /tmp/gori && npm run build 2>&1 | tail -10
```

**Step 5: Commit**

```bash
git add src/components/league-config-editor.tsx
git commit -m "feat: add draft mode selector to league config editor"
```

---

### Task 4: Enforce manager-mode in draft API route

**Objective:** Bij `draftMode === "manager"`, valideer dat de ingelogde gebruiker de manager van het team is

**Files:**
- Modify: `src/app/api/draft/route.ts`

**Step 1: Importeer benodigde functies**

Voeg toe aan de imports:
```typescript
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { resolveDraftTeamManagerEmail } from "@/lib/draft-manager-sync";
```

**Step 2: Voeg manager validatie toe in de `pick` actie**

In de `POST` handler, na `if (body.action === "pick")`, voeg een check toe:

```typescript
if (body.action === "pick") {
  if (!body.teamId || !body.playerId) {
    return NextResponse.json({ error: "teamId en playerId zijn verplicht" }, { status: 400 });
  }
  
  // Manager mode check
  const config = await getLeagueAdminConfigPersistent(scope);
  if (config.draft.mode === "manager") {
    const email = await getAuthenticatedEmail();
    if (!email) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }
    const teamManagerEmail = resolveDraftTeamManagerEmail(body.teamId, scope);
    if (!teamManagerEmail || teamManagerEmail !== email) {
      return NextResponse.json({ error: "Je kunt alleen spelers kiezen voor je eigen team" }, { status: 403 });
    }
  }
  
  const draft = await registerPickPersistent({ ... });
  // ... rest blijft gelijk
}
```

**Step 3: Check dat de config al eerder in de functie geladen wordt**

Let op: `config` wordt al eerder geladen in de `pick` actie. Verplaats de `getLeagueAdminConfigPersistent` call naar vóór de manager check, en hergebruik de variabele.

**Hernoem de bestaande** `const config = await getLeagueAdminConfigPersistent(scope);` naar voor de pick + manager check, en verwijder de duplicaat.

**Step 4: Build check**

```bash
cd /tmp/gori && npm run build 2>&1 | tail -10
```

**Step 5: Commit**

```bash
git add src/app/api/draft/route.ts
git commit -m "feat: enforce manager-mode pick validation in draft API"
```

---

### Task 5: Update draft page UI voor manager mode

**Objective:** In manager mode: verberg admin controls, en alleen de beurt-hebbende manager kan picken

**Files:**
- Modify: `src/app/draft/page.tsx`

**Step 1: Lees de huidige `canPick` logica**

Huidig (r. 276): `const canPick = draft?.status === "ACTIVE" && Boolean(activeTeamId && pickPlayerId) && !busy;`

**Step 2: Voeg `isManagerMode` state toe**

Laad het uit de leagueConfig:
```typescript
const isManagerMode = leagueConfig?.draft?.mode === "manager";
```

**Step 3: Update `canPick`**

```typescript
const canPick = draft?.status === "ACTIVE" 
  && Boolean(activeTeamId && pickPlayerId) 
  && !busy
  && (!isManagerMode || isMyTurn);  // in manager mode: alleen bij eigen beurt
```

**Step 4: Conditioneel verbergen van admin controls**

De "Oefendraft beheren" sectie (r. 473-537) wrappen in:
```tsx
{!isManagerMode ? (
  <section className="card col-12 draft-admin-details">
    {/* bestaande admin content */}
  </section>
) : null}
```

**Step 5: Toon draft mode indicator**

In de hero sectie, voeg een indicator toe:
```tsx
{isManagerMode ? <p className="draft-eyebrow">Manager modus — jij kiest alleen voor je eigen team</p> : null}
```

**Step 6: Build check**

```bash
cd /tmp/gori && npm run build 2>&1 | tail -10
```

**Step 7: Commit**

```bash
git add src/app/draft/page.tsx
git commit -m "feat: enforce manager-mode UI — hide admin controls, restrict picking to own turn"
```

---

### Task 6: Update WK draft page (indien apart bestand)

**Objective:** Pas dezelfde wijzigingen toe op de WK draft pagina

**Files:**
- Modify: `src/app/manager/world-cup/draft/page.tsx` (indien het een apart bestand is)

**Step 1: Check of het een apart bestand is**

```bash
cat /tmp/gori/src/app/manager/world-cup/draft/page.tsx | head -5
```

Als dit bestand bestaat en eigen logica heeft, pas dezelfde wijzigingen toe als Task 5. Als het een re-export is van `src/app/draft/page.tsx`, skip deze task.

**Step 2: Commit (indien van toepassing)**

```bash
git add src/app/manager/world-cup/draft/page.tsx
git commit -m "feat: enforce manager-mode UI on WK draft page"
```

---

### Task 7: Tests schrijven en runnen

**Objective:** Verifieer dat de draft mode correct werkt

**Files:**
- Modify: `tests/lib/league-admin-config.test.ts`
- Modify: `tests/lib/draft-state.test.ts`

**Step 1: Voeg test toe voor draft mode default**

In `league-admin-config.test.ts`:
```typescript
test("default draft mode is admin", () => {
  const config = getLeagueAdminConfig("eredivisie");
  expect(config.draft.mode).toBe("admin");
});

test("manager draft mode survives roundtrip", () => {
  const updated = updateLeagueAdminConfig({ draft: { totalRounds: 15, mode: "manager" } }, "eredivisie");
  expect(updated.draft.mode).toBe("manager");
  const reloaded = getLeagueAdminConfig("eredivisie");
  expect(reloaded.draft.mode).toBe("manager");
  // Cleanup
  updateLeagueAdminConfig({ draft: { totalRounds: 15, mode: "admin" } }, "eredivisie");
});
```

**Step 2: Run tests**

```bash
cd /tmp/gori && npx vitest run tests/lib/league-admin-config.test.ts tests/lib/draft-state.test.ts 2>&1
```

**Step 3: Commit**

```bash
git add tests/lib/league-admin-config.test.ts
git commit -m "test: add draft mode unit tests"
```

---

### Task 8: Finale build + deploy

**Objective:** Build, test, push naar staging, deploy

**Step 1: Full build**

```bash
cd /tmp/gori && npm run build
```

**Step 2: Run alle tests**

```bash
cd /tmp/gori && npx vitest run 2>&1 | tail -20
```

**Step 3: Push naar staging**

```bash
cd /tmp/gori && git push origin <branch>:staging
```

**Step 4: Wacht op Vercel deploy**

Vercel auto-deployt bij push naar staging.

---

## Verificatie

Na deploy:
1. **Admin mode (default):** Ga naar `/instellingen` → draft modus staat op "Admin". Ga naar `/draft` → admin controls zichtbaar, iedereen kan picken voor elk team.
2. **Manager mode:** Zet draft modus op "Manager" in instellingen. Ga naar `/draft` → admin controls verborgen, alleen picken als jij aan de beurt bent.
3. **API enforcement:** Probeer via fetch een pick te doen voor een ander team → 403 error.
