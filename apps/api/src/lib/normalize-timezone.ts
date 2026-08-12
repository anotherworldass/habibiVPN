/**
 * Canonicalize client-reported timezones for auth-event storage / ops stats.
 *
 * Preferred wire format (all modern clients can produce this):
 *   IANA id via Intl / TimeZone.current.identifier / TimeZone.getID()
 *   e.g. Asia/Shanghai, Asia/Dubai, Asia/Hong_Kong
 *
 * Fallbacks we accept and normalize:
 *   - UTC offsets: +04, +4, UTC+4, GMT+04:00 → UTC+04:00
 *   - Common abbreviations used by older / native clients → IANA when unambiguous
 */

/** Product-relevant abbreviations → IANA (ambiguous ones prefer Habibi markets). */
const ABBREV_TO_IANA: Record<string, string> = {
  HKT: "Asia/Hong_Kong",
  CST: "Asia/Shanghai", // China Standard Time (not US Central)
  CCT: "Asia/Shanghai",
  GST: "Asia/Dubai", // Gulf Standard Time
  MSK: "Europe/Moscow",
  IRST: "Asia/Tehran",
  IRDT: "Asia/Tehran",
  IST: "Asia/Kolkata", // India; Israel is IDT/IST ambiguous — product leans IN
  PKT: "Asia/Karachi",
  AST: "Asia/Riyadh", // Arabia Standard (not Atlantic)
  TRT: "Europe/Istanbul",
  JST: "Asia/Tokyo",
  KST: "Asia/Seoul",
  SGT: "Asia/Singapore",
  WIB: "Asia/Jakarta",
  UTC: "UTC",
  GMT: "UTC",
};

function isValidIana(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Normalize "+4" / "UTC+04" / "GMT+04:00" → "UTC+04:00". */
function normalizeUtcOffset(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return null;
  const sign = m[1]!;
  const hours = Number(m[2]);
  const mins = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isFinite(hours) || hours > 14 || mins > 59) return null;
  if (hours === 0 && mins === 0) return "UTC";
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Returns canonical timezone string, or null if empty / unusable.
 * Prefer IANA; otherwise UTC±HH:MM; never invent a city for bare offsets.
 */
export function normalizeTimezone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().slice(0, 64);
  if (!trimmed) return null;

  // Already IANA (or Etc/GMT*)
  if (isValidIana(trimmed)) return trimmed;

  // Underscore / space variants of IANA
  const asIana = trimmed.replace(/ /g, "_");
  if (asIana !== trimmed && isValidIana(asIana)) return asIana;

  // Abbreviation
  const abbrev = trimmed.toUpperCase().replace(/[^A-Z]/g, "");
  if (abbrev && ABBREV_TO_IANA[abbrev]) {
    return ABBREV_TO_IANA[abbrev]!;
  }

  // Offset forms
  const offset = normalizeUtcOffset(trimmed);
  if (offset) return offset;

  // Last resort: keep original if it looks like Region/City with bad casing
  const regionCity = trimmed.match(/^([A-Za-z]+)\/([A-Za-z0-9_\-+]+)$/);
  if (regionCity) {
    const candidate = `${regionCity[1]}/${regionCity[2]}`;
    if (isValidIana(candidate)) return candidate;
  }

  return trimmed.slice(0, 64);
}
