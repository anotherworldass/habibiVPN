export type ProxyNode = {
  name: string;
  type: "vless" | "vmess" | "trojan" | "hysteria2" | "ss" | "tuic";
  server: string;
  port: number;
  uuid?: string;
  password?: string;
  cipher?: string;
  udp?: boolean;
  tls?: boolean;
  servername?: string;
  fingerprint?: string;
  alpn?: string[];
  network?: string;
  flow?: string;
  realityPublicKey?: string;
  realityShortId?: string;
  realitySpiderX?: string;
  insecure?: boolean;
  /** Original share URI (for base64 passthrough) */
  raw: string;
  /** Extra query bag for rare params */
  extras: Record<string, string>;
};

function decodeMaybeUri(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return out;
  for (const part of q.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) {
      out[decodeMaybeUri(part)] = "";
      continue;
    }
    out[decodeMaybeUri(part.slice(0, eq))] = decodeMaybeUri(part.slice(eq + 1));
  }
  return out;
}

function splitUserHost(authority: string): {
  user: string;
  host: string;
  port: number;
} | null {
  const at = authority.lastIndexOf("@");
  if (at < 0) return null;
  const user = authority.slice(0, at);
  let hostPort = authority.slice(at + 1);
  let host: string;
  let portStr: string;
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    if (end < 0) return null;
    host = hostPort.slice(1, end);
    portStr = hostPort.slice(end + 1).replace(/^:/, "");
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon < 0) return null;
    host = hostPort.slice(0, colon);
    portStr = hostPort.slice(colon + 1);
  }
  const port = Number(portStr);
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  return { user, host, port };
}

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function parseAlpn(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function parseVless(uri: string): ProxyNode | null {
  const m = /^vless:\/\/([^#]+)(?:#(.*))?$/i.exec(uri);
  if (!m) return null;
  const [main, hash] = [m[1], m[2]];
  const qIdx = main.indexOf("?");
  const authority = qIdx >= 0 ? main.slice(0, qIdx) : main;
  const query = qIdx >= 0 ? parseQuery(main.slice(qIdx)) : {};
  const uh = splitUserHost(authority);
  if (!uh) return null;
  const security = (query.security || "").toLowerCase();
  const tls = security === "tls" || security === "reality";
  return {
    name: decodeMaybeUri(hash || `${uh.host}:${uh.port}`),
    type: "vless",
    server: uh.host,
    port: uh.port,
    uuid: uh.user,
    udp: true,
    tls,
    servername: query.sni || query.peer || query.servername,
    fingerprint: query.fp || query.fingerprint,
    alpn: parseAlpn(query.alpn),
    network: query.type || query.network || "tcp",
    flow: query.flow || undefined,
    realityPublicKey: query.pbk || undefined,
    realityShortId: query.sid || undefined,
    realitySpiderX: query.spx || undefined,
    insecure: truthy(query.insecure) || truthy(query.allowInsecure),
    raw: uri,
    extras: query,
  };
}

function parseTrojan(uri: string): ProxyNode | null {
  const m = /^trojan:\/\/([^#]+)(?:#(.*))?$/i.exec(uri);
  if (!m) return null;
  const [main, hash] = [m[1], m[2]];
  const qIdx = main.indexOf("?");
  const authority = qIdx >= 0 ? main.slice(0, qIdx) : main;
  const query = qIdx >= 0 ? parseQuery(main.slice(qIdx)) : {};
  const uh = splitUserHost(authority);
  if (!uh) return null;
  return {
    name: decodeMaybeUri(hash || `${uh.host}:${uh.port}`),
    type: "trojan",
    server: uh.host,
    port: uh.port,
    password: uh.user,
    udp: true,
    tls: true,
    servername: query.sni || query.peer,
    fingerprint: query.fp,
    alpn: parseAlpn(query.alpn),
    network: query.type || "tcp",
    insecure: truthy(query.insecure) || truthy(query.allowInsecure),
    raw: uri,
    extras: query,
  };
}

function parseHysteria2(uri: string): ProxyNode | null {
  const m = /^(?:hysteria2|hy2):\/\/([^#]+)(?:#(.*))?$/i.exec(uri);
  if (!m) return null;
  const [main, hash] = [m[1], m[2]];
  const qIdx = main.indexOf("?");
  const authority = qIdx >= 0 ? main.slice(0, qIdx) : main;
  const query = qIdx >= 0 ? parseQuery(main.slice(qIdx)) : {};
  const uh = splitUserHost(authority);
  if (!uh) return null;
  return {
    name: decodeMaybeUri(hash || `${uh.host}:${uh.port}`),
    type: "hysteria2",
    server: uh.host,
    port: uh.port,
    password: uh.user,
    udp: true,
    tls: true,
    servername: query.sni || query.peer,
    insecure: truthy(query.insecure) || truthy(query.allowInsecure),
    raw: uri,
    extras: query,
  };
}

function parseVmess(uri: string): ProxyNode | null {
  const m = /^vmess:\/\/(.+)$/i.exec(uri);
  if (!m) return null;
  let json: Record<string, unknown>;
  try {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    json = JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
  const host = String(json.add || json.host || "");
  const port = Number(json.port);
  const uuid = String(json.id || "");
  if (!host || !Number.isFinite(port) || !uuid) return null;
  const tlsFlag = String(json.tls || "").toLowerCase();
  return {
    name: String(json.ps || json.remark || `${host}:${port}`),
    type: "vmess",
    server: host,
    port,
    uuid,
    cipher: String(json.scy || json.security || "auto"),
    udp: true,
    tls: tlsFlag === "tls" || tlsFlag === "true" || tlsFlag === "1",
    servername: String(json.sni || json.host || "") || undefined,
    network: String(json.net || "tcp"),
    fingerprint: json.fp ? String(json.fp) : undefined,
    alpn: json.alpn ? parseAlpn(String(json.alpn)) : undefined,
    insecure: false,
    raw: uri,
    extras: {
      aid: String(json.aid ?? "0"),
      path: String(json.path || ""),
      host: String(json.host || ""),
      type: String(json.type || ""),
    },
  };
}

function parseSs(uri: string): ProxyNode | null {
  const m = /^ss:\/\/([^#]+)(?:#(.*))?$/i.exec(uri);
  if (!m) return null;
  const hash = m[2];
  let main = m[1];
  let method = "";
  let password = "";
  let host = "";
  let port = 0;

  if (main.includes("@")) {
    const at = main.lastIndexOf("@");
    const userInfo = main.slice(0, at);
    const hostPort = main.slice(at + 1);
    try {
      const decoded = Buffer.from(userInfo, "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon < 0) return null;
      method = decoded.slice(0, colon);
      password = decoded.slice(colon + 1);
    } catch {
      const colon = userInfo.indexOf(":");
      if (colon < 0) return null;
      method = decodeMaybeUri(userInfo.slice(0, colon));
      password = decodeMaybeUri(userInfo.slice(colon + 1));
    }
    const hp = splitUserHost(`x@${hostPort}`);
    if (!hp) return null;
    host = hp.host;
    port = hp.port;
  } else {
    try {
      const decoded = Buffer.from(main, "base64").toString("utf8");
      // method:password@host:port
      const at = decoded.lastIndexOf("@");
      if (at < 0) return null;
      const userInfo = decoded.slice(0, at);
      const hostPort = decoded.slice(at + 1);
      const colon = userInfo.indexOf(":");
      if (colon < 0) return null;
      method = userInfo.slice(0, colon);
      password = userInfo.slice(colon + 1);
      const hp = splitUserHost(`x@${hostPort}`);
      if (!hp) return null;
      host = hp.host;
      port = hp.port;
    } catch {
      return null;
    }
  }

  if (!method || !password || !host || !port) return null;
  return {
    name: decodeMaybeUri(hash || `${host}:${port}`),
    type: "ss",
    server: host,
    port,
    password,
    cipher: method,
    udp: true,
    raw: uri,
    extras: {},
  };
}

function parseTuic(uri: string): ProxyNode | null {
  const m = /^tuic:\/\/([^#]+)(?:#(.*))?$/i.exec(uri);
  if (!m) return null;
  const [main, hash] = [m[1], m[2]];
  const qIdx = main.indexOf("?");
  const authority = qIdx >= 0 ? main.slice(0, qIdx) : main;
  const query = qIdx >= 0 ? parseQuery(main.slice(qIdx)) : {};
  const uh = splitUserHost(authority);
  if (!uh) return null;
  // uuid:password@host:port or password as user
  let uuid = uh.user;
  let password = query.password || "";
  if (uh.user.includes(":")) {
    const colon = uh.user.indexOf(":");
    uuid = uh.user.slice(0, colon);
    password = uh.user.slice(colon + 1);
  }
  return {
    name: decodeMaybeUri(hash || `${uh.host}:${uh.port}`),
    type: "tuic",
    server: uh.host,
    port: uh.port,
    uuid,
    password,
    tls: true,
    servername: query.sni,
    alpn: parseAlpn(query.alpn),
    insecure: truthy(query.insecure) || truthy(query.allowInsecure),
    raw: uri,
    extras: query,
  };
}

export function parseShareUri(uri: string): ProxyNode | null {
  const trimmed = uri.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("vless://")) return parseVless(trimmed);
  if (lower.startsWith("vmess://")) return parseVmess(trimmed);
  if (lower.startsWith("trojan://")) return parseTrojan(trimmed);
  if (lower.startsWith("hysteria2://") || lower.startsWith("hy2://"))
    return parseHysteria2(trimmed);
  if (lower.startsWith("ss://")) return parseSs(trimmed);
  if (lower.startsWith("tuic://")) return parseTuic(trimmed);
  return null;
}

/** Decode upstream subscription body into share URIs. */
export function extractShareUris(body: string): string[] {
  const text = body.trim();
  if (!text) return [];

  // Already line-based share links
  if (/^(vless|vmess|trojan|hysteria2|hy2|ss|tuic):\/\//im.test(text)) {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^(vless|vmess|trojan|hysteria2|hy2|ss|tuic):\/\//i.test(l));
  }

  // Base64 blob
  try {
    const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64").toString(
      "utf8",
    );
    if (/^(vless|vmess|trojan|hysteria2|hy2|ss|tuic):\/\//im.test(decoded)) {
      return decoded
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) =>
          /^(vless|vmess|trojan|hysteria2|hy2|ss|tuic):\/\//i.test(l),
        );
    }
  } catch {
    /* ignore */
  }

  return [];
}

export function renameNode(node: ProxyNode, projectName: string): ProxyNode {
  const prefix = projectName.trim();
  if (!prefix) return node;
  const name = node.name.startsWith(prefix)
    ? node.name
    : `${prefix} | ${node.name}`;
  // Also rewrite fragment in raw URI when possible
  const hashIdx = node.raw.indexOf("#");
  const rawBase = hashIdx >= 0 ? node.raw.slice(0, hashIdx) : node.raw;
  const raw = `${rawBase}#${encodeURIComponent(name)}`;
  return { ...node, name, raw };
}

export function uniqueNames(nodes: ProxyNode[]): ProxyNode[] {
  const seen = new Map<string, number>();
  return nodes.map((n) => {
    const count = (seen.get(n.name) || 0) + 1;
    seen.set(n.name, count);
    if (count === 1) return n;
    const name = `${n.name} (${count})`;
    const hashIdx = n.raw.indexOf("#");
    const rawBase = hashIdx >= 0 ? n.raw.slice(0, hashIdx) : n.raw;
    return { ...n, name, raw: `${rawBase}#${encodeURIComponent(name)}` };
  });
}
