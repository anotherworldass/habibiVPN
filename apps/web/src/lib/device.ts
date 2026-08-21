const DEVICE_KEY = "habibi_web_device_id";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = randomId();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function buildWebClientMeta() {
  const deviceId = getOrCreateDeviceId();
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }
  return {
    device_id: deviceId,
    timezone,
    os_name: "web",
    shell: "h5",
  };
}
