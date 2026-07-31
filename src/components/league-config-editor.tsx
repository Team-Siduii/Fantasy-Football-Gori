"use client";

import { useEffect, useMemo, useState } from "react";

type LeagueMode = "eredivisie" | "wk";

type LeagueRuleNote = {
  id: string;
  title: string;
  description: string;
  impact: string;
};

type LeagueParticipantStatus = "PENDING" | "ACCEPTED" | "REJECTED";

type LeagueParticipant = {
  managerId: string;
  label: string;
  email: string;
  status: LeagueParticipantStatus;
};

type DraftOrderType = "snake" | "linear";

type LeagueAdminConfig = {
  competition: { name: string; cupTiePolicy: "PENALTIES" | "HIGHER_SEED"; formats: string[] };
  draft: { totalRounds: number; mode: "admin" | "manager"; orderType: DraftOrderType; teamOrder: string[] };
  scoringProfile: { id: string; type: "CLASSIC" | "CUSTOM"; label: string };
  waiver: { enabled: boolean; round: { tieBreaker: "PRIORITY" | "EARLIEST_BID" } };
  budget: { teamValueCapMillions: number; priceOffsetMillions: number };
  roles: { ownerId: string; commissionerIds: string[]; managerIds: string[] };
  participants: LeagueParticipant[];
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
    budget: { teamValueCapMillions: input.budget.teamValueCapMillions, priceOffsetMillions: input.budget.priceOffsetMillions },
    competition: { name: input.competition.name ?? "", cupTiePolicy: input.competition.cupTiePolicy, formats: [...input.competition.formats] },
    draft: {
      totalRounds: input.draft?.totalRounds ?? 15,
      mode: input.draft?.mode ?? "admin",
      orderType: input.draft?.orderType ?? "snake",
      teamOrder: [...(input.draft?.teamOrder ?? [])],
    },
    roles: {
      ownerId: input.roles.ownerId,
      commissionerIds: [...input.roles.commissionerIds],
      managerIds: [...input.roles.managerIds],
    },
    participants: (input.participants ?? []).map((participant) => ({
      managerId: participant.managerId,
      label: participant.label,
      email: participant.email,
      status: participant.status,
    })),
    customRuleNotes: (input.customRuleNotes ?? []).map((note, index) => ({
      id: note.id || `custom-${index + 1}`,
      title: note.title ?? "",
      description: note.description ?? "",
      impact: note.impact ?? "",
    })),
  };
}

function syncDraftTeamOrder(teamOrder: string[], participants: LeagueParticipant[]) {
  const acceptedIds = participants.filter((participant) => participant.status === "ACCEPTED").map((participant) => participant.managerId);
  const acceptedSet = new Set(acceptedIds);
  const dedupedPreferred = Array.from(new Set(teamOrder.filter((managerId) => acceptedSet.has(managerId))));
  const remainingAccepted = acceptedIds.filter((managerId) => !dedupedPreferred.includes(managerId));
  return [...dedupedPreferred, ...remainingAccepted];
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
        priceOffsetMillions: config.budget.priceOffsetMillions,
      },
      competition: config.competition,
      draft: config.draft,
      roles: {
        ...config.roles,
        commissionerIds: config.roles.commissionerIds,
        managerIds: config.roles.managerIds,
      },
      participants: config.participants,
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

  function updateParticipantStatus(managerId: string, status: LeagueParticipantStatus) {
    if (!config) return;
    const nextParticipants = config.participants.map((participant) =>
      participant.managerId === managerId ? { ...participant, status } : participant,
    );
    setConfig({
      ...config,
      participants: nextParticipants,
      draft: {
        ...config.draft,
        teamOrder: syncDraftTeamOrder(config.draft.teamOrder, nextParticipants),
      },
    });
  }

  function moveDraftTeamOrder(managerId: string, direction: -1 | 1) {
    if (!config) return;
    const currentOrder = syncDraftTeamOrder(config.draft.teamOrder, config.participants);
    const index = currentOrder.indexOf(managerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) {
      return;
    }
    const nextOrder = [...currentOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    setConfig({
      ...config,
      draft: {
        ...config.draft,
        teamOrder: nextOrder,
      },
    });
  }

  const acceptedParticipants = config?.participants.filter((participant) => participant.status === "ACCEPTED") ?? [];
  const configuredDraftTeamOrder = config ? syncDraftTeamOrder(config.draft.teamOrder, config.participants) : [];

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
                  <span className="field-label">Competitienaam</span>
                  <input
                    value={config.competition.name}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        competition: {
                          ...config.competition,
                          name: event.target.value,
                        },
                      })
                    }
                    placeholder={mode === "wk" ? "WK 2026" : "Eredivisie 2025/2026"}
                  />
                </label>

                <label className="field col-12">
                  <span className="field-label">Draft rondes</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={config.draft.totalRounds}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setConfig({
                        ...config,
                        draft: { ...config.draft, totalRounds: Number.isInteger(parsed) && parsed > 0 ? parsed : config.draft.totalRounds },
                      });
                    }}
                  />
                </label>

                <label className="field col-12">
                  <span className="field-label">Draft modus</span>
                  <select
                    value={config.draft.mode}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        draft: { ...config.draft, mode: event.target.value as "admin" | "manager" },
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

                <label className="field col-12">
                  <span className="field-label">Draft volgorde</span>
                  <select
                    value={config.draft.orderType}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        draft: { ...config.draft, orderType: event.target.value as DraftOrderType },
                      })
                    }
                  >
                    <option value="snake">Snake</option>
                    <option value="linear">Lineair</option>
                  </select>
                  <span className="field-hint">
                    {config.draft.orderType === "linear"
                      ? "Elke ronde loopt exact in dezelfde volgorde door."
                      : "Snake gebruikt heen-en-weer picks zodat de volgorde per cyclus omdraait."}
                  </span>
                </label>

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
                          ...config.budget,
                          teamValueCapMillions: Number.isFinite(parsed) && parsed > 0 ? parsed : config.budget.teamValueCapMillions,
                        },
                      });
                    }}
                  />
                </label>

                <label className="field col-12">
                  <span className="field-label">
                    Prijsaanpassing (miljoen)
                    <span className="help-dot" tabIndex={0} role="note" aria-label="Verlaag alle importprijzen met dit bedrag">
                      ?
                    </span>
                    <span className="help-tooltip" role="tooltip">
                      Alle spelersprijzen uit de WKCoach-import worden met dit bedrag verlaagd. 
                      Negatieve waarde = verhogen. Dit geldt alleen voor de weergave, niet voor de database.
                    </span>
                  </span>
                  <input
                    type="number"
                    step={0.5}
                    value={config.budget.priceOffsetMillions}
                    disabled={mode === "wk"}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setConfig({
                        ...config,
                        budget: {
                          ...config.budget,
                          priceOffsetMillions: Number.isFinite(parsed) ? parsed : config.budget.priceOffsetMillions,
                        },
                      });
                    }}
                  />
                  {mode === "wk" ? (
                    <small className="muted-note">WK gebruikt overal vast importwaarde min €3.0M, dus deze waarde staat bewust op slot.</small>
                  ) : null}
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
                <div>
                  <h3>Deelnemers accepteren/weigeren</h3>
                  <p className="muted-note">Alleen geaccepteerde deelnemers worden straks automatisch in de draftvolgorde gezet. Geaccepteerd: {acceptedParticipants.length}/{config.participants.length}.</p>
                </div>
              </div>
              <div className="grid" style={{ marginTop: 8 }}>
                {config.participants.map((participant) => (
                  <article key={participant.managerId} className="card col-6 settings-subcard">
                    <div className="section-title-row">
                      <div>
                        <h4>{participant.label}</h4>
                        <p className="muted-note">{participant.email || participant.managerId}</p>
                      </div>
                      <select
                        value={participant.status}
                        onChange={(event) => updateParticipantStatus(participant.managerId, event.target.value as LeagueParticipantStatus)}
                        aria-label={`Status voor ${participant.label}`}
                      >
                        <option value="PENDING">In afwachting</option>
                        <option value="ACCEPTED">Accepteren</option>
                        <option value="REJECTED">Weigeren</option>
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="card col-12 settings-subcard">
              <div className="settings-editor-head">
                <div>
                  <h3>Draft teamvolgorde</h3>
                  <p className="muted-note">Deze volgorde voedt direct de draft. Alleen geaccepteerde deelnemers kunnen hier staan.</p>
                </div>
              </div>
              {configuredDraftTeamOrder.length === 0 ? (
                <p className="muted-note">Accepteer eerst minimaal 2 deelnemers om de draftvolgorde te bepalen.</p>
              ) : (
                <div className="grid" style={{ marginTop: 8 }}>
                  {configuredDraftTeamOrder.map((managerId, index) => {
                    const participant = acceptedParticipants.find((candidate) => candidate.managerId === managerId);
                    if (!participant) return null;
                    return (
                      <article key={managerId} className="card col-6 settings-subcard">
                        <div className="section-title-row" style={{ alignItems: "center" }}>
                          <div>
                            <h4>{index + 1}. {participant.label}</h4>
                            <p className="muted-note">{participant.email || participant.managerId}</p>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" className="ghost-button" onClick={() => moveDraftTeamOrder(managerId, -1)} disabled={index === 0}>
                              ↑
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => moveDraftTeamOrder(managerId, 1)}
                              disabled={index === configuredDraftTeamOrder.length - 1}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
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
