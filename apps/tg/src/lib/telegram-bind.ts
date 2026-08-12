import { apiFetch } from "./api";
import { saveBotUsername } from "./site";
import { getTelegramInitData, requestWriteAccess } from "./telegram";

const BIND_ONCE_KEY = "habibi_tg_bound_v1";

/**
 * After session ready: bind initData to Habibi user, then ask for DM write access.
 * Safe to call repeatedly; skips if no initData (browser preview).
 */
export async function syncTelegramSubscriber(opts?: {
  /** Force requestWriteAccess even if already asked this session */
  forceWriteAccess?: boolean;
}): Promise<void> {
  const initData = getTelegramInitData();
  if (!initData) return;

  try {
    const res = await apiFetch<{ bot_username?: string | null }>(
      "/api/v1/telegram/bind",
      {
        method: "POST",
        body: JSON.stringify({ init_data: initData }),
      },
    );
    saveBotUsername(res.bot_username);
  } catch {
    /* bot not configured yet — ignore */
    return;
  }

  const asked =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(BIND_ONCE_KEY) === "1";
  if (asked && !opts?.forceWriteAccess) return;

  const granted = await requestWriteAccess();
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(BIND_ONCE_KEY, "1");
    }
  } catch {
    /* ignore */
  }

  try {
    await apiFetch("/api/v1/telegram/bind", {
      method: "POST",
      body: JSON.stringify({
        init_data: initData,
        write_access: granted,
      }),
    });
  } catch {
    /* ignore */
  }
}
