"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import { useLocale } from "../../components/LocaleProvider";
import { apiFetch } from "../../lib/api";
import { t } from "../../lib/copy";
import { friendlyError } from "../../lib/errors";

type StatusNode = {
  name: string;
  protocol: string;
  last_ok: boolean | null;
  last_delay_ms: number | null;
  uptime_90d: number | null;
  history: string;
};

type RegionRow = {
  region: string;
  region_name: string;
  total: number;
  up: number;
  down: number;
  status: "active" | "partial" | "offline";
  uptime_90d: number | null;
  median_delay_ms: number | null;
  nodes: StatusNode[];
};

type Incident = {
  kind: string;
  region: string | null;
  region_name: string | null;
  summary: string;
  opened_at: string;
  closed_at: string | null;
};

type StatusResponse = {
  overall: "operational" | "degraded" | "outage";
  vantage_note: string;
  updated_at: string | null;
  history_days: number;
  summary: {
    total: number;
    up: number;
    down: number;
    region_count: number;
  };
  regions: RegionRow[];
  incidents: Incident[];
};

function overallLabel(
  s: StatusResponse["overall"],
  copy: ReturnType<typeof t>["status"],
) {
  if (s === "operational") return copy.operational;
  if (s === "degraded") return copy.degraded;
  return copy.outage;
}

function regionLabel(
  s: RegionRow["status"],
  copy: ReturnType<typeof t>["status"],
) {
  if (s === "active") return copy.statusActive;
  if (s === "partial") return copy.statusPartial;
  return copy.statusOffline;
}

function historyDay(index: number, days: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1 - index));
  return d.toISOString().slice(0, 10);
}

function historyTitle(
  cell: string,
  day: string,
  copy: ReturnType<typeof t>["status"],
) {
  const label =
    cell === "g"
      ? copy.historyUp
      : cell === "y"
        ? copy.historyPartial
        : cell === "r"
          ? copy.historyDown
          : copy.historyEmpty;
  return `${day} · ${label}`;
}

function UptimeBar({
  history,
  days,
  copy,
}: {
  history: string;
  days: number;
  copy: ReturnType<typeof t>["status"];
}) {
  const cells = history.padEnd(days, "-").slice(0, days).split("");
  return (
    <div className="status-uptime-bar" aria-hidden="true">
      {cells.map((cell, i) => (
        <span
          key={i}
          className={`status-uptime-cell status-uptime-cell--${cell === "g" || cell === "y" || cell === "r" ? cell : "n"}`}
          title={historyTitle(cell, historyDay(i, days), copy)}
        />
      ))}
    </div>
  );
}

export default function StatusPage() {
  const copy = t(useLocale()).status;
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<StatusResponse>("/api/v1/status");
      setData(res);
    } catch (e) {
      setError(friendlyError(e, copy.loadFailed));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const healthPct = useMemo(() => {
    if (!data?.summary.total) return 0;
    return Math.round((data.summary.up / data.summary.total) * 100);
  }, [data]);

  return (
    <Shell>
      <div className="page-head">
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          {copy.vantage}
        </p>
      </div>

      {error && (
        <p className="alert-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {loading && (
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
          {copy.loading}
        </p>
      )}

      {!loading && data && data.summary.total === 0 && (
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
          {copy.empty}
        </p>
      )}

      {!loading && data && data.summary.total > 0 && (
        <>
          <div className="node-summary" style={{ marginTop: 14 }}>
            <div className="node-stat">
              <div className="node-stat-value">{data.summary.total}</div>
              <div className="node-stat-label">{copy.total}</div>
            </div>
            <div className="node-stat">
              <div className="node-stat-value">{data.summary.region_count}</div>
              <div className="node-stat-label">{copy.regions}</div>
            </div>
            <div className="node-stat">
              <div className="node-stat-value">{healthPct}%</div>
              <div className="node-stat-label">{copy.health}</div>
            </div>
          </div>

          <div
            className="panel"
            style={{ marginTop: 14, padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}
          >
            <div>
              <span className={`node-status node-status--${data.overall === "operational" ? "active" : data.overall === "degraded" ? "partial" : "offline"}`}>
                {overallLabel(data.overall, copy)}
              </span>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                {copy.updated}{" "}
                {data.updated_at
                  ? new Date(data.updated_at).toLocaleString()
                  : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--teal-deep)",
                fontSize: 13,
                fontWeight: 600,
                padding: 0,
                alignSelf: "flex-start",
              }}
            >
              {copy.refresh}
            </button>
          </div>

          <p className="status-uptime-legend" style={{ marginTop: 16 }}>
            {copy.historyLegend}
          </p>
          <div className="node-region-list" style={{ marginTop: 10 }}>
            {data.regions.map((r) => (
              <div key={r.region} className="node-region-card">
                <div className="node-region-top">
                  <div className="node-region-flag">{r.region}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="node-region-name">{r.region_name}</div>
                    <div className="node-region-sub">
                      {r.up} {copy.online}
                      {r.down > 0 ? ` · ${r.down} ${copy.offline}` : ""}
                      {r.uptime_90d != null ? ` · ${copy.uptime} ${r.uptime_90d}%` : ""}
                      {r.median_delay_ms != null
                        ? ` · ${copy.delay} ${Math.round(r.median_delay_ms)} ms`
                        : ""}
                    </div>
                  </div>
                  <div className="node-region-right">
                    <div className="node-region-count">{r.total}</div>
                    <span className={`node-status node-status--${r.status}`}>
                      {regionLabel(r.status, copy)}
                    </span>
                  </div>
                </div>
                <ul className="status-node-list">
                  {(r.nodes || []).map((n) => (
                    <li key={`${r.region}-${n.protocol}-${n.name}`} className="status-node-row">
                      <div className="status-node-meta">
                        <span className="status-node-name">{n.name}</span>
                        <span className="status-node-sub">
                          {n.protocol}
                          {n.last_delay_ms != null ? ` · ${Math.round(n.last_delay_ms)} ms` : ""}
                          {n.uptime_90d != null ? ` · ${n.uptime_90d}%` : ""}
                        </span>
                      </div>
                      <span
                        className={`node-status node-status--${
                          n.last_ok ? "active" : n.last_ok === false ? "offline" : "partial"
                        }`}
                      >
                        {n.last_ok ? copy.online : n.last_ok === false ? copy.offline : "—"}
                      </span>
                      <UptimeBar
                        history={n.history || ""}
                        days={data.history_days || 90}
                        copy={copy}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <section style={{ marginTop: 28 }}>
            <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
              {copy.incidents}
            </h2>
            {data.incidents.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 14 }}>{copy.none}</p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {data.incidents.map((inc, i) => (
                  <div key={`${inc.opened_at}-${i}`} className="panel" style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>
                        {inc.region_name || inc.region || inc.kind}
                      </strong>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {inc.closed_at ? copy.resolved : copy.open}
                      </span>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 13 }}>{inc.summary}</p>
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--muted)" }}>
                      {new Date(inc.opened_at).toLocaleString()}
                      {inc.closed_at
                        ? ` → ${new Date(inc.closed_at).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
