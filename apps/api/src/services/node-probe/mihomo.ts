import { ProxyAgent, fetch as undiciFetch } from "undici";
import { truncateError, wrapProbeError } from "./fingerprint.js";

type DelayResult = { ok: true; delayMs: number } | { ok: false; error: string };

function delayTestError(status: number, message?: string): string {
  const msg = (message || "").trim();
  if (status === 504 || /timeout/i.test(msg)) return "urltest.timeout";
  if (
    status === 503 ||
    /an error occurred in the delay test/i.test(msg)
  ) {
    return "urltest.failed";
  }
  return truncateError(msg || `delay.${status}`);
}

export class MihomoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.secret) h.Authorization = `Bearer ${this.secret}`;
    return h;
  }

  async ping(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/version`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        throw new Error(`mihomo.unavailable.${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("mihomo.unavailable.")) {
        throw err;
      }
      throw wrapProbeError("node_probe.mihomo_unreachable", err);
    }
  }

  async putConfig(yaml: string): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/configs?force=true`,
        {
          method: "PUT",
          headers: { ...this.headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ payload: yaml }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          truncateError(`mihomo.put_config.${res.status} ${text}`, 200),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("mihomo.put_config.")) {
        throw err;
      }
      throw wrapProbeError("node_probe.mihomo_unreachable", err);
    }
  }

  async proxyDelay(
    name: string,
    url: string,
    timeoutMs: number,
  ): Promise<DelayResult> {
    const q = new URLSearchParams({
      url,
      timeout: String(timeoutMs),
    });
    const encoded = encodeURIComponent(name);
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/proxies/${encoded}/delay?${q}`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(timeoutMs + 2000),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        delay?: number;
        message?: string;
      } | null;
      const delay = Number(data?.delay);
      if (res.ok && Number.isFinite(delay) && delay > 0) {
        return { ok: true, delayMs: Math.round(delay) };
      }
      return {
        ok: false,
        error: delayTestError(res.status, data?.message),
      };
    } catch (err) {
      return { ok: false, error: truncateError(err) };
    }
  }

  async selectGlobal(name: string): Promise<void> {
    const groups = ["GLOBAL", "PROXY"];
    let last = "";
    for (const group of groups) {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/proxies/${encodeURIComponent(group)}`,
        {
          method: "PUT",
          headers: { ...this.headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.ok) return;
      last = `${group}.${res.status} ${await res.text().catch(() => "")}`;
    }
    throw new Error(truncateError(`mihomo.select ${last}`, 200));
  }
}

export async function downloadViaMixedPort(input: {
  mixedPort: number;
  url: string;
  maxBytes: number;
  timeoutMs: number;
}): Promise<{ bytes: number; ms: number; mbps: number }> {
  const dispatcher = new ProxyAgent(`http://127.0.0.1:${input.mixedPort}`);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), input.timeoutMs);
  const started = Date.now();
  let bytes = 0;
  try {
    const res = await undiciFetch(input.url, {
      method: "GET",
      dispatcher,
      signal: ac.signal,
      headers: { "user-agent": "habibi-node-probe/1" },
    });
    if (!res.ok || !res.body) {
      throw new Error(`speed.http.${res.status}`);
    }
    for await (const chunk of res.body) {
      bytes += chunk.length;
      if (bytes >= input.maxBytes) {
        ac.abort();
        break;
      }
    }
  } catch (err) {
    if (bytes < 1024) throw err;
  } finally {
    clearTimeout(timer);
  }
  const ms = Math.max(1, Date.now() - started);
  if (bytes < 1024) {
    throw new Error("speed.too_small");
  }
  const mbps = (bytes * 8) / (ms / 1000) / 1_000_000;
  return {
    bytes,
    ms,
    mbps: Math.round(mbps * 100) / 100,
  };
}
