"use client";

import { useMemo, useState } from "react";
import {
  REGION_COORDS,
  REGION_DISPLAY_OFFSET,
  projectEquirectangular,
  spreadOverlappingPoints,
} from "../lib/regions";

type RegionPool = {
  region: string;
  region_name: string;
  total: number;
  active: number;
  inactive: number;
  other: number;
  status: "active" | "partial" | "offline";
};

type Props = {
  regions: RegionPool[];
  maxTotal: number;
};

type MapPoint = RegionPool & {
  ox: number;
  oy: number;
  x: number;
  y: number;
  radius: number;
  spread: boolean;
};

function statusText(s: RegionPool["status"]) {
  if (s === "active") return "正常";
  if (s === "partial") return "部分可用";
  return "离线";
}

/** Equirectangular 2:1 — matches /world-map.svg viewBox */
const W = 720;
const H = 360;

export default function NodeMap({ regions, maxTotal }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const points = useMemo(() => {
    const raw = regions
      .map((r) => {
        const coord = REGION_COORDS[r.region];
        if (!coord) return null;
        const { x: ox, y: oy } = projectEquirectangular(coord.lat, coord.lng, W, H);
        const off = REGION_DISPLAY_OFFSET[r.region] || { dx: 0, dy: 0 };
        // Europe markers slightly smaller so fan-out reads cleaner
        const europe = Math.abs(coord.lng) < 40 && coord.lat > 35 && coord.lat < 72;
        const base = europe ? 6 : 8;
        const span = europe ? 12 : 16;
        const radius = base + (r.total / Math.max(1, maxTotal)) * span;
        return {
          ...r,
          ox,
          oy,
          x: ox + off.dx,
          y: oy + off.dy,
          radius,
          spread: false,
        } satisfies MapPoint;
      })
      .filter(Boolean) as MapPoint[];

    const spread = spreadOverlappingPoints(raw, 10, 50);
    return spread.map((p) => ({
      ...p,
      x: Math.min(W - 16, Math.max(16, p.x)),
      y: Math.min(H - 16, Math.max(16, p.y)),
      spread: Math.hypot(p.x - p.ox, p.y - p.oy) > 8,
    }));
  }, [regions, maxTotal]);

  const active = points.find((p) => p.region === selected) || null;

  return (
    <div className="node-map-wrap">
      <div className="node-map-canvas" role="img" aria-label="节点地区分布地图">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="node-map-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="mapGlow" cx="50%" cy="42%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.25" />
            </filter>
          </defs>

          <rect width={W} height={H} fill="#b9d4df" />

          <image
            href="/world-map.svg"
            width={W}
            height={H}
            preserveAspectRatio="none"
          />

          <rect width={W} height={H} fill="url(#mapGlow)" />

          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={`h-${p}`}
              x1={0}
              y1={H * p}
              x2={W}
              y2={H * p}
              stroke="rgba(10,22,40,0.06)"
              strokeWidth="1"
            />
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((p) => (
            <line
              key={`v-${p}`}
              x1={W * p}
              y1={0}
              x2={W * p}
              y2={H}
              stroke="rgba(10,22,40,0.06)"
              strokeWidth="1"
            />
          ))}

          {/* leader lines from geo origin → spread marker */}
          {points
            .filter((p) => p.spread)
            .map((p) => (
              <g key={`link-${p.region}`}>
                <line
                  x1={p.ox}
                  y1={p.oy}
                  x2={p.x}
                  y2={p.y}
                  stroke="rgba(10,22,40,0.28)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle cx={p.ox} cy={p.oy} r="2.5" fill="rgba(10,22,40,0.35)" />
              </g>
            ))}

          {points.map((p) => {
            const isSel = selected === p.region;
            const fill =
              p.status === "active"
                ? "#0b7a75"
                : p.status === "partial"
                  ? "#c56a1a"
                  : "#8a96a3";
            return (
              <g
                key={p.region}
                className="node-map-point"
                style={{ cursor: "pointer" }}
                filter="url(#markerShadow)"
                onClick={() => setSelected(isSel ? null : p.region)}
              >
                <circle cx={p.x} cy={p.y} r={p.radius + 5} fill={fill} opacity={0.14}>
                  <animate
                    attributeName="r"
                    values={`${p.radius + 3};${p.radius + 9};${p.radius + 3}`}
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.2;0.04;0.2"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSel ? p.radius + 2 : p.radius}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth={isSel ? 3 : 2}
                />
                <text
                  x={p.x}
                  y={p.y - p.radius - 5}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill="#0a1628"
                >
                  {p.region}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="node-map-legend">
        <span>
          <i className="node-dot node-dot--active" /> 正常
        </span>
        <span>
          <i className="node-dot node-dot--partial" /> 部分可用
        </span>
        <span>
          <i className="node-dot node-dot--offline" /> 离线
        </span>
        <span className="node-map-hint">虚线连回真实位置 · 点击查看</span>
      </div>

      {active ? (
        <div className="node-region-card" style={{ marginTop: 12 }}>
          <div className="node-region-top">
            <div className="node-region-flag">{active.region}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="node-region-name">{active.region_name}</div>
              <div className="node-region-sub">
                {active.active} 在线
                {active.inactive > 0 ? ` · ${active.inactive} 离线` : ""}
              </div>
            </div>
            <div className="node-region-right">
              <div className="node-region-count">{active.total}</div>
              <span className={`node-status node-status--${active.status}`}>
                {statusText(active.status)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
          点选地图上的地区查看详情
        </p>
      )}
    </div>
  );
}
