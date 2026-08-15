/** ISO2 → 中文地区名（订阅节点名 / 节点池展示共用） */
export const REGION_ZH: Record<string, string> = {
  AE: "阿联酋",
  AU: "澳大利亚",
  BR: "巴西",
  CA: "加拿大",
  CH: "瑞士",
  CN: "中国",
  DE: "德国",
  ES: "西班牙",
  FR: "法国",
  GB: "英国",
  HK: "香港",
  ID: "印尼",
  IN: "印度",
  IT: "意大利",
  JP: "日本",
  KR: "韩国",
  MO: "澳门",
  MY: "马来西亚",
  NL: "荷兰",
  PH: "菲律宾",
  RU: "俄罗斯",
  SE: "瑞典",
  SG: "新加坡",
  TH: "泰国",
  TR: "土耳其",
  TW: "台湾",
  UK: "英国",
  US: "美国",
  VN: "越南",
};

const ZH_ALIASES: Array<[string, string]> = [
  ["香港", "HK"],
  ["日本", "JP"],
  ["新加坡", "SG"],
  ["台湾", "TW"],
  ["台灣", "TW"],
  ["韩国", "KR"],
  ["韓國", "KR"],
  ["南韩", "KR"],
  ["美国", "US"],
  ["美國", "US"],
  ["英国", "GB"],
  ["英國", "GB"],
  ["德国", "DE"],
  ["德國", "DE"],
  ["法国", "FR"],
  ["法國", "FR"],
  ["荷兰", "NL"],
  ["荷蘭", "NL"],
  ["澳大利亚", "AU"],
  ["澳洲", "AU"],
  ["加拿大", "CA"],
  ["阿联酋", "AE"],
  ["阿聯酋", "AE"],
  ["迪拜", "AE"],
  ["杜拜", "AE"],
  ["印度", "IN"],
  ["菲律宾", "PH"],
  ["菲律賓", "PH"],
  ["越南", "VN"],
  ["泰国", "TH"],
  ["泰國", "TH"],
  ["马来西亚", "MY"],
  ["馬來西亞", "MY"],
  ["印尼", "ID"],
  ["印度尼西亚", "ID"],
  ["巴西", "BR"],
  ["瑞士", "CH"],
  ["瑞典", "SE"],
  ["土耳其", "TR"],
  ["意大利", "IT"],
  ["義大利", "IT"],
  ["西班牙", "ES"],
  ["俄罗斯", "RU"],
  ["俄羅斯", "RU"],
  ["澳门", "MO"],
  ["澳門", "MO"],
  ["中国", "CN"],
  ["中國", "CN"],
];

const EN_ALIASES: Array<[string, string]> = [
  ["hong kong", "HK"],
  ["hongkong", "HK"],
  ["hong-kong", "HK"],
  ["japan", "JP"],
  ["tokyo", "JP"],
  ["singapore", "SG"],
  ["taiwan", "TW"],
  ["taipei", "TW"],
  ["korea", "KR"],
  ["seoul", "KR"],
  ["united states", "US"],
  ["america", "US"],
  ["usa", "US"],
  ["united kingdom", "GB"],
  ["britain", "GB"],
  ["england", "GB"],
  ["london", "GB"],
  ["germany", "DE"],
  ["frankfurt", "DE"],
  ["france", "FR"],
  ["paris", "FR"],
  ["netherlands", "NL"],
  ["amsterdam", "NL"],
  ["australia", "AU"],
  ["sydney", "AU"],
  ["canada", "CA"],
  ["toronto", "CA"],
  ["united arab emirates", "AE"],
  ["dubai", "AE"],
  ["india", "IN"],
  ["philippines", "PH"],
  ["vietnam", "VN"],
  ["thailand", "TH"],
  ["malaysia", "MY"],
  ["indonesia", "ID"],
  ["brazil", "BR"],
  ["switzerland", "CH"],
  ["sweden", "SE"],
  ["turkey", "TR"],
  ["italy", "IT"],
  ["spain", "ES"],
  ["russia", "RU"],
  ["macau", "MO"],
  ["macao", "MO"],
];

const ISO_CODES = [
  ...new Set(
    Object.keys(REGION_ZH)
      .concat(ZH_ALIASES.map(([, c]) => c), EN_ALIASES.map(([, c]) => c))
      .map((c) => (c === "UK" ? "GB" : c)),
  ),
].sort((a, b) => b.length - a.length);

export const UNKNOWN_REGION = "UN";

export function normalizeRegionCode(code: string | null | undefined): string {
  const raw = (code || "").trim().toUpperCase();
  if (!raw) return UNKNOWN_REGION;
  if (raw === "UK") return "GB";
  return raw;
}

export function regionZhName(code: string): string {
  const n = normalizeRegionCode(code);
  if (n === UNKNOWN_REGION) return "其他";
  return REGION_ZH[n] || n;
}

function flagEmojiToIso(text: string): string | null {
  const chars = [...text];
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i]!.codePointAt(0);
    const b = chars[i + 1]!.codePointAt(0);
    if (
      a &&
      b &&
      a >= 0x1f1e6 &&
      a <= 0x1f1ff &&
      b >= 0x1f1e6 &&
      b <= 0x1f1ff
    ) {
      const iso =
        String.fromCharCode(a - 0x1f1e6 + 65) +
        String.fromCharCode(b - 0x1f1e6 + 65);
      return normalizeRegionCode(iso);
    }
  }
  return null;
}

function hasAsciiWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/** Infer ISO2 from a node remark / display name. */
export function inferRegionFromText(name: string): string {
  const text = (name || "").trim();
  if (!text) return UNKNOWN_REGION;

  const fromFlag = flagEmojiToIso(text);
  if (fromFlag && fromFlag !== UNKNOWN_REGION && REGION_ZH[fromFlag]) {
    return fromFlag;
  }

  for (const [alias, code] of ZH_ALIASES) {
    if (text.includes(alias)) return normalizeRegionCode(code);
  }

  const lower = text.toLowerCase();
  for (const [alias, code] of EN_ALIASES) {
    if (hasAsciiWord(lower, alias)) return normalizeRegionCode(code);
  }

  for (const code of ISO_CODES) {
    if (hasAsciiWord(text, code) || (code === "GB" && hasAsciiWord(text, "UK"))) {
      return normalizeRegionCode(code);
    }
  }

  return UNKNOWN_REGION;
}
