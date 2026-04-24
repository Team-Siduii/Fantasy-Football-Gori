"use client";

import { useEffect, useState } from "react";

type LeagueAdminConfig = {
  scoringProfile: { id: string; type: "CLASSIC" | "CUSTOM"; label: string };
  waiver: { enabled: boolean; round: { tieBreaker: "PRIORITY" | "EARLIEST_BID" } };
  competition: { cupTiePolicy: "PENALTIES" | "HIGHER_SEED"; formats: string[] };
  roles: { ownerId: string; commissionerIds: string[]; managerIds: string[] };
};

type RuleHelpKey =
  | "scoringProfile"
  | "waiverTieBreaker"
  | "cupTiePolicy"
  | "commissioners"
  | "managers";

const RULE_HELP_TEXT: Record<RuleHelpKey, string> = {
  scoringProfile:
    "Classic gebruikt de standaard puntentelling. Custom is bedoeld voor een eigen puntenmodel (fase 2) en laat je alternatieve bonus/malus-regels beheren.",
  waiverTieBreaker:
    "Bepaalt wie wint als meerdere managers dezelfde speler claimen in waiver. Priority = vaste prioriteitsvolgorde. Earliest bid = vroegste geldige bod wint.",
  cupTiePolicy:
    "Bepaalt hoe een gelijke stand in de cup wordt beslist. Penalties = strafschoppen. Higher seed = hoger geplaatste team gaat door.",
  commissioners:
    "Manager-ID's met extra beheerdersrechten voor league-regels en instellingen. Komma-gescheiden lijst, bijvoorbeeld: owner-1,comm-1.",
  managers:
    "Alle manager-ID's die in deze league actief zijn. Deze lijst wordt gebruikt voor permissies en rolvalidatie.",
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

export function LeagueConfigEditor() {
  const [config, setConfig] = useState<LeagueAdminConfig | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);
      const res = await fetch("/api/admin/league-config", { cache: "no-store" });
      const data = (await res.json()) as { config?: LeagueAdminConfig; error?: string };
      if (!res.ok || !data.config) {
        setMessage(data.error ?? "Kon config niet laden");
      } else {
        setConfig(data.config);
      }
      setLoading(false);
    }

    void run();
  }, []);

  async function save() {
    if (!config) {
      return;
    }

    setMessage("Opslaan...");
    const payload = {
      scoringProfile: {
        ...config.scoringProfile,
        type: config.scoringProfile.type,
      },
      waiver: config.waiver,
      competition: config.competition,
      roles: {
        ...config.roles,
        commissionerIds: config.roles.commissionerIds,
        managerIds: config.roles.managerIds,
      },
    };

    const res = await fetch("/api/admin/league-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string; config?: LeagueAdminConfig };
    if (!res.ok || !data.ok || !data.config) {
      setMessage(data.error ?? "Opslaan mislukt");
      return;
    }

    setConfig(data.config);
    setMessage("Opgeslagen ✅");
  }

  if (loading) {
    return <p>Config laden...</p>;
  }

  if (!config) {
    return <p>{message || "Geen config"}</p>;
  }

  return (
    <section className="card col-12">
      <h2>League Config (Fase 2)</h2>
      <p className="muted">Beheer scoring-profiel, waiver tie-breaker, competition policy en rollenmodel.</p>

      <div className="grid" style={{ marginTop: 12 }}>
        <label className="field col-4">
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

        <label className="field col-4">
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

        <label className="field col-4">
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

        <label className="field col-6">
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

        <label className="field col-6">
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

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => void save()}>
          Opslaan
        </button>
        <span className="muted">{message}</span>
      </div>
    </section>
  );
}
