const INVITE_KEY = "habibi_web_invite";

/** Same shape as invite landing / referral codes. */
export const INVITE_CODE_RE = /^[A-Z2-9]{3,8}$/;

export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw || "").trim().toUpperCase();
}

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_RE.test(code);
}

/** Persist invite code until registration succeeds or a newer invite overwrites it. */
export function saveInviteCode(raw: string | null | undefined) {
  if (typeof window === "undefined") return;
  const code = normalizeInviteCode(raw);
  if (!isValidInviteCode(code)) return;
  localStorage.setItem(INVITE_KEY, code);
}

export function peekInviteCode(): string | null {
  if (typeof window === "undefined") return null;
  const code = normalizeInviteCode(localStorage.getItem(INVITE_KEY));
  return isValidInviteCode(code) ? code : null;
}

export function clearInviteCode() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(INVITE_KEY);
}
