"use client";

import type { ReactNode } from "react";
import { formatUsageBytes } from "../lib/plan-format";

function isUnlimited(limit?: number | null) {
  return limit == null || limit === 0;
}

export function TrafficUsage({
  usedBytes,
  limitBytes,
  footer,
}: {
  usedBytes?: number | null;
  limitBytes?: number | null;
  footer?: ReactNode;
}) {
  const unlimited = isUnlimited(limitBytes);
  const used =
    usedBytes != null && Number.isFinite(usedBytes)
      ? Math.max(0, usedBytes)
      : null;
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
          <div className="traffic-usage-label">流量使用</div>
          <div className="traffic-usage-value">
            {unlimited ? (
              <>
                已用 {formatUsageBytes(used)}
                <span className="traffic-usage-sep">·</span>
                <span className="traffic-usage-unlimited-tag">不限流量</span>
              </>
            ) : (
              <>
                {formatUsageBytes(used)}
                <span className="traffic-usage-sep">/</span>
                {formatUsageBytes(limit)}
                {pct != null ? (
                  <span className="traffic-usage-pct"> · {pct}%</span>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={`traffic-bar-track${unlimited ? " traffic-bar-track--unlimited" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={unlimited ? undefined : (pct ?? 0)}
        aria-label={unlimited ? "不限流量" : `流量已用 ${pct ?? 0}%`}
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

      {footer ? <div className="traffic-usage-footer">{footer}</div> : null}
    </div>
  );
}
