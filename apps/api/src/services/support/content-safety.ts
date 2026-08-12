/**
 * High-confidence attack payload detection for support inbound text.
 * Tuned to avoid false positives on diagnostic dumps / normal support chat.
 */

export type SupportAttackHit = {
  rule: string;
};

const XSS_PATTERNS: Array<{ rule: string; re: RegExp }> = [
  { rule: "xss.script_tag", re: /<\s*\/?\s*script\b/i },
  { rule: "xss.iframe", re: /<\s*iframe\b/i },
  { rule: "xss.object", re: /<\s*object\b/i },
  { rule: "xss.embed", re: /<\s*embed\b/i },
  { rule: "xss.svg_event", re: /<\s*svg\b[^>]*\bon\w+\s*=/i },
  { rule: "xss.img_event", re: /<\s*img\b[^>]*\bon\w+\s*=/i },
  { rule: "xss.body_event", re: /<\s*body\b[^>]*\bon\w+\s*=/i },
  { rule: "xss.meta_refresh", re: /<\s*meta\b[^>]*http-equiv/i },
  { rule: "xss.base_tag", re: /<\s*base\b/i },
  { rule: "xss.link_tag", re: /<\s*link\b[^>]*\bhref\s*=/i },
  { rule: "xss.javascript_uri", re: /(?:^|[\s"'`=])javascript\s*:/i },
  { rule: "xss.vbscript_uri", re: /(?:^|[\s"'`=])vbscript\s*:/i },
  { rule: "xss.data_html", re: /data\s*:\s*text\/html/i },
  { rule: "xss.event_handler", re: /\bon(?:error|load|click|mouse\w+|focus|blur|submit|animation\w+|transition\w+)\s*=\s*['"`]?/i },
  { rule: "xss.document_cookie", re: /document\s*\.\s*(?:cookie|write|domain|location)/i },
  { rule: "xss.window_location", re: /window\s*\.\s*(?:location|open)\s*[=(]/i },
  { rule: "xss.eval", re: /(?:^|[^\w.])eval\s*\(/i },
  { rule: "xss.from_char_code", re: /String\s*\.\s*fromCharCode\s*\(/i },
  { rule: "xss.css_expression", re: /expression\s*\(\s*/i },
];

const SQLi_PATTERNS: Array<{ rule: string; re: RegExp }> = [
  { rule: "sqli.union_select", re: /\bunion\b\s+(?:all\s+)?\bselect\b/i },
  { rule: "sqli.drop_table", re: /\b(?:drop|truncate)\b\s+\b(?:table|database|schema)\b/i },
  { rule: "sqli.alter_table", re: /\balter\b\s+\btable\b/i },
  { rule: "sqli.insert_into", re: /\binsert\b\s+\binto\b/i },
  { rule: "sqli.delete_from", re: /\bdelete\b\s+\bfrom\b/i },
  { rule: "sqli.update_set", re: /\bupdate\b\s+\w+\s+\bset\b/i },
  { rule: "sqli.or_tautology", re: /(['"`])\s*or\s+\1?\s*\d+\s*\1?\s*=\s*\1?\s*\d+/i },
  { rule: "sqli.or_equals_str", re: /(['"`])\s*or\s+\1[^'"`]+\1\s*=\s*\1/i },
  { rule: "sqli.comment_tail", re: /(['"`])\s*;\s*(?:--|\#|\/\*)/ },
  { rule: "sqli.stacked", re: /;\s*(?:drop|delete|update|insert|select|alter|truncate)\b/i },
  { rule: "sqli.information_schema", re: /\binformation_schema\b/i },
  { rule: "sqli.sleep", re: /\b(?:sleep|benchmark)\s*\(\s*\d+/i },
  { rule: "sqli.load_file", re: /\b(?:load_file|into\s+(?:out|dump)file)\b/i },
  { rule: "sqli.xp_cmdshell", re: /\bxp_cmdshell\b/i },
];

const OTHER_PATTERNS: Array<{ rule: string; re: RegExp }> = [
  { rule: "ssi.php", re: /<\?(?:php|=)/i },
  { rule: "ssi.asp", re: /<%[=@]?/ },
  { rule: "rce.jndi", re: /\$\{\s*jndi\s*:/i },
  { rule: "ssti.mustache_probe", re: /\{\{\s*(?:7\s*\*\s*7|constructor|config|self|lipsum|request)\b/i },
  { rule: "ssti.jinja_probe", re: /\{%\s*(?:for|if|include|import|set|macro)\b/i },
  { rule: "probe.passwd", re: /(?:^|[\s"'`])(?:\.\.\/){2,}|(?:^|[\s"'`])\/etc\/(?:passwd|shadow)\b/i },
  { rule: "probe.proc_self", re: /\/proc\/self\//i },
  { rule: "probe.null_byte", re: /\0/ },
];

const ALL_PATTERNS = [...XSS_PATTERNS, ...SQLi_PATTERNS, ...OTHER_PATTERNS];

/** Decode common HTML entities / encodings used to smuggle tags. */
function normalizeForScan(text: string): string {
  let s = text.replace(/[\u0000\u200b\u200c\u200d\ufeff]/g, "");
  // numeric / hex entities for < > " '
  s = s
    .replace(/&#x0*3c;/gi, "<")
    .replace(/&#0*60;/g, "<")
    .replace(/&#x0*3e;/gi, ">")
    .replace(/&#0*62;/g, ">")
    .replace(/&#x0*22;/gi, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*39;/g, "'");
  s = s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'");
  // crude percent-decoding for %3Cscript etc. (ignore invalid sequences)
  try {
    if (/%[0-9a-f]{2}/i.test(s)) {
      s = decodeURIComponent(s.replace(/\+/g, "%20"));
    }
  } catch {
    /* ignore malformed */
  }
  return s;
}

export function detectSupportAttack(text: string): SupportAttackHit | null {
  const raw = text.trim();
  if (!raw) return null;
  const samples = [raw, normalizeForScan(raw)];
  const seen = new Set<string>();
  for (const sample of samples) {
    if (seen.has(sample)) continue;
    seen.add(sample);
    for (const { rule, re } of ALL_PATTERNS) {
      if (re.test(sample)) return { rule };
    }
  }
  return null;
}

export function assertSupportTextSafe(text: string | null | undefined): void {
  if (!text?.trim()) return;
  const hit = detectSupportAttack(text);
  if (!hit) return;
  throw Object.assign(new Error("support.unsafe_content"), {
    statusCode: 400,
    rule: hit.rule,
  });
}

/** For channels that cannot reject (e.g. Telegram): store a placeholder instead. */
export const SUPPORT_UNSAFE_PLACEHOLDER = "[已拦截疑似攻击内容]";

export function redactUnsafeSupportText(
  text: string | null | undefined,
): string | null {
  if (text == null) return null;
  if (!text.trim()) return text;
  return detectSupportAttack(text) ? SUPPORT_UNSAFE_PLACEHOLDER : text;
}
