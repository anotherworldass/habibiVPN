"use client";

import {
  ClipboardEvent,
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./LocaleProvider";
import { getToken, setToken } from "../lib/auth";
import { t } from "../lib/copy";
import { playDingDong, unlockDingDong } from "../lib/dingdong";
import { friendlyError } from "../lib/errors";
import { stripLocale } from "../lib/locale";
import { site } from "../lib/site";
import {
  bindSupportSession,
  setSupportEntry,
  SUPPORT_CHAT_OPEN_EVENT,
  supportFetchMessages,
  supportMediaSrc,
  supportRecallMessage,
  supportSendMessage,
  supportSession,
  supportUploadImage,
  type SupportEntry,
  type SupportMessage,
} from "../lib/support";

type SupportChatMode = "widget" | "page";

const USER_RECALL_MS = 30 * 60_000;

function isUserRecallable(m: SupportMessage): boolean {
  if (m.recalled_at || m.id.startsWith("temp-")) return false;
  if (m.direction !== "inbound") return false;
  if (typeof m.recallable === "boolean") return m.recallable;
  const age = Date.now() - new Date(m.created_at).getTime();
  return age >= 0 && age <= USER_RECALL_MS;
}

const POLL_OPEN_MS = 1000;
const POLL_CLOSED_MS = 3000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function imageFileFromClipboard(e: {
  clipboardData: DataTransfer | null;
}): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

function messageText(
  m: SupportMessage,
  chat: { recalled: string; placeholderMsg: string },
) {
  if (m.recalled_at) return chat.recalled;
  if (m.text?.trim()) return m.text;
  if (m.media_url || m.content_type === "image") return "";
  return chat.placeholderMsg;
}

/** Long dumps / diagnostic reports → monospace + copy. */
function looksLikeStructuredOrLongText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lines = t.split(/\r?\n/);
  if (lines.length >= 5) return true;
  if (t.length >= 400) return true;
  const kvLines = lines.filter((l) =>
    /^[^\s:=：]{1,48}\s*[:=：]\s*\S/.test(l.trim()),
  ).length;
  if (kvLines >= 3) return true;
  if (
    lines.length >= 3 &&
    /(诊断|diagnostic|device\s*info|app\s*version|=====|-----)/i.test(t)
  ) {
    return true;
  }
  return false;
}

const URL_RE =
  /https?:\/\/[^\s<>"'`）】\]}>]+|www\.[^\s<>"'`）】\]}>]+/gi;

function splitUrlTrailing(raw: string): { url: string; trailing: string } {
  const m = raw.match(/^(.*?)([),.，。；;!?！？:：]+)$/);
  if (m?.[1]) return { url: m[1], trailing: m[2] || "" };
  return { url: raw, trailing: "" };
}

function hrefFromUrlToken(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return raw;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="8"
        y="8"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function linkifyNodes(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(URL_RE.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const { url, trailing } = splitUrlTrailing(match[0]);
    const href = hrefFromUrlToken(url);
    nodes.push(
      <span key={`url-${key++}`} className="support-msg-url">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="support-msg-link"
        >
          {url}
        </a>
        <CopyLinkButton href={href} />
        {trailing || null}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

function CopyLinkButton({ href }: { href: string }) {
  const chat = t(useLocale()).chat;
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="support-msg-copy-link"
      title={copied ? chat.copied : chat.copyLink}
      aria-label={copied ? chat.copied : chat.copyLink}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyToClipboard(href).then((ok) => {
          if (!ok) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <CopyIcon />
    </button>
  );
}

function SupportMessageBody({ text }: { text: string }) {
  const chat = t(useLocale()).chat;
  const [copied, setCopied] = useState(false);
  const structured = looksLikeStructuredOrLongText(text);
  if (!structured) {
    return <div className="support-msg-text">{linkifyNodes(text)}</div>;
  }
  return (
    <div className="support-msg-code">
      <div className="support-msg-code-bar">
        <button
          type="button"
          className="support-msg-copy-all"
          onClick={() => {
            void copyToClipboard(text).then((ok) => {
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <CopyIcon size={13} />
          {copied ? chat.copied : chat.copyAll}
        </button>
      </div>
      <pre className="support-msg-pre">{linkifyNodes(text)}</pre>
    </div>
  );
}

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${mo}-${day} ${hh}:${mm}`;
}

function ChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v7.5a2.25 2.25 0 0 1-2.25 2.25H9.3L5.4 19.8a.75.75 0 0 1-1.2-.6v-3.45A2.25 2.25 0 0 1 4.5 14.25v-7.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.25 9.75h7.5M8.25 12.75h4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.75"
        y="5.25"
        width="16.5"
        height="13.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path
        d="M4.5 15.75 9 12l3.75 3 2.25-1.75 4.5 2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 12 19.5 4.5 14.25 19.5l-2.25-6.75L4.5 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SupportChatWidget({
  mode = "widget",
  /** App WebView can pass user JWT via /chat?token=… */
  authToken = null,
  /** App WebView should pass entry=app (also /chat?from=app). */
  entry = null,
}: {
  mode?: SupportChatMode;
  authToken?: string | null;
  entry?: SupportEntry | null;
}) {
  const chat = t(useLocale()).chat;
  const pathname = usePathname();
  const hideWidgetOnChat =
    mode === "widget" && Boolean(stripLocale(pathname || "").startsWith("/chat"));
  const isPage = mode === "page";
  const [open, setOpen] = useState(isPage);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(isPage);
  const lastOutboundSeenRef = useRef<Set<string>>(new Set());
  const outboundPrimedRef = useRef(false);
  const primedRef = useRef(false);
  const messagesTailRef = useRef<string | null>(null);
  const pageBootedRef = useRef(false);
  const tempSeqRef = useRef(0);

  const nextTempId = () => {
    tempSeqRef.current += 1;
    return `temp-${Date.now()}-${tempSeqRef.current}`;
  };

  openRef.current = open;

  useEffect(() => {
    const unlock = () => unlockDingDong();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Lock page scroll when chat is open on small screens / dedicated page
  useEffect(() => {
    if (hideWidgetOnChat) return;
    if (!open && !isPage) return;
    const prev = document.body.style.overflow;
    if (isPage) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      document.body.style.overflow = mq.matches ? "hidden" : prev;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.body.style.overflow = prev;
    };
  }, [open, isPage, hideWidgetOnChat]);

  const scrollBottom = useCallback((smooth?: boolean) => {
    const run = () => {
      const el = scrollRef.current;
      if (el) {
        if (smooth) {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        } else {
          el.scrollTop = el.scrollHeight;
        }
      } else {
        bottomRef.current?.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
        });
      }
    };
    // Double rAF: wait for bubble/image layout before scrolling.
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const loadMessages = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        if (!primedRef.current) {
          await supportSession();
          primedRef.current = true;
        }
        const after =
          opts?.silent && messagesTailRef.current
            ? messagesTailRef.current
            : undefined;
        const res = await supportFetchMessages(after);
        const incoming = res.items || [];
        const windowSize =
          typeof res.message_window_size === "number" &&
          res.message_window_size > 0
            ? res.message_window_size
            : 100;

        let merged: SupportMessage[] = [];
        setMessages((prev) => {
          const temps = prev.filter((m) => m.id.startsWith("temp-"));
          if (after) {
            if (incoming.length === 0) {
              merged = prev;
              return prev;
            }
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of incoming) {
              const prevMsg = byId.get(m.id);
              // Keep blob preview + local_key so image bubble does not remount/flicker.
              if (
                prevMsg?.media_url?.startsWith("blob:") &&
                !m.recalled_at
              ) {
                byId.set(m.id, {
                  ...m,
                  local_key: prevMsg.local_key,
                  media_url: prevMsg.media_url,
                });
              } else {
                byId.set(m.id, {
                  ...m,
                  local_key: prevMsg?.local_key || m.local_key,
                });
              }
            }
            merged = Array.from(byId.values()).sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
          } else {
            // Full reload returns latest window; keep in-flight optimistic sends.
            const byId = new Map(incoming.map((m) => [m.id, m]));
            for (const t of temps) {
              if (!byId.has(t.id)) byId.set(t.id, t);
            }
            merged = Array.from(byId.values()).sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
          }
          // Cap to latest N from 系统设置 (temps at the end are kept preferentially).
          if (merged.length > windowSize) {
            const tempIds = new Set(temps.map((t) => t.id));
            const keptTemps = merged.filter((m) => tempIds.has(m.id));
            const rest = merged.filter((m) => !tempIds.has(m.id));
            const room = Math.max(0, windowSize - keptTemps.length);
            merged = [...rest.slice(-room), ...keptTemps];
          }
          if (
            prev.length === merged.length &&
            prev.every(
              (m, i) =>
                m.id === merged[i]?.id &&
                m.recalled_at === merged[i]?.recalled_at &&
                m.text === merged[i]?.text,
            )
          ) {
            return prev;
          }
          return merged;
        });

        // Full reload: reset cursor from this window so reopen cannot stick to a
        // stale advanced after= that skips the latest messages.
        let cursor = after ? messagesTailRef.current : null;
        for (const m of merged) {
          const candidates = [m.created_at, m.recalled_at].filter(
            Boolean,
          ) as string[];
          for (const c of candidates) {
            if (!cursor || c > cursor) cursor = c;
          }
        }
        if (cursor) messagesTailRef.current = cursor;

        // Only agent→user messages should chime. Detect from this fetch's
        // `incoming` (not the full merged list): a send/poll echo of our own
        // inbound can otherwise make previously-seen outbound look "new" if
        // lastOutboundSeen was replaced with a smaller snapshot.
        // Incremental (`after`) polls only — a full reload can include the
        // whole window and must not ding for history.
        const seen = lastOutboundSeenRef.current;
        const rememberOutbound = (items: SupportMessage[]) => {
          for (const m of items) {
            if (m.direction === "outbound" && !m.recalled_at) {
              seen.add(m.id);
            }
          }
        };
        if (opts?.silent && outboundPrimedRef.current && after) {
          const hasNewAgentReply = incoming.some(
            (m) =>
              m.direction === "outbound" &&
              !m.recalled_at &&
              !seen.has(m.id),
          );
          if (hasNewAgentReply) {
            playDingDong();
            if (!openRef.current) setUnread((n) => n + 1);
          }
        }
        rememberOutbound(merged);
        rememberOutbound(incoming);
        outboundPrimedRef.current = true;

        setReady(true);
        setError("");

        if (openRef.current && incoming.length > 0) {
          const el = scrollRef.current;
          const nearBottom =
            !el || el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          if (nearBottom) scrollBottom(true);
        }
      } catch (e) {
        if (!opts?.silent) {
          setError(friendlyError(e, chat.loadFailed));
        }
      }
    },
    [scrollBottom, chat.loadFailed],
  );

  useEffect(() => {
    if (hideWidgetOnChat || isPage) return;
    void loadMessages();
  }, [loadMessages, hideWidgetOnChat, isPage]);

  // Dedicated /chat page: accept authToken / entry then open session.
  useEffect(() => {
    if (!isPage || pageBootedRef.current) return;
    pageBootedRef.current = true;
    const boot = async () => {
      unlockDingDong();
      setSupportEntry(entry === "app" ? "app" : "h5");
      const fromProp = authToken?.trim();
      if (fromProp) setToken(fromProp);
      const token = getToken();
      setLoggedIn(!!token);
      setOpen(true);
      if (token) await bindSupportSession();
      await loadMessages();
      scrollBottom(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    void boot();
  }, [isPage, authToken, entry, loadMessages, scrollBottom]);

  // Site floating widget defaults to H5 entry.
  useEffect(() => {
    if (isPage || hideWidgetOnChat) return;
    setSupportEntry("h5");
  }, [isPage, hideWidgetOnChat]);

  useEffect(() => {
    if (hideWidgetOnChat) return;
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "habibi_user_token" && ev.newValue) {
        void bindSupportSession().then(() => loadMessages({ silent: true }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadMessages, hideWidgetOnChat]);

  useEffect(() => {
    if (hideWidgetOnChat || !open) return;
    setUnread(0);
    scrollBottom(false);
    const t = window.setInterval(() => {
      void loadMessages({ silent: true });
    }, POLL_OPEN_MS);
    return () => window.clearInterval(t);
  }, [open, loadMessages, scrollBottom, hideWidgetOnChat]);

  useEffect(() => {
    if (hideWidgetOnChat || open || isPage) return;
    const t = window.setInterval(() => {
      void loadMessages({ silent: true });
    }, POLL_CLOSED_MS);
    return () => window.clearInterval(t);
  }, [open, isPage, loadMessages, hideWidgetOnChat]);

  async function onOpen() {
    unlockDingDong();
    setOpen(true);
    setUnread(0);
    const token = getToken();
    setLoggedIn(!!token);
    if (token) {
      await bindSupportSession();
    }
    await loadMessages();
    scrollBottom(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (isPage || hideWidgetOnChat) return;
    const onOpenRequest = () => {
      void onOpenRef.current();
    };
    window.addEventListener(SUPPORT_CHAT_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(SUPPORT_CHAT_OPEN_EVENT, onOpenRequest);
  }, [isPage, hideWidgetOnChat]);

  function onClose() {
    if (isPage) return;
    setOpen(false);
  }

  async function onRecall(msg: SupportMessage) {
    if (!isUserRecallable(msg)) return;
    const prev = msg;
    const nowIso = new Date().toISOString();
    setMessages((list) =>
      list.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              recalled_at: nowIso,
              recallable: false,
              text: null,
              media_url: null,
            }
          : m,
      ),
    );
    if (!messagesTailRef.current || nowIso > messagesTailRef.current) {
      messagesTailRef.current = nowIso;
    }
    try {
      const updated = await supportRecallMessage(msg.id);
      setMessages((list) =>
        list.map((m) => (m.id === msg.id ? { ...m, ...updated } : m)),
      );
    } catch (err) {
      setMessages((list) => list.map((m) => (m.id === msg.id ? prev : m)));
      setError(friendlyError(err, chat.recallFailed));
    }
  }

  async function sendPayload(input: {
    text?: string;
    media_url?: string;
    preview?: string | null;
  }) {
    const body = (input.text || "").trim();
    if (!body && !input.media_url) return;
    setError("");
    setText("");
    const tempId = nextTempId();
    const optimistic: SupportMessage = {
      id: tempId,
      local_key: tempId,
      direction: "inbound",
      source: "user",
      content_type: input.media_url ? "image" : "text",
      text: body || null,
      media_url: input.preview || input.media_url || null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    messagesTailRef.current = optimistic.created_at;
    scrollBottom(true);
    try {
      const res = await supportSendMessage({
        text: body || undefined,
        media_url: input.media_url,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId || m.id === res.message.id
            ? { ...res.message, local_key: tempId }
            : m,
        ),
      );
      if (res.message.created_at) {
        messagesTailRef.current = res.message.created_at;
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (body) setText((cur) => (cur.trim() ? cur : body));
      setError(friendlyError(err, chat.sendFailed));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    await sendPayload({ text: body });
  }

  function onPasteImage(e: ClipboardEvent<HTMLElement>) {
    const file = imageFileFromClipboard(e);
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    void onPickImage(file);
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(chat.imageOnly);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(chat.imageTooBig);
      return;
    }
    setError("");
    const localPreview = URL.createObjectURL(file);
    const tempId = nextTempId();
    const caption = text.trim();
    setText("");
    // Optimistic bubble; upload runs in background so user can keep chatting.
    const optimistic: SupportMessage = {
      id: tempId,
      local_key: tempId,
      direction: "inbound",
      source: "user",
      content_type: "image",
      text: caption || null,
      media_url: localPreview,
      uploading: true,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    messagesTailRef.current = optimistic.created_at;
    scrollBottom(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    try {
      const uploaded = await supportUploadImage(file);
      const res = await supportSendMessage({
        text: caption || undefined,
        media_url: uploaded.media_url,
      });
      // Keep local_key + blob preview so React does not remount the <img>.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId || m.id === res.message.id
            ? {
                ...res.message,
                local_key: tempId,
                media_url: localPreview,
                uploading: false,
              }
            : m,
        ),
      );
      if (res.message.created_at) {
        messagesTailRef.current = res.message.created_at;
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      URL.revokeObjectURL(localPreview);
      setError(friendlyError(err, chat.imageSendFailed));
    }
  }

  const canSend = !!text.trim();

  if (hideWidgetOnChat) return null;

  return (
    <div
      className={`support-widget${open ? " is-open" : ""}${isPage ? " is-page" : ""}`}
      aria-live="polite"
    >
      {open ? (
        <div
          className="support-widget-panel"
          role={isPage ? "main" : "dialog"}
          aria-modal={isPage ? undefined : true}
          aria-label={chat.aria}
        >
          <header className="support-widget-head">
            <div className="support-widget-agent">
              <div className="support-widget-avatar" aria-hidden>
                <ChatIcon size={20} />
                <span className="support-widget-online" />
              </div>
              <div className="support-widget-agent-meta">
                <strong>{chat.agent(site.brand)}</strong>
                <span>
                  {loggedIn ? chat.onlineLinked : chat.onlineHint}
                </span>
              </div>
            </div>
            {!isPage ? (
              <button
                type="button"
                className="support-widget-close"
                aria-label={chat.close}
                onClick={onClose}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </header>

          <div className="support-widget-body" ref={scrollRef}>
            {!ready && !error ? (
              <div className="support-widget-status">{chat.connecting}</div>
            ) : null}
            {error ? (
              <div className="support-widget-status is-error">{error}</div>
            ) : null}

            {ready && messages.length === 0 ? (
              <div className="support-widget-welcome">
                <div className="support-widget-welcome-card">
                  <div className="support-widget-avatar lg" aria-hidden>
                    <ChatIcon size={22} />
                  </div>
                  <h3>{chat.welcomeTitle}</h3>
                  <p>{chat.welcomeBody}</p>
                </div>
              </div>
            ) : null}

            {messages.map((m) => {
              const mine = m.direction === "inbound";
              const img = m.media_url?.startsWith("blob:")
                ? m.media_url
                : supportMediaSrc(m.media_url);
              const caption = messageText(m, chat);
              const rowKey = m.local_key || m.id;
              const isCode =
                !!caption &&
                !m.recalled_at &&
                looksLikeStructuredOrLongText(caption);
              return (
                <div
                  key={rowKey}
                  className={`support-widget-row ${mine ? "mine" : "theirs"}${isCode ? " is-code" : ""}`}
                >
                  {!mine ? (
                    <div className="support-widget-avatar sm" aria-hidden>
                      <ChatIcon size={14} />
                    </div>
                  ) : null}
                  <div className="support-widget-msg">
                    <div
                      className={`support-widget-bubble ${mine ? "mine" : "theirs"}${img ? " has-media" : ""}${m.recalled_at ? " is-recalled" : ""}${isCode ? " is-code" : ""}`}
                    >
                      {m.recalled_at ? (
                        chat.recalledMsg
                      ) : (
                        <>
                          {img ? (
                            <div
                              className={`support-widget-image-wrap${m.uploading ? " is-uploading" : ""}`}
                            >
                              {m.uploading ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={img}
                                  alt={chat.uploadingAlt}
                                  onLoad={() => scrollBottom(false)}
                                />
                              ) : (
                                <a
                                  href={img}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="support-widget-image-link"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={img}
                                    alt={chat.imageAlt}
                                    onLoad={() => {
                                      const el = scrollRef.current;
                                      if (!el) return;
                                      const nearBottom =
                                        el.scrollHeight -
                                          el.scrollTop -
                                          el.clientHeight <
                                        120;
                                      if (nearBottom) scrollBottom(false);
                                    }}
                                  />
                                </a>
                              )}
                              {m.uploading ? (
                                <div className="support-widget-upload-mask">
                                  {chat.uploading}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {caption ? <SupportMessageBody text={caption} /> : null}
                          {!img && !caption ? chat.placeholderMsg : null}
                        </>
                      )}
                    </div>
                    <div className="support-widget-meta">
                      <time dateTime={m.created_at}>
                        {m.uploading ? chat.uploadingDot : formatMessageTime(m.created_at)}
                      </time>
                      {mine && !m.uploading && isUserRecallable(m) ? (
                        <button
                          type="button"
                          className="support-widget-recall"
                          onClick={() => void onRecall(m)}
                        >
                          {chat.recall}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form className="support-widget-composer" onSubmit={onSubmit}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => void onPickImage(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              className="support-widget-icon-btn"
              aria-label={chat.sendImage}
              title={chat.sendImage}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon />
            </button>
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPasteImage}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) void sendPayload({ text: text.trim() });
                }
              }}
              placeholder={chat.placeholder}
              maxLength={4000}
              autoComplete="off"
            />
            <button
              type="submit"
              className="support-widget-send"
              disabled={!canSend}
              aria-label={chat.send}
            >
              <SendIcon />
            </button>
          </form>
        </div>
      ) : null}

      {!isPage && !open ? (
        <button
          type="button"
          className="support-widget-fab"
          onClick={() => {
            unlockDingDong();
            void onOpen();
          }}
          aria-label={chat.open}
        >
          <ChatIcon size={22} />
          <span>{chat.fab}</span>
          {unread > 0 ? (
            <span className="support-widget-badge">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}
      {!isPage && open ? (
        <button
          type="button"
          className="support-widget-fab is-desktop-only"
          onClick={onClose}
          aria-label={chat.closeFab}
        >
          {chat.collapse}
        </button>
      ) : null}
    </div>
  );
}
