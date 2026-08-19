export type Carrier = "cmcc" | "cucc" | "ctcc";

const TEXT_RULES: [Carrier, RegExp][] = [
  ["cmcc", /中国移动|\bCMCC\b|China\s*Mobile|移动/i],
  ["cucc", /中国联通|\bCUCC\b|Unicom|联通/i],
  ["ctcc", /中国电信|\bCTCC\b|Telecom|电信/i],
];

/** Virtual-number 170x / 1349 first, then common 3-digit mainland prefixes. */
const PREFIX4: Record<string, Carrier> = {
  "1349": "ctcc",
  "1700": "ctcc",
  "1701": "ctcc",
  "1702": "ctcc",
  "1703": "cmcc",
  "1705": "cmcc",
  "1706": "cmcc",
  "1704": "cucc",
  "1707": "cucc",
  "1708": "cucc",
  "1709": "cucc",
};

const PREFIX3: Record<string, Carrier> = {
  "134": "cmcc",
  "135": "cmcc",
  "136": "cmcc",
  "137": "cmcc",
  "138": "cmcc",
  "139": "cmcc",
  "147": "cmcc",
  "148": "cmcc",
  "150": "cmcc",
  "151": "cmcc",
  "152": "cmcc",
  "157": "cmcc",
  "158": "cmcc",
  "159": "cmcc",
  "165": "cmcc",
  "172": "cmcc",
  "178": "cmcc",
  "182": "cmcc",
  "183": "cmcc",
  "184": "cmcc",
  "187": "cmcc",
  "188": "cmcc",
  "195": "cmcc",
  "197": "cmcc",
  "198": "cmcc",
  "130": "cucc",
  "131": "cucc",
  "132": "cucc",
  "145": "cucc",
  "146": "cucc",
  "155": "cucc",
  "156": "cucc",
  "166": "cucc",
  "167": "cucc",
  "171": "cucc",
  "175": "cucc",
  "176": "cucc",
  "185": "cucc",
  "186": "cucc",
  "196": "cucc",
  "133": "ctcc",
  "149": "ctcc",
  "153": "ctcc",
  "162": "ctcc",
  "173": "ctcc",
  "177": "ctcc",
  "180": "ctcc",
  "181": "ctcc",
  "189": "ctcc",
  "190": "ctcc",
  "191": "ctcc",
  "193": "ctcc",
  "199": "ctcc",
};

export function detectCarrierFromText(...parts: Array<string | null | undefined>): Carrier | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  for (const [carrier, re] of TEXT_RULES) {
    if (re.test(text)) return carrier;
  }
  return null;
}

export function phoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("86") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0086") && d.length >= 14) d = d.slice(4);
  return d;
}

export function detectCarrierFromPhone(phone: string): Carrier | null {
  const d = phoneDigits(phone);
  if (d.length < 3) return null;
  if (d.length >= 4) {
    const p4 = PREFIX4[d.slice(0, 4)];
    if (p4) return p4;
  }
  return PREFIX3[d.slice(0, 3)] || null;
}
