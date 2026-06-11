"use client";

import { useEffect, useState } from "react";

type LeagueMode = "eredivisie" | "wk";

type IntegrityIssue = {
  type: string;
  managerId: string;
  severity: "warning" | "error";
  message: string;
  key?: string;
  expected?: string;
  actual?: string;
};

type IntegrityReport = {
  scope: LeagueMode;
  generatedAt: string;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
  };
  issues: IntegrityIssue[];
};

type RepairResult = {
  updated: boolean;
  repairedManagerStateKeys: number;
  normalizedManagerStates: number;
  issuesBefore: number;
  issuesAfter: number;
};

export function IntegrityHealthPanel() {
  const [mode, setMode] = useState<LeagueMode>("eredivisie");
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  async function load(selectedMode: LeagueMode) {
    setLoading(true);
    const response = await fetch(`/api/admin/integrity?mode=${selectedMode}`, { cache: "no-store" });
    const data = (await response.json()) as { error?: string; report?: IntegrityReport };
    if (!response.ok || !data.report) {
      setReport(null);
      setMessage(data.error ?? "Kon integrity-report niet laden");
      setLoading(false);
      return;
    }

    setReport(data.report);
    setMessage("");
    setLoading(false);
  }

  useEffect(() => {
    void load(mode);
  }, [mode]);

  async function runRepair() {
    if (repairing) return;
    setRepairing(true);
    const response = await fetch(`/api/admin/integrity?mode=${mode}`, { method: "POST" });
    const data = (await response.json()) as { error?: string; report?: IntegrityReport; result?: RepairResult };
    if (!response.ok || !data.report || !data.result) {
      setMessage(data.error ?? "Repair mislukt");
      setRepairing(false);
      return;
    }

    setReport(data.report);
    setMessage(
      data.result.updated
        ? `Repair klaar: ${data.result.repairedManagerStateKeys} legacy manager-state key(s) genormaliseerd.`
        : "Repair draaide, maar er was niets extra te normaliseren.",
    );
    setRepairing(false);
  }

  const toneClass = report && report.summary.errors > 0 ? "error-text" : "success-text";

  return (
    <section className="card col-12 settings-subcard">
      <div className="settings-editor-head">
        <div>
          <h2>Manager-state health check</h2>
          <p className="muted">Check auth/participant drift en herstel legacy manager-state sleutels naar canonieke managerId records.</p>
        </div>
        <div className="mode-switch settings-mode-switch" aria-label="Integrity mode">
          <div className="mode-switch-buttons">
            <button type="button" className={`mode-switch-button ${mode === "eredivisie" ? "active" : ""}`} onClick={() => setMode("eredivisie")}>
              Eredivisie
            </button>
            <button type="button" className={`mode-switch-button ${mode === "wk" ? "active" : ""}`} onClick={() => setMode("wk")}>
              WK
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="muted">Integrity-report laden...</p> : null}
      {message ? <p className={report ? toneClass : "error-text"}>{message}</p> : null}

      {report ? (
        <>
          <div className="settings-debug-grid" style={{ marginTop: 12 }}>
            <div>
              <h3>Samenvatting</h3>
              <p><strong>Totaal:</strong> {report.summary.totalIssues}</p>
              <p><strong>Errors:</strong> {report.summary.errors}</p>
              <p><strong>Warnings:</strong> {report.summary.warnings}</p>
            </div>
            <div>
              <h3>Actie</h3>
              <p className="muted">Gebruik repair om legacy email-keyed manager-state records terug te schrijven onder canonieke `managerId` keys.</p>
              <button type="button" className="primary-button" onClick={() => void runRepair()} disabled={repairing || loading}>
                {repairing ? "Repair draait..." : "Run repair/backfill"}
              </button>
            </div>
          </div>

          <div className="grid" style={{ marginTop: 12 }}>
            {report.issues.length === 0 ? (
              <div className="card col-12 settings-subcard">
                <p className="success-text">Geen drift gevonden in deze mode ✅</p>
              </div>
            ) : (
              report.issues.map((issue, index) => (
                <article key={`${issue.type}-${issue.managerId}-${index}`} className="card col-6 settings-subcard">
                  <p className={issue.severity === "error" ? "error-text" : "muted-note"}>
                    <strong>{issue.managerId}</strong> — {issue.type}
                  </p>
                  <p>{issue.message}</p>
                  {issue.expected ? <p><strong>Expected:</strong> <code>{issue.expected}</code></p> : null}
                  {issue.actual ? <p><strong>Actual:</strong> <code>{issue.actual}</code></p> : null}
                  {issue.key ? <p><strong>Key:</strong> <code>{issue.key}</code></p> : null}
                </article>
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
