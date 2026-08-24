"use client";

import { useEffect } from "react";
import { apiFetch } from "../lib/api";
import {
  capturePendingInvite,
  consumeInviteCode,
  ensureSession,
  peekInviteCode,
} from "../lib/session";
import { syncTelegramSubscriber } from "../lib/telegram-bind";
import { bootTelegramWebApp, waitForTelegramContext } from "../lib/telegram";

/** Bind invite for existing sessions (bootstrap only covers first JWT). */
async function tryBindPendingInvite() {
  const code = peekInviteCode();
  if (!code) return;
  try {
    await apiFetch("/api/v1/promo/bind-invite", {
      method: "POST",
      body: JSON.stringify({ invite_code: code }),
    });
    consumeInviteCode();
  } catch {
    /* already bound / invalid — keep for next bootstrap if needed */
  }
}

export default function TelegramBoot() {
  useEffect(() => {
    bootTelegramWebApp();

    void (async () => {
      await waitForTelegramContext();
      bootTelegramWebApp();
      capturePendingInvite();
      await ensureSession();
      await tryBindPendingInvite();
      await syncTelegramSubscriber();
    })();
  }, []);

  return null;
}
