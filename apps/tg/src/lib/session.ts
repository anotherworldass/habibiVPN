import { apiFetch } from "./api";
import { clearToken, getToken, setToken } from "./auth";
import { buildTgClientMeta } from "./client-meta";
import {
  getTelegramStartParam,
  getTelegramUser,
  waitForTelegramContext,
} from "./telegram";

const DEVICE_KEY = "habibi_tg_device_id";
const INVITE_KEY = "habibi_tg_invite";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const tg = getTelegramUser();
  if (tg?.id) {
    const id = `tg_${tg.id}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  }
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = randomId();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function saveInviteCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  localStorage.setItem(INVITE_KEY, normalized);
}

export function peekInviteCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(INVITE_KEY);
}

export function consumeInviteCode(): string | undefined {
  const code = peekInviteCode();
  if (code) localStorage.removeItem(INVITE_KEY);
  return code || undefined;
}

/** Persist startapp / ?ref= so first bootstrap can attach the inviter. */
export function capturePendingInvite() {
  if (typeof window === "undefined") return;
  const start = getTelegramStartParam()?.trim();
  if (start) saveInviteCode(start);
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) saveInviteCode(ref);
  } catch {
    /* ignore */
  }
}

let ensuring: Promise<string | null> | null = null;

async function bootstrapToken(): Promise<string | null> {
  const deviceId = getOrCreateDeviceId();
  const invite = peekInviteCode() || undefined;
  const res = await apiFetch<{ token: string }>("/api/v1/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      invite_code: invite,
      client_meta: buildTgClientMeta(deviceId),
    }),
  });
  if (res.token) {
    setToken(res.token);
    if (invite) localStorage.removeItem(INVITE_KEY);
    return res.token;
  }
  return null;
}

/** Ensure anonymous / existing JWT for Mini App (bootstrap). */
export async function ensureSession(opts?: {
  waitTelegram?: boolean;
}): Promise<string | null> {
  const existing = getToken();
  if (existing) return existing;
  if (ensuring) return ensuring;

  const waitTelegram = opts?.waitTelegram !== false;

  ensuring = (async () => {
    try {
      if (waitTelegram) await waitForTelegramContext();
      capturePendingInvite();
      return await bootstrapToken();
    } catch {
      return null;
    } finally {
      ensuring = null;
    }
  })();

  return ensuring;
}

/** Drop a stale JWT and mint a new anonymous session (joins in-flight bootstrap). */
export async function refreshSession(): Promise<string | null> {
  if (ensuring) return ensuring;
  clearToken();
  return ensureSession({ waitTelegram: false });
}
