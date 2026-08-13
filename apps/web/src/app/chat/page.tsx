"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import SupportChatWidget from "../../components/SupportChatWidget";
import {
  setSupportEntry,
  setSupportQueryClientMeta,
  type SupportEntry,
} from "../../lib/support";

function parseEntry(raw: string | null): SupportEntry {
  const v = (raw || "").trim().toLowerCase();
  if (v === "app" || v === "1" || v === "true") return "app";
  return "h5";
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  // App WebView / desktop: /chat?from=app&token=…&os_name=…
  const entry = parseEntry(
    searchParams.get("from") || searchParams.get("entry"),
  );

  useEffect(() => {
    setSupportEntry(entry);
    setSupportQueryClientMeta({
      entry,
      os_name: searchParams.get("os_name"),
      os_version: searchParams.get("os_version"),
      app_version: searchParams.get("app_version"),
      platform: searchParams.get("platform"),
      shell: searchParams.get("shell"),
      locale: searchParams.get("locale"),
      device_id: searchParams.get("device_id"),
      client: searchParams.get("client"),
    });
  }, [entry, searchParams]);

  return (
    <SupportChatWidget mode="page" authToken={token} entry={entry} />
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="support-chat-page-loading" aria-busy="true">
          正在打开客服…
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
