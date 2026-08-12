import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { message } from "../lib/antd-message";
import {
  CloseOutlined,
  CopyOutlined,
  DownOutlined,
  ExportOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  UpOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import { playDingDong, unlockDingDong } from "../lib/dingdong";
import { getProjectId } from "../lib/project";

type Channel = "web" | "telegram";

type QuickReply = {
  id: string;
  title: string;
  text: string;
  media_url?: string | null;
  lang: string;
  sort: number;
  enabled: boolean;
};

type GuestProfile = {
  id: string;
  user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  timezone: string | null;
  locale: string | null;
  os_name: string | null;
  os_version: string | null;
  browser_name: string | null;
  /** h5 = website widget; app = in-app WebView */
  client_source?: string | null;
  last_seen_at: string;
  created_at: string;
};

type UserBrief = {
  id: string;
  uid: number;
  email: string | null;
  status: string;
};

type UserProfile = UserBrief & {
  invite_code?: string;
  created_at?: string;
  admin_remark?: string | null;
  promo_group?: { id: string; name: string; code: string } | null;
  wallet?: { available_cents: number; pending_cents: number };
  subscription_count?: number;
  active_subscription_count?: number;
  subscriptions?: Array<{
    id: string;
    plan_name: string | null;
    plan_code: string | null;
    status: string;
    expires_at: string | null;
    expired: boolean;
    active?: boolean;
  }>;
};

type TelegramBrief = {
  subscriber_id: string;
  telegram_user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_premium: boolean | null;
  is_bot?: boolean;
  allows_write_to_pm?: boolean | null;
  photo_url?: string | null;
  can_dm: boolean;
  blocked: boolean;
  started_at?: string;
  last_seen_at?: string;
};

type Conversation = {
  id: string;
  channel: Channel;
  status: string;
  display_name: string | null;
  language_code: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  user: UserBrief | null;
  guest: GuestProfile | null;
  telegram: TelegramBrief | null;
};

type ChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  source: string;
  content_type: string;
  text: string | null;
  media_url?: string | null;
  admin_username: string | null;
  external_message_id?: string | null;
  recalled_at?: string | null;
  recallable?: boolean;
  created_at: string;
};

function mediaSrc(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith("/api/")) return `${u.pathname}${u.search}`;
  } catch {
    /* ignore */
  }
  return url;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function imageFileFromClipboard(e: {
  clipboardData?: DataTransfer | null;
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

type ThreadConversation = {
  id: string;
  channel: Channel;
  status: string;
  display_name: string | null;
  language_code: string | null;
  guest: GuestProfile | null;
  user: UserProfile | null;
  telegram: TelegramBrief | null;
};

const QUICK_REPLY_LANG_OPTIONS = [
  { value: "zh", label: "中文 (zh)" },
  { value: "en", label: "English (en)" },
  { value: "ru", label: "Русский (ru)" },
  { value: "ar", label: "العربية (ar)" },
  { value: "fa", label: "فارسی (fa)" },
  { value: "tr", label: "Türkçe (tr)" },
  { value: "id", label: "Bahasa (id)" },
  { value: "vi", label: "Tiếng Việt (vi)" },
  { value: "th", label: "ไทย (th)" },
  { value: "ja", label: "日本語 (ja)" },
  { value: "ko", label: "한국어 (ko)" },
  { value: "es", label: "Español (es)" },
  { value: "pt", label: "Português (pt)" },
  { value: "fr", label: "Français (fr)" },
  { value: "de", label: "Deutsch (de)" },
] as const;

const MATCH_MIN_CHARS = 2;
const POLL_MS = 1500;

function normalizeQuickReplyLang(code: string | null | undefined): string {
  if (!code?.trim()) return "zh";
  const c = code.trim().toLowerCase().replace(/_/g, "-");
  if (c.startsWith("zh")) return "zh";
  const base = c.split("-")[0] || "zh";
  return base.length >= 2 ? base : "zh";
}

function pickQuickRepliesForLang(
  replies: QuickReply[],
  userLang: string | null | undefined,
): QuickReply[] {
  const enabled = replies.filter((r) => r.enabled);
  const lang = normalizeQuickReplyLang(userLang);
  const matched = enabled.filter(
    (r) => normalizeQuickReplyLang(r.lang) === lang,
  );
  if (matched.length > 0) return matched;
  if (lang !== "zh") {
    return enabled.filter((r) => normalizeQuickReplyLang(r.lang) === "zh");
  }
  return matched;
}

function langOptionLabel(lang: string): string {
  return QUICK_REPLY_LANG_OPTIONS.find((o) => o.value === lang)?.label || lang;
}

function channelTag(channel: Channel, clientSource?: string | null) {
  if (channel === "telegram") return <Tag color="cyan">Telegram</Tag>;
  if (clientSource === "app") return <Tag color="purple">App</Tag>;
  return <Tag color="blue">Web</Tag>;
}

function entryTag(guest: GuestProfile | null | undefined) {
  if (!guest) return null;
  if (guest.client_source === "app") {
    return <Tag color="purple">App</Tag>;
  }
  return <Tag>H5</Tag>;
}

function convTitle(c: Conversation | ThreadConversation) {
  if (c.display_name?.trim()) return c.display_name;
  if (c.user?.email) return c.user.email;
  if (c.user?.uid) return `UID ${c.user.uid}`;
  if (c.telegram?.username) return `@${c.telegram.username}`;
  if (c.telegram) {
    const name = [c.telegram.first_name, c.telegram.last_name]
      .filter(Boolean)
      .join(" ");
    if (name) return name;
    return c.telegram.telegram_user_id;
  }
  if (c.guest?.ip) return `访客 ${c.guest.ip}`;
  return c.id.slice(0, 8);
}

function messageCaption(m: ChatMessage) {
  if (m.recalled_at) return "已撤回";
  if (m.text?.trim()) return m.text;
  if (m.media_url || m.content_type === "image") return "";
  if (m.content_type === "photo") return "[图片]";
  return "[消息]";
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success("已复制");
  } catch {
    message.error("复制失败");
  }
}

function linkifyNodes(text: string, inverted: boolean): ReactNode[] {
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
    const linkColor = inverted ? "#e6f4ff" : "#1677ff";
    nodes.push(
      <span key={`url-${key++}`} style={{ wordBreak: "break-all" }}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: linkColor,
            textDecoration: "underline",
          }}
        >
          {url}
        </a>
        <Tooltip title="复制链接">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void copyText(href);
            }}
            style={{
              color: inverted ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.45)",
              width: 18,
              height: 18,
              minWidth: 18,
              padding: 0,
              fontSize: 11,
              marginLeft: 2,
              verticalAlign: "text-bottom",
            }}
          />
        </Tooltip>
        {trailing || null}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

function SupportMessageText({
  text,
  inverted,
}: {
  text: string;
  inverted: boolean;
}) {
  const structured = looksLikeStructuredOrLongText(text);
  if (!structured) {
    return <div>{linkifyNodes(text, inverted)}</div>;
  }
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 4,
        }}
      >
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={() => void copyText(text)}
          style={{
            color: inverted ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)",
            height: 22,
            padding: "0 4px",
            fontSize: 12,
          }}
        >
          复制全文
        </Button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "8px 10px",
          borderRadius: 8,
          background: inverted ? "rgba(0,0,0,0.22)" : "#f5f5f5",
          color: inverted ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.88)",
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 360,
          overflow: "auto",
          border: inverted
            ? "1px solid rgba(255,255,255,0.15)"
            : "1px solid #eee",
        }}
      >
        {linkifyNodes(text, inverted)}
      </pre>
    </div>
  );
}

function money(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function fmtTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString();
}

function statusColor(status: string) {
  if (status === "active") return "success";
  if (status === "banned" || status === "disabled") return "error";
  return "default";
}

/** language_code → short label for ops. */
function languageLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const c = code.trim().toLowerCase();
  const map: Record<string, string> = {
    zh: "中文",
    "zh-hans": "简体中文",
    "zh-hant": "繁体中文",
    "zh-cn": "简体中文",
    "zh-tw": "繁体中文",
    "zh-hk": "繁体中文",
    en: "English",
    "en-us": "English",
    ru: "Русский",
    ar: "العربية",
    fa: "فارسی",
    tr: "Türkçe",
    id: "Bahasa",
    vi: "Tiếng Việt",
    th: "ไทย",
    ja: "日本語",
    ko: "한국어",
    es: "Español",
    pt: "Português",
    fr: "Français",
    de: "Deutsch",
    hi: "हिन्दी",
    uk: "Українська",
  };
  if (map[c]) return `${map[c]} (${code})`;
  const base = c.split("-")[0] || c;
  if (map[base]) return `${map[base]} (${code})`;
  return code;
}

function openUserDetail(userId: string) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  window.open(
    `${base}/users/detail?user=${encodeURIComponent(userId)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function unrepliedInboundMessages(messages: ChatMessage[]): ChatMessage[] {
  let lastOutboundIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === "outbound" && !messages[i].recalled_at) {
      lastOutboundIdx = i;
      break;
    }
  }
  return messages
    .slice(lastOutboundIdx + 1)
    .filter(
      (m) =>
        m.direction === "inbound" && m.source === "user" && !!m.text?.trim(),
    );
}

function matchQuickReplies(
  customerText: string,
  replies: QuickReply[],
): Array<QuickReply & { match_hint: string; score: number }> {
  const msg = customerText.trim().toLowerCase();
  if (msg.length < MATCH_MIN_CHARS) return [];
  const scored: Array<{ r: QuickReply; score: number; hint: string }> = [];
  for (const r of replies) {
    if (!r.enabled) continue;
    const title = r.title.trim().toLowerCase();
    if (title.length < MATCH_MIN_CHARS) continue;
    if (msg.includes(title)) {
      scored.push({ r, score: 1000 + title.length, hint: title });
      continue;
    }
    if (title.includes(msg)) {
      scored.push({ r, score: 500 + msg.length, hint: msg });
      continue;
    }
    let bestHint = "";
    let bestLen = 0;
    for (
      let len = Math.min(title.length, msg.length);
      len >= MATCH_MIN_CHARS;
      len--
    ) {
      for (let i = 0; i <= title.length - len; i++) {
        const gram = title.slice(i, i + len);
        if (msg.includes(gram) && gram.length > bestLen) {
          bestLen = gram.length;
          bestHint = gram;
        }
      }
      if (bestLen > 0) break;
    }
    if (bestLen >= MATCH_MIN_CHARS) {
      scored.push({ r, score: bestLen * 10, hint: bestHint });
    }
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.r.sort - b.r.sort ||
      a.r.title.localeCompare(b.r.title),
  );
  return scored.map((s) => ({ ...s.r, match_hint: s.hint, score: s.score }));
}

function matchQuickRepliesFromMessages(
  msgs: ChatMessage[],
  replies: QuickReply[],
): Array<QuickReply & { match_hint: string }> {
  const best = new Map<
    string,
    QuickReply & { match_hint: string; score: number }
  >();
  for (const m of msgs) {
    if (!m.text?.trim()) continue;
    for (const hit of matchQuickReplies(m.text, replies)) {
      const prev = best.get(hit.id);
      if (!prev || hit.score > prev.score) best.set(hit.id, hit);
    }
  }
  return Array.from(best.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.sort - b.sort ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 8)
    .map(({ score: _s, ...rest }) => rest);
}

function newQuickId() {
  return `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function SupportInboxPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [channelFilter, setChannelFilter] = useState<
    Channel | "app" | "all"
  >("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ThreadConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    file: File;
  } | null>(null);
  /** Already-uploaded media (e.g. from quick reply); skip re-upload on send. */
  const [pendingMediaUrl, setPendingMediaUrl] = useState<string | null>(null);
  const [pendingSends, setPendingSends] = useState(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageDraft, setManageDraft] = useState<QuickReply[]>([]);
  const [manageSaving, setManageSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [editForm] = Form.useForm<{
    title: string;
    text: string;
    media_url: string | null;
    lang: string;
    sort: number;
    enabled: boolean;
  }>();
  const [dismissedSuggest, setDismissedSuggest] = useState<Set<string>>(
    () => new Set(),
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const messagesLenRef = useRef(0);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const inboxPrimedRef = useRef(false);
  const unreadTotalRef = useRef(0);

  activeIdRef.current = activeId;
  messagesLenRef.current = messages.length;

  useEffect(() => {
    const unlock = () => unlockDingDong();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const loadQuickReplies = useCallback(async () => {
    if (!getProjectId()) return;
    try {
      const res = await adminFetch<{ items: QuickReply[] }>(
        "/admin/v1/support/quick-replies",
      );
      setQuickReplies(
        (res.items || []).map((r) => ({
          ...r,
          lang: normalizeQuickReplyLang(r.lang),
        })),
      );
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadInbox = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!getProjectId()) {
        if (!opts?.silent) {
          message.warning("请先选择项目");
          setLoading(false);
        }
        return;
      }
      if (!opts?.silent) setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "80", offset: "0" });
        if (unreadOnly) params.set("unread", "1");
        if (channelFilter !== "all") params.set("channel", channelFilter);
        if (q.trim()) params.set("q", q.trim());
        const res = await adminFetch<{
          items: Conversation[];
          unread_total: number;
        }>(`/admin/v1/support/conversations?${params}`);
        const nextUnread = res.unread_total || 0;
        if (
          opts?.silent &&
          inboxPrimedRef.current &&
          nextUnread > unreadTotalRef.current
        ) {
          playDingDong();
        }
        unreadTotalRef.current = nextUnread;
        inboxPrimedRef.current = true;
        setItems(res.items || []);
        setUnreadTotal(nextUnread);
      } catch (e) {
        if (!opts?.silent) {
          message.error(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [q, unreadOnly, channelFilter],
  );

  const loadThread = useCallback(
    async (conversationId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setThreadLoading(true);
      try {
        const res = await adminFetch<{
          conversation: ThreadConversation;
          items: ChatMessage[];
        }>(`/admin/v1/support/conversations/${conversationId}?limit=200`);
        if (activeIdRef.current !== conversationId) return;

        const next = res.items || [];
        const prevLen = messagesLenRef.current;
        const prevIds = messageIdsRef.current;
        if (opts?.silent && prevIds.size > 0) {
          const hasNewInbound = next.some(
            (m) =>
              m.direction === "inbound" &&
              m.source === "user" &&
              !prevIds.has(m.id),
          );
          if (hasNewInbound) playDingDong();
        }
        messageIdsRef.current = new Set(next.map((m) => m.id));
        setConversation(res.conversation);
        setMessages((prev) => {
          // Keep in-flight optimistic sends the poll has not echoed yet.
          const temps = prev.filter(
            (m) =>
              m.id.startsWith("temp-") && !next.some((n) => n.id === m.id),
          );
          const merged = temps.length ? [...next, ...temps] : next;
          const same =
            prev.length === merged.length &&
            prev.every((m, i) => m.id === merged[i]?.id);
          if (same) return prev;
          for (const t of temps) messageIdsRef.current.add(t.id);
          return merged;
        });
        setItems((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c,
          ),
        );

        const el = threadScrollRef.current;
        const nearBottom =
          !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        const hasNew =
          next.length !== prevLen || next.some((m) => !prevIds.has(m.id));
        // Initial open always jump to latest; silent poll only if near bottom.
        if (!opts?.silent || (nearBottom && hasNew)) {
          requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({
              behavior: opts?.silent ? "smooth" : "auto",
            });
          });
        }
      } catch (e) {
        if (!opts?.silent) {
          message.error(e instanceof Error ? e.message : "加载会话失败");
        }
      } finally {
        if (!opts?.silent) setThreadLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    void loadQuickReplies();
  }, [loadQuickReplies]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadInbox({ silent: true });
      if (activeIdRef.current) {
        void loadThread(activeIdRef.current, { silent: true });
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadInbox, loadThread]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setConversation(null);
    setMessages([]);
    messageIdsRef.current = new Set();
    setThreadLoading(true);
    setReply("");
    setPendingImage(null);
    setPendingMediaUrl(null);
    setProfileExpanded(false);
    void loadThread(id);
  };

  const applyQuickReply = (r: QuickReply) => {
    setReply(r.text || "");
    setPendingImage(null);
    setPendingMediaUrl(r.media_url?.trim() || null);
  };

  const customerLang = normalizeQuickReplyLang(
    conversation?.language_code ||
      conversation?.guest?.locale ||
      conversation?.telegram?.language_code,
  );

  const enabledQuickReplies = useMemo(() => {
    return pickQuickRepliesForLang(
      quickReplies,
      conversation?.language_code ||
        conversation?.guest?.locale ||
        conversation?.telegram?.language_code,
    )
      .slice()
      .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  }, [quickReplies, conversation]);

  const unrepliedInbounds = useMemo(
    () => unrepliedInboundMessages(messages),
    [messages],
  );

  const unrepliedSuggestKey = useMemo(() => {
    if (!activeId || unrepliedInbounds.length === 0) return null;
    return `${activeId}:${unrepliedInbounds.map((m) => m.id).join(",")}`;
  }, [activeId, unrepliedInbounds]);

  const suggestedReplies = useMemo(() => {
    if (!unrepliedSuggestKey || unrepliedInbounds.length === 0) return [];
    if (dismissedSuggest.has(unrepliedSuggestKey)) return [];
    const scoped = pickQuickRepliesForLang(
      quickReplies,
      conversation?.language_code ||
        conversation?.guest?.locale ||
        conversation?.telegram?.language_code,
    );
    return matchQuickRepliesFromMessages(unrepliedInbounds, scoped);
  }, [
    unrepliedSuggestKey,
    unrepliedInbounds,
    quickReplies,
    dismissedSuggest,
    conversation,
  ]);

  const openManage = () => {
    setManageDraft(
      quickReplies
        .map((r) => ({ ...r, lang: normalizeQuickReplyLang(r.lang) }))
        .sort(
          (a, b) =>
            a.lang.localeCompare(b.lang) ||
            a.sort - b.sort ||
            a.title.localeCompare(b.title),
        ),
    );
    setManageOpen(true);
  };

  const openCreateQuick = () => {
    setEditing(null);
    editForm.setFieldsValue({
      title: "",
      text: "",
      media_url: null,
      lang: "zh",
      sort: 100,
      enabled: true,
    });
    setEditOpen(true);
  };

  const openEditQuick = (r: QuickReply) => {
    setEditing(r);
    editForm.setFieldsValue({
      title: r.title,
      text: r.text,
      media_url: r.media_url || null,
      lang: normalizeQuickReplyLang(r.lang),
      sort: r.sort,
      enabled: r.enabled,
    });
    setEditOpen(true);
  };

  const uploadQuickReplyImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      message.error("仅支持图片");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      message.error("图片不能超过 4MB");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await adminFetch<{ media_url: string }>(
        "/admin/v1/support/upload",
        {
          method: "POST",
          body: JSON.stringify({
            image: dataUrl,
            mime: file.type || undefined,
          }),
        },
      );
      editForm.setFieldsValue({ media_url: uploaded.media_url });
      message.success("图片已上传");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const saveEditQuick = async () => {
    const values = await editForm.validateFields();
    const text = String(values.text || "").trim();
    const mediaUrl = (values.media_url as string | null | undefined)?.trim() || null;
    if (!text && !mediaUrl) {
      message.error("请填写内容或上传图片");
      return;
    }
    const item: QuickReply = {
      id: editing?.id || newQuickId(),
      title: values.title.trim(),
      text,
      media_url: mediaUrl,
      lang: normalizeQuickReplyLang(values.lang),
      sort: Number(values.sort) || 100,
      enabled: !!values.enabled,
    };
    setManageDraft((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
    setEditOpen(false);
  };

  const saveManage = async () => {
    setManageSaving(true);
    try {
      const res = await adminFetch<{ items: QuickReply[] }>(
        "/admin/v1/telegram/quick-replies",
        {
          method: "PUT",
          body: JSON.stringify({
            items: manageDraft.map((r) => ({
              ...r,
              lang: normalizeQuickReplyLang(r.lang),
            })),
          }),
        },
      );
      setQuickReplies(
        (res.items || []).map((r) => ({
          ...r,
          lang: normalizeQuickReplyLang(r.lang),
        })),
      );
      setManageOpen(false);
      message.success("快捷回复已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setManageSaving(false);
    }
  };

  const sendReply = () => {
    if (!activeId) return;
    const text = reply.trim();
    const image = pendingImage;
    const readyMediaUrl = pendingMediaUrl;
    if (!text && !image && !readyMediaUrl) return;
    const conversationId = activeId;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const suggestKey = unrepliedSuggestKey;
    const hasMedia = Boolean(image || readyMediaUrl);
    const optimistic: ChatMessage = {
      id: tempId,
      direction: "outbound",
      source: "admin",
      content_type: hasMedia ? "image" : "text",
      text: text || null,
      media_url: image?.dataUrl || readyMediaUrl || null,
      admin_username: null,
      recalled_at: null,
      recallable: false,
      created_at: nowIso,
    };

    setReply("");
    setPendingImage(null);
    setPendingMediaUrl(null);
    if (suggestKey) {
      setDismissedSuggest((prev) => new Set(prev).add(suggestKey));
    }
    setMessages((prev) => [...prev, optimistic]);
    messageIdsRef.current = new Set([...messageIdsRef.current, tempId]);
    setItems((prev) => {
      const next = prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              last_message_at: nowIso,
              last_message_preview: hasMedia
                ? text
                  ? `[图片] ${text}`
                  : "[图片]"
                : text,
              unread_count: 0,
            }
          : c,
      );
      next.sort((a, b) =>
        (b.last_message_at || "").localeCompare(a.last_message_at || ""),
      );
      return next;
    });
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    setPendingSends((n) => n + 1);
    void (async () => {
      try {
        let mediaUrl: string | undefined = readyMediaUrl || undefined;
        if (image) {
          const dataUrl = await fileToDataUrl(image.file);
          const uploaded = await adminFetch<{ media_url: string }>(
            "/admin/v1/support/upload",
            {
              method: "POST",
              body: JSON.stringify({
                image: dataUrl,
                mime: image.file.type || undefined,
              }),
            },
          );
          mediaUrl = uploaded.media_url;
        }
        const msg = await adminFetch<ChatMessage>(
          `/admin/v1/support/conversations/${conversationId}/reply`,
          {
            method: "POST",
            body: JSON.stringify({
              text: text || undefined,
              media_url: mediaUrl,
            }),
          },
        );
        setMessages((prev) => prev.map((m) => (m.id === tempId ? msg : m)));
        messageIdsRef.current.delete(tempId);
        messageIdsRef.current.add(msg.id);
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        messageIdsRef.current.delete(tempId);
        setReply((cur) => (cur.trim() ? cur : text));
        if (image) setPendingImage(image);
        if (readyMediaUrl) setPendingMediaUrl(readyMediaUrl);
        message.error(e instanceof Error ? e.message : "发送失败");
      } finally {
        setPendingSends((n) => Math.max(0, n - 1));
      }
    })();
  };

  const attachImageFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      message.error("仅支持图片");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      message.error("图片不能超过 4MB");
      return;
    }
    void fileToDataUrl(file).then((dataUrl) => {
      setPendingMediaUrl(null);
      setPendingImage({ dataUrl, file });
    });
  };

  const recallMessage = (msg: ChatMessage) => {
    if (!activeId || msg.recalled_at || msg.id.startsWith("temp-")) return;
    if (!msg.recallable) return;
    const conversationId = activeId;
    const messageId = msg.id;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              recalled_at: new Date().toISOString(),
              recallable: false,
              text: null,
            }
          : m,
      ),
    );
    void adminFetch<ChatMessage>(
      `/admin/v1/support/conversations/${conversationId}/messages/${messageId}/recall`,
      { method: "POST" },
    )
      .then((updated) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, ...updated } : m)),
        );
        void loadInbox({ silent: true });
      })
      .catch((e) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? msg : m)),
        );
        message.error(e instanceof Error ? e.message : "撤回失败");
      });
  };

  const user = conversation?.user ?? null;
  const guest = conversation?.guest ?? null;
  const tg = conversation?.telegram ?? null;

  return (
    <PageContainer
      title="客服台"
      subTitle={
        <Space>
          <Badge count={unreadTotal} size="small" offset={[6, 0]}>
            <span>多渠道未读</span>
          </Badge>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => void loadInbox()}>
          刷新
        </Button>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 12,
          minHeight: 560,
        }}
      >
        <Card
          size="small"
          title="会话"
          loading={loading}
          styles={{ body: { padding: 0, maxHeight: 680, overflow: "auto" } }}
          extra={
            <Switch
              size="small"
              checked={unreadOnly}
              onChange={setUnreadOnly}
              checkedChildren="未读"
              unCheckedChildren="全部"
            />
          }
        >
          <div style={{ padding: "8px 12px", display: "grid", gap: 8 }}>
            <Select
              size="small"
              value={channelFilter}
              onChange={setChannelFilter}
              options={[
                { value: "all", label: "全部渠道" },
                { value: "web", label: "H5 官网" },
                { value: "app", label: "App" },
                { value: "telegram", label: "Telegram" },
              ]}
            />
            <Input.Search
              allowClear
              placeholder="搜昵称 / UID / 邮箱 / IP / 内容"
              onSearch={(v) => setQ(v)}
            />
          </div>
          {items.length === 0 ? (
            <Empty style={{ padding: 24 }} description="暂无会话" />
          ) : (
            items.map((c) => {
              const active = c.id === activeId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid #f0f0f0",
                    background: active ? "#e6f4ff" : "transparent",
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Typography.Text strong ellipsis style={{ flex: 1 }}>
                      {convTitle(c)}
                    </Typography.Text>
                    <Badge count={c.unread_count} size="small" />
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {channelTag(c.channel)}
                    {c.channel === "web" ? entryTag(c.guest) : null}
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {c.language_code || c.telegram?.language_code
                        ? languageLabel(
                            c.language_code || c.telegram?.language_code,
                          )
                        : c.guest?.locale
                          ? languageLabel(c.guest.locale)
                          : "语言未知"}
                      {c.telegram?.is_premium ? " · Premium" : ""}
                      {c.user?.uid != null
                        ? ` · UID ${c.user.uid}`
                        : " · 未绑定"}
                    </Typography.Text>
                  </div>
                  <Typography.Text
                    type="secondary"
                    ellipsis
                    style={{ fontSize: 12, display: "block", marginTop: 2 }}
                  >
                    {c.last_message_preview || "—"}
                  </Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {c.last_message_at
                        ? new Date(c.last_message_at).toLocaleString()
                        : ""}
                    </Typography.Text>
                  </div>
                </button>
              );
            })
          )}
        </Card>

        <Card
          size="small"
          loading={threadLoading && !conversation}
          title={
            conversation ? (
              <Space wrap>
                {channelTag(conversation.channel)}
                {conversation.channel === "web" ? entryTag(guest) : null}
                <span>{convTitle(conversation)}</span>
                {conversation.language_code ||
                tg?.language_code ||
                guest?.locale ? (
                  <Tag color="blue">
                    {languageLabel(
                      conversation.language_code ||
                        tg?.language_code ||
                        guest?.locale,
                    )}
                  </Tag>
                ) : (
                  <Tag>语言未知</Tag>
                )}
                {tg?.is_premium ? <Tag color="gold">Premium</Tag> : null}
                {user?.uid != null ? (
                  <Tag icon={<UserOutlined />}>UID {user.uid}</Tag>
                ) : (
                  <Tag>未绑定</Tag>
                )}
                {tg ? (
                  tg.blocked ? (
                    <Tag color="error">已失效</Tag>
                  ) : tg.can_dm ? (
                    <Tag color="success">可私聊</Tag>
                  ) : (
                    <Tag>不可私聊</Tag>
                  )
                ) : null}
              </Space>
            ) : (
              "选择会话"
            )
          }
          extra={
            user ? (
              <Tooltip title="新窗口打开用户资料">
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<ExportOutlined />}
                  onClick={() => openUserDetail(user.id)}
                >
                  用户资料
                </Button>
              </Tooltip>
            ) : conversation ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                尚未绑定 Habibi 账号
              </Typography.Text>
            ) : null
          }
          styles={{
            body: {
              display: "flex",
              flexDirection: "column",
              height: 680,
              padding: 0,
            },
          }}
        >
          {!conversation ? (
            <Empty style={{ margin: "auto" }} description="从左侧选择会话" />
          ) : (
            <>
              <div
                style={{
                  padding: "8px 14px 4px",
                  borderBottom: "1px solid #f0f0f0",
                  background: "#fafafa",
                  maxHeight: profileExpanded ? 280 : undefined,
                  overflow: profileExpanded ? "auto" : "visible",
                }}
              >
                <Descriptions
                  size="small"
                  column={3}
                  styles={{ label: { width: 72, color: "rgba(0,0,0,0.45)" } }}
                >
                  {!profileExpanded ? (
                    <>
                      {guest ? (
                        <>
                          <Descriptions.Item label="来源">
                            {guest.client_source === "app" ? (
                              <Tag color="purple">App</Tag>
                            ) : (
                              <Tag>H5 官网</Tag>
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="访客 IP">
                            <Typography.Text
                              copyable={!!guest.ip}
                              style={{ fontSize: 12 }}
                            >
                              {guest.ip || "—"}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="浏览器">
                            {[guest.browser_name, guest.os_name]
                              .filter(Boolean)
                              .join(" / ") || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近活跃">
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {fmtTime(guest.last_seen_at)}
                            </Typography.Text>
                          </Descriptions.Item>
                        </>
                      ) : null}
                      {tg ? (
                        <>
                          <Descriptions.Item label="TG 名称">
                            {[tg.first_name, tg.last_name]
                              .filter(Boolean)
                              .join(" ") || "—"}
                            {tg.username ? ` (@${tg.username})` : ""}
                          </Descriptions.Item>
                          <Descriptions.Item label="TG ID">
                            <Typography.Text copyable style={{ fontSize: 12 }}>
                              {tg.telegram_user_id}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="私聊">
                            {tg.blocked
                              ? "已失效"
                              : tg.can_dm
                                ? "可私聊"
                                : "不可私聊"}
                          </Descriptions.Item>
                        </>
                      ) : null}
                      {user ? (
                        <>
                          <Descriptions.Item label="UID">
                            <Typography.Link
                              onClick={() => openUserDetail(user.id)}
                            >
                              {user.uid}
                            </Typography.Link>
                          </Descriptions.Item>
                          <Descriptions.Item label="邮箱">
                            <Typography.Text
                              ellipsis
                              style={{ maxWidth: 180 }}
                            >
                              {user.email || "—"}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="状态">
                            <Tag color={statusColor(user.status)}>
                              {user.status}
                            </Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="套餐" span={2}>
                            {(() => {
                              const subs = user.subscriptions || [];
                              const primary =
                                subs.find(
                                  (s) =>
                                    s.active ??
                                    (!s.expired && s.status === "active"),
                                ) || subs[0];
                              if (!primary) {
                                return (
                                  <Typography.Text type="secondary">
                                    无套餐
                                  </Typography.Text>
                                );
                              }
                              const active =
                                primary.active ??
                                (!primary.expired &&
                                  primary.status === "active");
                              return (
                                <Space size={6} wrap>
                                  <span>
                                    {primary.plan_name ||
                                      primary.plan_code ||
                                      "套餐"}
                                  </span>
                                  <Tag
                                    color={
                                      active
                                        ? "success"
                                        : primary.expired
                                          ? "default"
                                          : "warning"
                                    }
                                  >
                                    {primary.expired
                                      ? "已过期"
                                      : primary.status}
                                  </Tag>
                                  <Typography.Text
                                    type="secondary"
                                    style={{ fontSize: 12 }}
                                  >
                                    到期 {fmtTime(primary.expires_at)}
                                    {(user.subscription_count || 0) > 1
                                      ? ` · 共 ${user.subscription_count} 个`
                                      : ""}
                                  </Typography.Text>
                                </Space>
                              );
                            })()}
                          </Descriptions.Item>
                          <Descriptions.Item label="钱包">
                            {user.wallet
                              ? money(user.wallet.available_cents)
                              : "—"}
                          </Descriptions.Item>
                          {user.admin_remark ? (
                            <Descriptions.Item label="备注" span={3}>
                              <Typography.Text
                                type="warning"
                                ellipsis={{ tooltip: user.admin_remark }}
                                style={{ maxWidth: "100%" }}
                              >
                                {user.admin_remark}
                              </Typography.Text>
                            </Descriptions.Item>
                          ) : null}
                        </>
                      ) : (
                        <Descriptions.Item label="账号" span={3}>
                          <Typography.Text type="secondary">
                            未绑定 Habibi 账号
                          </Typography.Text>
                        </Descriptions.Item>
                      )}
                    </>
                  ) : (
                    <>
                      {guest ? (
                        <>
                          <Descriptions.Item label="来源">
                            {guest.client_source === "app" ? (
                              <Tag color="purple">App</Tag>
                            ) : (
                              <Tag>H5 官网</Tag>
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="访客 IP">
                            <Typography.Text
                              copyable={!!guest.ip}
                              style={{ fontSize: 12 }}
                            >
                              {guest.ip || "—"}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="浏览器">
                            {guest.browser_name || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="系统">
                            {[guest.os_name, guest.os_version]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="时区">
                            {guest.timezone || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Locale">
                            {languageLabel(guest.locale)}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近活跃">
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {fmtTime(guest.last_seen_at)}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="UA" span={3}>
                            <Typography.Text
                              ellipsis={{
                                tooltip: guest.user_agent || undefined,
                              }}
                              style={{ maxWidth: "100%" }}
                            >
                              {guest.user_agent || "—"}
                            </Typography.Text>
                          </Descriptions.Item>
                        </>
                      ) : null}
                      {tg ? (
                        <>
                          <Descriptions.Item label="TG 语言">
                            {languageLabel(tg.language_code)}
                          </Descriptions.Item>
                          <Descriptions.Item label="TG 名称">
                            {[tg.first_name, tg.last_name]
                              .filter(Boolean)
                              .join(" ") || "—"}
                            {tg.username ? ` (@${tg.username})` : ""}
                          </Descriptions.Item>
                          <Descriptions.Item label="TG ID">
                            <Typography.Text copyable style={{ fontSize: 12 }}>
                              {tg.telegram_user_id}
                            </Typography.Text>
                            {tg.is_premium ? (
                              <Tag
                                color="gold"
                                style={{ marginInlineStart: 6 }}
                              >
                                Premium
                              </Tag>
                            ) : null}
                          </Descriptions.Item>
                          <Descriptions.Item label="私聊权限">
                            {tg.blocked
                              ? "已失效"
                              : tg.can_dm
                                ? "可私聊"
                                : "不可私聊"}
                            {tg.allows_write_to_pm != null
                              ? ` · write=${tg.allows_write_to_pm ? "是" : "否"}`
                              : ""}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近活跃">
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {fmtTime(tg.last_seen_at)}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="首次 /start">
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {fmtTime(tg.started_at)}
                            </Typography.Text>
                          </Descriptions.Item>
                        </>
                      ) : null}
                      {user ? (
                        <>
                          <Descriptions.Item label="UID">
                            <Typography.Link
                              onClick={() => openUserDetail(user.id)}
                            >
                              {user.uid}
                            </Typography.Link>
                          </Descriptions.Item>
                          <Descriptions.Item label="邮箱">
                            <Typography.Text
                              ellipsis
                              style={{ maxWidth: 180 }}
                            >
                              {user.email || "—"}
                            </Typography.Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="状态">
                            <Tag color={statusColor(user.status)}>
                              {user.status}
                            </Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="邀请码">
                            {user.invite_code || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="分佣组">
                            {user.promo_group
                              ? `${user.promo_group.name} (${user.promo_group.code})`
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="钱包">
                            {user.wallet
                              ? `${money(user.wallet.available_cents)}${
                                  user.wallet.pending_cents > 0
                                    ? ` · 待结算 ${money(user.wallet.pending_cents)}`
                                    : ""
                                }`
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="套餐" span={3}>
                            {(user.subscriptions || []).length === 0 ? (
                              <Typography.Text type="secondary">
                                无套餐
                              </Typography.Text>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                }}
                              >
                                {(user.subscription_count || 0) > 1 ? (
                                  <Typography.Text
                                    type="secondary"
                                    style={{ fontSize: 12 }}
                                  >
                                    共 {user.subscription_count} 个 · 有效{" "}
                                    {user.active_subscription_count ?? 0}
                                  </Typography.Text>
                                ) : null}
                                {(user.subscriptions || []).map((sub) => {
                                  const active =
                                    sub.active ??
                                    (!sub.expired && sub.status === "active");
                                  return (
                                    <Space key={sub.id} size={6} wrap>
                                      <span>
                                        {sub.plan_name ||
                                          sub.plan_code ||
                                          "套餐"}
                                      </span>
                                      <Tag
                                        color={
                                          active
                                            ? "success"
                                            : sub.expired
                                              ? "default"
                                              : "warning"
                                        }
                                      >
                                        {sub.expired ? "已过期" : sub.status}
                                      </Tag>
                                      <Typography.Text
                                        type="secondary"
                                        style={{ fontSize: 12 }}
                                      >
                                        到期 {fmtTime(sub.expires_at)}
                                      </Typography.Text>
                                    </Space>
                                  );
                                })}
                              </div>
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="注册">
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {fmtTime(user.created_at)}
                            </Typography.Text>
                          </Descriptions.Item>
                          {user.admin_remark ? (
                            <Descriptions.Item label="备注" span={3}>
                              <Typography.Text
                                type="warning"
                                ellipsis={{ tooltip: user.admin_remark }}
                                style={{ maxWidth: "100%" }}
                              >
                                {user.admin_remark}
                              </Typography.Text>
                            </Descriptions.Item>
                          ) : null}
                        </>
                      ) : (
                        <Descriptions.Item label="账号" span={3}>
                          <Typography.Text type="secondary">
                            未绑定 Habibi 账号
                          </Typography.Text>
                        </Descriptions.Item>
                      )}
                    </>
                  )}
                </Descriptions>
                <div style={{ textAlign: "center", marginTop: 2 }}>
                  <Button
                    type="link"
                    size="small"
                    icon={
                      profileExpanded ? <UpOutlined /> : <DownOutlined />
                    }
                    onClick={() => setProfileExpanded((v) => !v)}
                  >
                    {profileExpanded ? "收起" : "展开全部"}
                  </Button>
                </div>
              </div>

              <div
                ref={threadScrollRef}
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 14,
                  background: "#fafafa",
                }}
              >
                {messages.map((m) => {
                  const mine = m.direction === "outbound";
                  const caption = messageCaption(m);
                  const wide =
                    !!caption &&
                    !m.recalled_at &&
                    looksLikeStructuredOrLongText(caption);
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: mine ? "flex-end" : "flex-start",
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: wide ? "92%" : "78%",
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: mine ? "#1677ff" : "#fff",
                          color: mine ? "#fff" : "rgba(0,0,0,0.88)",
                          border: mine ? "none" : "1px solid #f0f0f0",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          {m.source}
                          {m.admin_username ? ` · ${m.admin_username}` : ""}
                          {" · "}
                          {fmtTime(m.created_at)}
                        </div>
                        {m.recalled_at ? (
                          <div>已撤回</div>
                        ) : (
                          <>
                            {m.media_url ? (
                              <a
                                href={mediaSrc(m.media_url)}
                                target="_blank"
                                rel="noreferrer"
                                style={{ display: "block", marginBottom: 4 }}
                              >
                                <img
                                  src={mediaSrc(m.media_url)}
                                  alt="图片"
                                  style={{
                                    maxWidth: 240,
                                    maxHeight: 240,
                                    borderRadius: 8,
                                    display: "block",
                                    objectFit: "cover",
                                  }}
                                />
                              </a>
                            ) : null}
                            {caption ? (
                              <SupportMessageText
                                text={caption}
                                inverted={mine}
                              />
                            ) : null}
                            {!m.media_url && !caption ? (
                              <div>[消息]</div>
                            ) : null}
                          </>
                        )}
                        {mine && m.recallable ? (
                          <Button
                            type="link"
                            size="small"
                            style={{
                              color: "rgba(255,255,255,0.85)",
                              padding: 0,
                              height: "auto",
                            }}
                            onClick={() => recallMessage(m)}
                          >
                            撤回
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {suggestedReplies.length > 0 ? (
                <div
                  style={{
                    padding: "6px 12px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    推荐
                  </Typography.Text>
                  {suggestedReplies.map((r) => (
                    <Tooltip
                      key={r.id}
                      title={
                        r.media_url
                          ? `${r.text || "[图片]"}${r.text ? " · 含图片" : ""}`
                          : r.text
                      }
                    >
                      <Tag
                        color="processing"
                        style={{ cursor: "pointer" }}
                        onClick={() => applyQuickReply(r)}
                      >
                        {r.media_url ? (
                          <Space size={4}>
                            <PictureOutlined />
                            {r.title}
                          </Space>
                        ) : (
                          r.title
                        )}
                      </Tag>
                    </Tooltip>
                  ))}
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => {
                      if (unrepliedSuggestKey) {
                        setDismissedSuggest((prev) =>
                          new Set(prev).add(unrepliedSuggestKey),
                        );
                      }
                    }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  padding: "8px 12px",
                  borderTop: "1px solid #f0f0f0",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  快捷 ({langOptionLabel(customerLang)})
                </Typography.Text>
                {enabledQuickReplies.slice(0, 12).map((r) => (
                  <Tooltip
                    key={r.id}
                    title={
                      r.media_url
                        ? `${r.text || "[图片]"}${r.text ? " · 含图片" : ""}`
                        : r.text
                    }
                  >
                    <Tag
                      style={{ cursor: "pointer" }}
                      onClick={() => applyQuickReply(r)}
                    >
                      {r.media_url ? (
                        <Space size={4}>
                          <PictureOutlined />
                          {r.title}
                        </Space>
                      ) : (
                        r.title
                      )}
                    </Tag>
                  </Tooltip>
                ))}
                <Button
                  type="text"
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={openManage}
                >
                  管理
                </Button>
              </div>

              {pendingImage || pendingMediaUrl ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <img
                    src={
                      pendingImage?.dataUrl || mediaSrc(pendingMediaUrl) || ""
                    }
                    alt="待发送"
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "cover",
                      borderRadius: 6,
                    }}
                  />
                  <Typography.Text type="secondary" style={{ flex: 1 }}>
                    {pendingImage?.file.name || "快捷回复图片"}
                  </Typography.Text>
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={() => {
                      setPendingImage(null);
                      setPendingMediaUrl(null);
                    }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  padding: 12,
                  borderTop: "1px solid #f0f0f0",
                  display: "flex",
                  gap: 8,
                }}
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    attachImageFile(file);
                  }}
                />
                <Button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={pendingSends > 0}
                >
                  图片
                </Button>
                <Input.TextArea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  placeholder="输入回复，或 Ctrl/⌘+V 粘贴图片…"
                  onPaste={(e) => {
                    const file = imageFileFromClipboard(e);
                    if (!file) return;
                    e.preventDefault();
                    attachImageFile(file);
                  }}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={pendingSends > 0}
                  disabled={
                    !reply.trim() && !pendingImage && !pendingMediaUrl
                  }
                  onClick={sendReply}
                >
                  发送
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        title="快捷回复管理"
        open={manageOpen}
        onCancel={() => setManageOpen(false)}
        onOk={() => void saveManage()}
        confirmLoading={manageSaving}
        width={720}
        okText="保存"
      >
        <Space style={{ marginBottom: 12 }}>
          <Button icon={<PlusOutlined />} onClick={openCreateQuick}>
            新增
          </Button>
          <Typography.Text type="secondary">
            按语言维护话术；聊天中按客户语言筛选，无匹配时回退中文
          </Typography.Text>
        </Space>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={manageDraft}
          columns={[
            { title: "标题", dataIndex: "title", width: 120 },
            {
              title: "语言",
              dataIndex: "lang",
              width: 100,
              render: (v: string) => langOptionLabel(v),
            },
            {
              title: "内容",
              dataIndex: "text",
              ellipsis: true,
              render: (v: string, r: QuickReply) => (
                <Space size={8}>
                  {r.media_url ? (
                    <img
                      src={mediaSrc(r.media_url)}
                      alt=""
                      style={{
                        width: 36,
                        height: 36,
                        objectFit: "cover",
                        borderRadius: 4,
                      }}
                    />
                  ) : null}
                  <Typography.Text ellipsis style={{ maxWidth: 280 }}>
                    {v || (r.media_url ? "[图片]" : "—")}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "排序",
              dataIndex: "sort",
              width: 70,
            },
            {
              title: "启用",
              dataIndex: "enabled",
              width: 70,
              render: (v: boolean) => (v ? "是" : "否"),
            },
            {
              title: "操作",
              width: 140,
              render: (_: unknown, r: QuickReply) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEditQuick(r)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() =>
                      setManageDraft((prev) => prev.filter((x) => x.id !== r.id))
                    }
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={editing ? "编辑快捷回复" : "新增快捷回复"}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => void saveEditQuick()}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入标题" }]}
          >
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="text" label="文字内容">
            <Input.TextArea
              rows={4}
              maxLength={2000}
              placeholder="可与图片一起使用；纯图片话术可留空"
            />
          </Form.Item>
          <Form.Item name="media_url" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="图片" shouldUpdate>
            {() => {
              const url = editForm.getFieldValue("media_url") as
                | string
                | null
                | undefined;
              return (
                <Space direction="vertical" style={{ width: "100%" }}>
                  {url ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <img
                        src={mediaSrc(url)}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                      <Button
                        size="small"
                        danger
                        onClick={() =>
                          editForm.setFieldsValue({ media_url: null })
                        }
                      >
                        移除图片
                      </Button>
                    </div>
                  ) : null}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadQuickReplyImage(file);
                    }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    支持 jpg / png / webp / gif，最大 4MB；文字与图片至少填一项
                  </Typography.Text>
                </Space>
              );
            }}
          </Form.Item>
          <Form.Item name="lang" label="语言" initialValue="zh">
            <Select options={[...QUICK_REPLY_LANG_OPTIONS]} />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={100}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
