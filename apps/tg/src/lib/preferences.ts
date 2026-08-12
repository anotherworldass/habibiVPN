import { apiFetch } from "./api";

export type ConnectMode = "unset" | "official_app" | "subscription_client";

export type UserPreferences = {
  connect_mode: ConnectMode;
  connect_clients: string[];
  connect_pref_source: string | null;
  connect_pref_at: string | null;
};

export type ConnectPrefSource =
  | "onboarding"
  | "connect_page"
  | "settings"
  | "claim_prompt"
  | "inferred";

export async function fetchPreferences(): Promise<UserPreferences | null> {
  const res = await apiFetch<{ user: { preferences?: UserPreferences } }>(
    "/api/v1/me",
  );
  return res.user?.preferences ?? null;
}

export async function saveConnectPreference(input: {
  connect_mode: ConnectMode;
  connect_clients?: string[];
  source?: ConnectPrefSource;
}): Promise<UserPreferences> {
  const res = await apiFetch<{
    preferences: UserPreferences;
    skipped?: boolean;
  }>("/api/v1/me/preferences", {
    method: "PATCH",
    body: JSON.stringify({
      connect_mode: input.connect_mode,
      connect_clients: input.connect_clients,
      source: input.source ?? "settings",
    }),
  });
  return res.preferences;
}
