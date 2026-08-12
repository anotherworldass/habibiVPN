import type { ConnectMode, ConnectPrefSource, User } from "@prisma/client";

export const CONNECT_MODES = [
  "unset",
  "official_app",
  "subscription_client",
] as const;

export const CONNECT_PREF_SOURCES = [
  "onboarding",
  "connect_page",
  "settings",
  "claim_prompt",
  "inferred",
] as const;

/** Known subscription client tags (clients may send others; we normalize allowlist). */
export const CONNECT_CLIENT_TAGS = [
  "shadowrocket",
  "clash",
  "clash_meta",
  "hiddify",
  "singbox",
  "quantumult_x",
  "stash",
  "surge",
  "other",
] as const;

export type ConnectClientTag = (typeof CONNECT_CLIENT_TAGS)[number];

const CLIENT_TAG_SET = new Set<string>(CONNECT_CLIENT_TAGS);

export type UserPreferencesView = {
  connect_mode: ConnectMode;
  connect_clients: string[];
  connect_pref_source: ConnectPrefSource | null;
  connect_pref_at: string | null;
};

export function parseConnectClients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().toLowerCase().slice(0, 32);
    if (!tag || !CLIENT_TAG_SET.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function publicUserPreferences(user: {
  connectMode: ConnectMode;
  connectClients: unknown;
  connectPrefSource: ConnectPrefSource | null;
  connectPrefAt: Date | null;
}): UserPreferencesView {
  return {
    connect_mode: user.connectMode,
    connect_clients: parseConnectClients(user.connectClients),
    connect_pref_source: user.connectPrefSource,
    connect_pref_at: user.connectPrefAt?.toISOString() ?? null,
  };
}

/**
 * Inferred writes must not overwrite an explicit user choice.
 * Returns true if the update should be applied.
 */
export function shouldApplyPreferenceWrite(input: {
  currentMode: ConnectMode;
  currentSource: ConnectPrefSource | null;
  nextSource: ConnectPrefSource;
}): boolean {
  if (input.nextSource !== "inferred") return true;
  if (input.currentMode === "unset") return true;
  if (!input.currentSource || input.currentSource === "inferred") return true;
  return false;
}

export function normalizePreferencePatch(input: {
  connect_mode?: ConnectMode;
  connect_clients?: unknown;
  source?: ConnectPrefSource;
}): {
  connectMode?: ConnectMode;
  connectClients?: string[];
  connectPrefSource: ConnectPrefSource;
} {
  const connectPrefSource = input.source ?? "settings";
  const connectMode = input.connect_mode;
  let connectClients: string[] | undefined;

  if (input.connect_clients !== undefined) {
    connectClients = parseConnectClients(input.connect_clients);
  }

  if (connectMode === "official_app" || connectMode === "unset") {
    // Official / unset: clear client detail unless caller only patches clients later
    if (connectMode !== undefined) {
      connectClients = connectClients ?? [];
    }
  }

  return {
    connectMode,
    connectClients,
    connectPrefSource,
  };
}

export type PreferenceUser = Pick<
  User,
  "connectMode" | "connectClients" | "connectPrefSource" | "connectPrefAt"
>;
