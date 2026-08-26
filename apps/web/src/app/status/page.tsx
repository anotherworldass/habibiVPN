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
  uptime_today: number | null;
  history: string;
  history_today: string;
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

type StatusCopy = ReturnType<typeof t>["status"];

type StatusResponse = {
  overall: "operational" | "degraded" | "outage";
  vantage_note: string;
  updated_at: string | null;
  history_days: number;
  history_today_hours: number;
  today_hour: number;
  summary: {
    total: number;
    up: number;
    down: number;
    region_count: number;
  };
  regions: RegionRow[];
  incidents: Incident[];
};

function overallLabel(s: StatusResponse["overall"], copy: StatusCopy) {
  if (s === "operational") return copy.operational;
  if (s === "degraded") return copy.degraded;
  return copy.outage;
}

function regionLabel(s: RegionRow["status"], copy: StatusCopy) {
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

function cellLabel(cell: string, copy: ReturnType<typeof t>["status"], future: boolean) {
  if (future) return copy.historyFuture;
  if (cell === "g") return copy.historyUp;
  if (cell === "y") return copy.historyPartial;
  if (cell === "r") return copy.historyDown;
  return copy.historyEmpty;
}

function hourRangeLabel(hourUtc: number) {
  const start = new Date();
  start.setUTCHours(hourUtc, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, opts)}–${end.toLocaleTimeString(undefined, opts)}`;
}

function pctText(n: number | null | undefined) {
  return n == null ? "—" : `${n}%`;
}

function UptimeBar({
  history,
  cells: cellCount,
  copy,
  mode,
  todayHour,
}: {
  history: string;
  cells: number;
  copy: ReturnType<typeof t>["status"];
  mode: "day" | "hour";
  todayHour?: number;
}) {
  const items = history.padEnd(cellCount, "-").slice(0, cellCount).split("");
  return (
    <div
      className={`status-uptime-bar${mode === "hour" ? " status-uptime-bar--today" : ""}`}
      aria-hidden="true"
    >
      {items.map((cell, i) => {
        const future = mode === "hour" && todayHour != null && i > todayHour;
        const tone =
          future ? "f" : cell === "g" || cell === "y" || cell === "r" ? cell : "n";
        const when =
          mode === "hour" ? hourRangeLabel(i) : historyDay(i, cellCount);
        return (
          <span
            key={i}
            className={`status-uptime-cell status-uptime-cell--${tone}`}
            title={`${when} · ${cellLabel(cell, copy, future)}`}
          />
        );
      })}
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
                        </span>
                      </div>
                      <span
                        className={`node-status node-status--${
                          n.last_ok ? "active" : n.last_ok === false ? "offline" : "partial"
                        }`}
                      >
                        {n.last_ok ? copy.online : n.last_ok === false ? copy.offline : "—"}
                      </span>
                      <div className="status-uptime-track">
                        <div className="status-uptime-row">
                          <span className="status-uptime-label">{copy.historyToday}</span>
                          <UptimeBar
                            history={n.history_today || ""}
                            cells={data.history_today_hours || 24}
                            copy={copy}
                            mode="hour"
                            todayHour={data.today_hour}
                          />
                          <span className="status-uptime-pct">{pctText(n.uptime_today)}</span>
                        </div>
                        <div className="status-uptime-row">
                          <span className="status-uptime-label">{copy.history90d}</span>
                          <UptimeBar
                            history={n.history || ""}
                            cells={data.history_days || 90}
                            copy={copy}
                            mode="day"
                          />
                          <span className="status-uptime-pct">{pctText(n.uptime_90d)}</span>
                        </div>
                      </div>
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
