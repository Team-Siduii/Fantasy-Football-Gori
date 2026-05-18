"use client";

import { useEffect, useMemo, useState } from "react";

type LeagueMode = "eredivisie" | "wk";

type LeagueRuleNote = {
  id: string;
  title: string;
  description: string;
  impact: string;
};

type LeagueAdminConfig = {
  scoringProfile: { id: string; type: "CLASSIC" | "CUSTOM"; label: string };
  waiver: { enabled: boolean; round: { tieBreaker: "PRIORITY" | "EARLIEST_BID" } };
  budget: { teamValueCapMillions: number };
  competition: { cupTiePolicy: "PENALTIES" | "HIGHER_SEED"; formats: string[] };
  roles: { ownerId: string; commissionerIds: string[]; managerIds: string[] };
  customRuleNotes: LeagueRuleNote[];
};

type RuleHelpKey = "scoringProfile" | "budgetCap" | "waiverTieBreaker" | "cupTiePolicy" | "commissioners" | "managers";

const RULE_HELP_TEXT: Record<RuleHelpKey, string> = {
  scoringProfile:
    "Classic gebruikt de standaard puntentelling. Custom is bedoeld voor een eigen puntenmodel (fase 2) en laat je alternatieve bonus/malus-regels beheren.",
  budgetCap:
    "Maximale totale teamwaarde in miljoenen voor de actieve competitie-mode. Transfers boven deze cap worden automatisch geblokkeerd.",
  waiverTieBreaker:
    "Bepaalt wie wint als meerdere managers dezelfde speler claimen in waiver. Priority = vaste prioriteitsvolgorde. Earliest bid = vroegste geldige bod wint.",
  cupTiePolicy:
    "Bepaalt hoe een gelijke stand in de cup wordt beslist. Penalties = strafschoppen. Higher seed = hoger geplaatste team gaat door.",
  commissioners:
    "Manager-ID's met extra beheerdersrechten voor league-regels en instellingen. Komma-gescheiden lijst, bijvoorbeeld: owner-1,comm-1.",
  managers: "Alle manager-ID's die in deze league actief zijn. Deze lijst wordt gebruikt voor permissies en rolvalidatie.",
};

function RuleLabel({ text, helpKey }: { text: string; helpKey: RuleHelpKey }) {
  return (
    <span className="field-label">
      {text}
      <span className="help-dot" tabIndex={0} role="note" aria-label={`${text}: ${RULE_HELP_TEXT[helpKey]}`}>
        ?
      </span>
      <span className="help-tooltip" role="tooltip">
        {RULE_HELP_TEXT[helpKey]}
      </span>
    </span>
  );
}

function cloneConfig(input: LeagueAdminConfig): LeagueAdminConfig {
  return {
    scoringProfile: { ...input.scoringProfile },
    waiver: { enabled: input.waiver.enabled, round: { ...input.waiver.round } },
    budget: { teamValueCapMillions: input.budget.teamValueCapMillions },
    competition: { cupTiePolicy: input.competition.cupTiePolicy, formats: [...input.competition.formats] },
    roles: {
      ownerId: input.roles.ownerId,
      commissionerIds: [...input.roles.commissionerIds],
      managerIds: [...input.roles.managerIds],
    },
    customRuleNotes: (input.customRuleNotes ?? []).map((note, index) => ({
      id: note.id || `custom-${index + 1}`,
      title: note.title ?? "",
      description: note.description ?? "",
      impact: note.impact ?? "",
    })),
  };
}

function summarizeImpact(config: LeagueAdminConfig): string[] {
  const modeBudgetText = `Teamwaarde-cap staat op €${config.budget.teamValueCapMillions.toFixed(1)}M in deze mode.`;
  const scoringText =
    config.scoringProfile.type === "CUSTOM"
      ? "Scoring profile staat op Custom: punten kunnen afwijken van standaard CVHJ-gedrag."
      : "Scoring profile staat op Classic: standaard puntentelling blijft actief.";
  const waiverText =
    config.waiver.round.tieBreaker === "EARLIEST_BID"
      ? "Waiver tie-breaker: vroegste geldige bod wint bij gelijke claims."
      : "Waiver tie-breaker: prioriteitsvolgorde bepaalt winnaar bij gelijke claims.";
  const cupText =
    config.competition.cupTiePolicy === "HIGHER_SEED"
      ? "Cup ties: hoger geplaatste team gaat door bij gelijkspel."
      : "Cup ties: beslissen via penalties bij gelijkspel.";

  return [modeBudgetText, scoringText, waiverText, cupText];
}

export function LeagueConfigEditor() {
  const [mode, setMode] = useState<LeagueMode>("eredivisie");
  const [config, setConfig] = useState<LeagueAdminConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<LeagueAdminConfig | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasUnsavedChanges = useMemo(() => {
    if (!config || !initialConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(initialConfig);
  }, [config, initialConfig]);

  const impactSummary = useMemo(() => (config ? summarizeImpact(config) : []), [config]);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setMessage("");
      setSaving(false);
      const res = await fetch(`/api/admin/league-config?mode=${mode}`, { cache: "no-store" });
      const data = (await res.json()) as { config?: LeagueAdminConfig; error?: string };

      if (!res.ok || !data.config) {
        setMessageType("error");
        setMessage(data.error ?? "Kon config niet laden");
        setConfig(null);
        setInitialConfig(null);
      } else {
        const copied = cloneConfig(data.config);
        setConfig(copied);
        setInitialConfig(cloneConfig(copied));
      }

      setLoading(false);
    }

    void run();
  }, [mode]);

  async function save() {
    if (!config || saving) return;

    setSaving(true);
    setMessageType("info");
    setMessage("Instellingen opslaan...");

    const payload = {
      scoringProfile: {
        ...config.scoringProfile,
        type: config.scoringProfile.type,
      },
      waiver: config.waiver,
      budget: {
        teamValueCapMillions: config.budget.teamValueCapMillions,
      },
      competition: config.competition,
      roles: {
        ...config.roles,
        commissionerIds: config.roles.commissionerIds,
        managerIds: config.roles.managerIds,
      },
      customRuleNotes: config.customRuleNotes,
    };

    const res = await fetch(`/api/admin/league-config?mode=${mode}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string; config?: LeagueAdminConfig };
    if (!res.ok || !data.ok || !data.config) {
      setMessageType("error");
      setMessage(data.error ?? "Opslaan mislukt");
      setSaving(false);
      return;
    }

    const copied = cloneConfig(data.config);
    setConfig(copied);
    setInitialConfig(cloneConfig(copied));
    setMessageType("success");
    setMessage(`${mode === "wk" ? "WK" : "Eredivisie"} instellingen opgeslagen ✅`);
    setSaving(false);
  }

  function resetChanges() {
    if (!initialConfig) return;
    setConfig(cloneConfig(initialConfig));
    setMessageType("info");
    setMessage("Wijzigingen teruggezet naar laatst opgeslagen versie.");
  }

  function addCustomRule() {
    if (!config) return;
    setConfig({
      ...config,
      customRuleNotes: [
        ...config.customRuleNotes,
        {
          id: `custom-${Date.now()}`,
          title: "",
          description: "",
          impact: "",
        },
      ],
    });
  }

  function updateCustomRule(id: string, field: keyof LeagueRuleNote, value: string) {
    if (!config) return;
    setConfig({
      ...config,
      customRuleNotes: config.customRuleNotes.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)),
    });
  }

  function removeCustomRule(id: string) {
    if (!config) return;
    setConfig({
      ...config,
      customRuleNotes: config.customRuleNotes.filter((rule) => rule.id !== id),
    });
  }

  return (
    <section className="card col-12">
      <div className="settings-editor-head">
        <div>
          <h2>League instellingen beheren</h2>
          <p className="muted">Kies eerst een mode en pas daarna alleen die competitie aan. Je wijzigingen blijven gescheiden per mode.</p>
        </div>
        <div className={`settings-mode-pill settings-mode-pill--${mode}`}>Actief: {mode === "wk" ? "WK" : "Eredivisie"}</div>
      </div>

      <div className="mode-switch settings-mode-switch" aria-label="Config mode">
        <span className="mode-switch-label">Stap 1 — kies competitie</span>
        <div className="mode-switch-buttons">
          <button type="button" className={`mode-switch-button ${mode === "eredivisie" ? "active" : ""}`} onClick={() => setMode("eredivisie")}>
            Eredivisie
          </button>
          <button type="button" className={`mode-switch-button ${mode === "wk" ? "active" : ""}`} onClick={() => setMode("wk")}>
            WK
          </button>
        </div>
      </div>

      {loading ? <p className="muted" style={{ marginTop: 12 }}>Config laden...</p> : null}
      {!loading && !config ? <p className="error-text">{message || "Geen config"}</p> : null}

      {!loading && config ? (
        <>
          <div className="settings-hint-list">
            <span>Stap 2 — pas regels aan</span>
            <span>Stap 3 — sla op</span>
            {hasUnsavedChanges ? <span className="settings-hint-warning">Niet-opgeslagen wijzigingen</span> : <span>Alles opgeslagen</span>}
          </div>

          <div className="grid" style={{ marginTop: 12 }}>
            <section className="card col-6 settings-subcard">
              <h3>Spelregels</h3>
              <div className="grid">
                <label className="field col-12">
                  <RuleLabel text="Scoring profiel" helpKey="scoringProfile" />
                  <select
                    value={config.scoringProfile.type}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        scoringProfile: {
                          ...config.scoringProfile,
                          type: event.target.value as "CLASSIC" | "CUSTOM",
                          id: event.target.value === "CLASSIC" ? "classic" : "custom",
                          label: event.target.value === "CLASSIC" ? "Classic" : "Custom",
                        },
                      })
                    }
                  >
                    <option value="CLASSIC">Classic (default)</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </label>

                <label className="field col-12">
                  <RuleLabel text="Budget cap (miljoen)" helpKey="budgetCap" />
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={config.budget.teamValueCapMillions}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setConfig({
                        ...config,
                        budget: {
                          teamValueCapMillions: Number.isFinite(parsed) && parsed > 0 ? parsed : config.budget.teamValueCapMillions,
                        },
                      });
                    }}
                  />
                </label>

                <label className="field col-12">
                  <RuleLabel text="Waiver tie-breaker" helpKey="waiverTieBreaker" />
                  <select
                    value={config.waiver.round.tieBreaker}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        waiver: {
                          ...config.waiver,
                          round: {
                            ...config.waiver.round,
                            tieBreaker: event.target.value as "PRIORITY" | "EARLIEST_BID",
                          },
                        },
                      })
                    }
                  >
                    <option value="PRIORITY">Priority</option>
                    <option value="EARLIEST_BID">Earliest bid</option>
                  </select>
                </label>

                <label className="field col-12">
                  <RuleLabel text="Cup tie policy" helpKey="cupTiePolicy" />
                  <select
                    value={config.competition.cupTiePolicy}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        competition: {
                          ...config.competition,
                          cupTiePolicy: event.target.value as "PENALTIES" | "HIGHER_SEED",
                        },
                      })
                    }
                  >
                    <option value="PENALTIES">Penalties</option>
                    <option value="HIGHER_SEED">Higher seed</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="card col-6 settings-subcard">
              <h3>Rollen & rechten</h3>
              <div className="grid">
                <label className="field col-12">
                  <RuleLabel text="Commissioners (comma-separated manager ids)" helpKey="commissioners" />
                  <input
                    value={config.roles.commissionerIds.join(",")}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        roles: {
                          ...config.roles,
                          commissionerIds: event.target.value
                            .split(",")
                            .map((id) => id.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </label>

                <label className="field col-12">
                  <RuleLabel text="Managers (comma-separated manager ids)" helpKey="managers" />
                  <input
                    value={config.roles.managerIds.join(",")}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        roles: {
                          ...config.roles,
                          managerIds: event.target.value
                            .split(",")
                            .map((id) => id.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <section className="card col-12 settings-subcard">
              <div className="settings-editor-head">
                <h3>Aanvullende spelregels</h3>
                <button type="button" className="ghost-button" onClick={addCustomRule}>+ Regel toevoegen</button>
              </div>
              <p className="muted-note">Gebruik dit voor nieuwe regels. Deze komen automatisch op de Spelregels-pagina met beschrijving en impact.</p>
              <div className="grid" style={{ marginTop: 8 }}>
                {config.customRuleNotes.length === 0 ? <p className="muted-note">Nog geen extra regels toegevoegd.</p> : null}
                {config.customRuleNotes.map((rule) => (
                  <div key={rule.id} className="card col-12 settings-subcard">
                    <div className="grid">
                      <label className="field col-4">
                        <span className="field-label">Regel titel</span>
                        <input value={rule.title} onChange={(event) => updateCustomRule(rule.id, "title", event.target.value)} />
                      </label>
                      <label className="field col-4">
                        <span className="field-label">Beschrijving</span>
                        <input value={rule.description} onChange={(event) => updateCustomRule(rule.id, "description", event.target.value)} />
                      </label>
                      <label className="field col-4">
                        <span className="field-label">Impact</span>
                        <input value={rule.impact} onChange={(event) => updateCustomRule(rule.id, "impact", event.target.value)} />
                      </label>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="ghost-button" onClick={() => removeCustomRule(rule.id)}>Verwijder regel</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card col-12 settings-subcard">
              <h3>Impact van huidige regels</h3>
              <ul>
                {impactSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {config.customRuleNotes.length > 0 ? (
                <>
                  <h4>Aanvullende impact</h4>
                  <ul>
                    {config.customRuleNotes.map((note) => (
                      <li key={note.id}>{note.impact || `${note.title || "Nieuwe regel"}: impact nog niet ingevuld`}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>

          <div className="settings-actions">
            <button type="button" onClick={() => void save()} disabled={!hasUnsavedChanges || saving}>
              {saving ? "Opslaan..." : `Opslaan (${mode === "wk" ? "WK" : "Eredivisie"})`}
            </button>
            <button type="button" className="ghost-button" onClick={resetChanges} disabled={!hasUnsavedChanges || saving}>
              Herstel wijzigingen
            </button>
          </div>

          {message ? <p className={messageType === "error" ? "error-text" : messageType === "success" ? "success-text" : "muted-note"}>{message}</p> : null}
        </>
      ) : null}
    </section>
  );
}
