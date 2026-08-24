import type { ReactNode } from "react";
import type { DownloadPlatformId } from "../lib/downloads";

const applePath =
  "M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z";

/** iOS keeps the filled Apple mark; macOS uses a laptop so the two stay distinct. */
export const platformIcons: Record<DownloadPlatformId, ReactNode> = {
  ios: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={applePath} />
    </svg>
  ),
  android: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.5 10.2 4.4v7.1H3V5.5Zm8.1-1.2L21 2.8v8.7h-9.9V4.3ZM3 13.5h7.2v7.1L3 19.5v-6Zm8.1 0H21v8.7l-9.9-1.4v-7.3Z" />
    </svg>
  ),
  macos: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect
        x="2.8"
        y="2.9"
        width="18.4"
        height="13.4"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M1.2 18.2h21.6l-1.2 1.9a1 1 0 0 1-.85.47H3.25a1 1 0 0 1-.85-.47Z" />
      <path transform="translate(9.03 4.06) scale(0.48)" d={applePath} />
    </svg>
  ),
};
