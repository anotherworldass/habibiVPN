"use client";

import { useLocale } from "./LocaleProvider";
import { t } from "../lib/copy";

function formatBytes(n?: number | null) {
  if (n == null || !Number.isFinite(n) || n < 0) return "-";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function isUnlimited(limit?: number | null) {
  return limit == null || limit === 0;
}

export function TrafficUsage({
  usedBytes,
  limitBytes,
}: {
  usedBytes?: number | null;
  limitBytes?: number | null;
}) {
  const copy = t(useLocale()).traffic;
  const unlimited = isUnlimited(limitBytes);
  const used = usedBytes != null && Number.isFinite(usedBytes) ? Math.max(0, usedBytes) : null;
  const limit = !unlimited && limitBytes != null ? limitBytes : null;

  const pct =
    used != null && limit != null && limit > 0
      ? Math.min(100, Math.round((used / limit) * 1000) / 10)
      : null;

  const tone =
    pct == null ? "ok" : pct >= 90 ? "danger" : pct >= 70 ? "warn" : "ok";

  return (
    <div className="traffic-usage">
      <div className="traffic-usage-head">
        <div>
          <div className="traffic-usage-label">{copy.label}</div>
          <div className="traffic-usage-value">
            {unlimited ? (
              <>
                {copy.used(formatBytes(used))}
                <span className="traffic-usage-sep">·</span>
                <span className="traffic-usage-unlimited-tag">{copy.unlimited}</span>
              </>
            ) : (
              <>
                {formatBytes(used)}
                <span className="traffic-usage-sep">/</span>
                {formatBytes(limit)}
                {pct != null && (
                  <span className="traffic-usage-pct"> · {pct}%</span>
                )}
              </>
            )}
          </div>
        </div>
        {unlimited ? (
          <span className="traffic-usage-badge traffic-usage-badge--unlimited">{copy.unlimitedBadge}</span>
        ) : pct != null ? (
          <span className={`traffic-usage-badge traffic-usage-badge--${tone}`}>{pct}%</span>
        ) : null}
      </div>

      <div
        className={`traffic-bar-track${unlimited ? " traffic-bar-track--unlimited" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={unlimited ? undefined : pct ?? 0}
        aria-label={unlimited ? copy.unlimited : copy.usedPct(pct ?? 0)}
      >
        {unlimited ? (
          <div className="traffic-bar-fill traffic-bar-fill--unlimited" />
        ) : (
          <div
            className={`traffic-bar-fill traffic-bar-fill--${tone}`}
            style={{ width: `${pct ?? 0}%` }}
          />
        )}
      </div>
    </div>
  );
}
