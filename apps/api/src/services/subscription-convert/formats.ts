/** Public client targets for GET /api/v1/sub/:token/:format */

export const SUB_CLIENT_FORMATS = [
  "clash",
  "mihomo",
  "clash_meta",
  "hiddify",
  "v2ray",
  "xray",
  "base64",
  "shadowrocket",
  "surge",
  "quantumult_x",
] as const;

export type SubClientFormat = (typeof SUB_CLIENT_FORMATS)[number];

export type SubRenderKind =
  | "clash"
  | "hiddify"
  | "base64"
  | "shadowrocket"
  | "surge"
  | "quantumult_x";

const ALIAS: Record<string, SubClientFormat> = {
  clash: "clash",
  mihomo: "mihomo",
  clash_meta: "clash_meta",
  "clash-meta": "clash_meta",
  meta: "clash_meta",
  hiddify: "hiddify",
  "hiddify-next": "hiddify",
  hiddifynext: "hiddify",
  v2ray: "v2ray",
  xray: "xray",
  base64: "base64",
  shadowrocket: "shadowrocket",
  sr: "shadowrocket",
  surge: "surge",
  quantumult_x: "quantumult_x",
  quantumultx: "quantumult_x",
  qx: "quantumult_x",
  "quantumult-x": "quantumult_x",
};

export function normalizeSubFormat(raw: string | undefined | null): SubClientFormat {
  if (!raw) return "base64";
  const key = raw.trim().toLowerCase();
  return ALIAS[key] || "base64";
}

export function renderKindFor(format: SubClientFormat): SubRenderKind {
  switch (format) {
    case "clash":
    case "mihomo":
    case "clash_meta":
      return "clash";
    case "hiddify":
      return "hiddify";
    case "surge":
      return "surge";
    case "quantumult_x":
      return "quantumult_x";
    case "shadowrocket":
      return "shadowrocket";
    default:
      return "base64";
  }
}

/** Labels shown in Admin / App for copyable client URLs */
export const SUB_CLIENT_URL_KEYS = [
  { key: "clash_meta", format: "clash", label: "Mihomo / Clash Meta (YAML)" },
  { key: "hiddify", format: "hiddify", label: "Hiddify" },
  { key: "v2ray", format: "v2ray", label: "Xray / V2Ray (Base64)" },
  { key: "shadowrocket", format: "shadowrocket", label: "Shadowrocket" },
  { key: "surge", format: "surge", label: "Surge Profile" },
  { key: "quantumult_x", format: "quantumult_x", label: "Quantumult X" },
] as const;

export type ClientSubscriptionUrls = Record<
  (typeof SUB_CLIENT_URL_KEYS)[number]["key"],
  string
>;
