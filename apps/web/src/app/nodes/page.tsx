"use client";

import { useEffect, useMemo, useState } from "react";
import NodeMap from "../../components/NodeMap";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { friendlyError } from "../../lib/errors";

type RegionPool = {
  region: string;
  region_name: string;
  total: number;
  active: number;
  inactive: number;
  other: number;
  status: "active" | "partial" | "offline";
};

type NodesResponse = {
  summary: {
    total_nodes: number;
    active_nodes: number;
    region_count: number;
    updated_at: string;
  };
  regions: RegionPool[];
};

type ViewMode = "list" | "map";

function statusText(s: RegionPool["status"]) {
  if (s === "active") return "正常";
  if (s === "partial") return "部分可用";
  return "离线";
}

export default function NodesPage() {
  const [data, setData] = useState<NodesResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<NodesResponse>("/api/v1/nodes");
      setData(res);
    } catch (e) {
      setError(friendlyError(e, "加载节点失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    try {
      const saved = localStorage.getItem("habibi_nodes_view");
      if (saved === "list" || saved === "map") setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function switchView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem("habibi_nodes_view", next);
    } catch {
      /* ignore */
    }
  }

  const maxTotal = useMemo(
    () => Math.max(1, ...(data?.regions.map((r) => r.total) || [1])),
    [data],
  );

  const healthPct = useMemo(() => {
    if (!data?.summary.total_nodes) return 0;
    return Math.round((data.summary.active_nodes / data.summary.total_nodes) * 100);
  }, [data]);

  return (
    <Shell>
      <div className="page-head">
        <h1>节点</h1>
        <p>后台节点池概览：按地区查看状态与节点数量。</p>
      </div>

      {error && (
        <p className="alert-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {loading && (
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>加载节点池…</p>
      )}

      {!loading && data && (
        <>
          <div className="node-summary" style={{ marginTop: 14 }}>
            <div className="node-stat">
              <div className="node-stat-value">{data.summary.total_nodes}</div>
              <div className="node-stat-label">节点总数</div>
            </div>
            <div className="node-stat">
              <div className="node-stat-value">{data.summary.region_count}</div>
              <div className="node-stat-label">覆盖地区</div>
            </div>
            <div className="node-stat">
              <div className="node-stat-value">{healthPct}%</div>
              <div className="node-stat-label">在线占比</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <button
              type="button"
              onClick={load}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--teal-deep)",
                fontSize: 13,
                fontWeight: 600,
                padding: 0,
              }}
            >
              刷新
            </button>
          </div>

          <div className="panel" style={{ marginTop: 8, padding: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>节点健康度</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {data.summary.active_nodes}/{data.summary.total_nodes} 在线
              </span>
            </div>
            <div className="node-bar-track">
              <div className="node-bar-fill" style={{ width: `${healthPct}%` }} />
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--muted)" }}>
              更新于 {new Date(data.summary.updated_at).toLocaleString()}
            </p>
          </div>

          <section style={{ marginTop: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <h2 className="section-title" style={{ fontSize: "1.1rem", margin: 0 }}>
                地区节点池
              </h2>
              <div className="view-toggle" role="group" aria-label="切换可视化">
                <button
                  type="button"
                  data-active={view === "list"}
                  onClick={() => switchView("list")}
                >
                  列表
                </button>
                <button
                  type="button"
                  data-active={view === "map"}
                  onClick={() => switchView("map")}
                >
                  地图
                </button>
              </div>
            </div>

            {view === "map" ? (
              <div style={{ marginTop: 14 }}>
                <NodeMap regions={data.regions} maxTotal={maxTotal} />
              </div>
            ) : (
              <div className="node-region-list">
                {data.regions.map((r) => {
                  const pct = Math.round((r.total / maxTotal) * 100);
                  return (
                    <div key={r.region} className="node-region-card">
                      <div className="node-region-top">
                        <div className="node-region-flag">{r.region}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="node-region-name">{r.region_name}</div>
                          <div className="node-region-sub">
                            {r.active} 在线
                            {r.inactive > 0 ? ` · ${r.inactive} 离线` : ""}
                            {r.other > 0 ? ` · ${r.other} 其他` : ""}
                          </div>
                        </div>
                        <div className="node-region-right">
                          <div className="node-region-count">{r.total}</div>
                          <span className={`node-status node-status--${r.status}`}>
                            {statusText(r.status)}
                          </span>
                        </div>
                      </div>
                      <div className="node-bar-track" style={{ marginTop: 10 }}>
                        <div
                          className={`node-bar-fill node-bar-fill--${r.status}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
