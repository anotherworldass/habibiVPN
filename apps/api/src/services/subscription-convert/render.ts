import type { ProxyNode } from "./parse.js";
import type { SubRenderKind } from "./formats.js";

function yamlQuote(s: string): string {
  // Do not allow ":" unquoted — IPv6 / host:port become nested mappings in libyaml.
  if (/^[\w.+\-/@]+$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) {
    return s;
  }
  return JSON.stringify(s);
}

function yamlList(indent: string, items: string[]): string {
  return items.map((i) => `${indent}- ${yamlQuote(i)}`).join("\n");
}

function clashProxy(node: ProxyNode): string {
  const lines: string[] = [
    `- name: ${yamlQuote(node.name)}`,
    `  type: ${node.type === "ss" ? "ss" : node.type}`,
    `  server: ${yamlQuote(node.server)}`,
    `  port: ${node.port}`,
  ];

  if (node.type === "vless") {
    lines.push(`  uuid: ${yamlQuote(node.uuid || "")}`);
    lines.push(`  udp: true`);
    if (node.flow) lines.push(`  flow: ${yamlQuote(node.flow)}`);
    if (node.tls) lines.push(`  tls: true`);
    if (node.servername) lines.push(`  servername: ${yamlQuote(node.servername)}`);
    if (node.fingerprint)
      lines.push(`  client-fingerprint: ${yamlQuote(node.fingerprint)}`);
    if (node.alpn?.length) {
      lines.push(`  alpn:`);
      for (const a of node.alpn) lines.push(`    - ${yamlQuote(a)}`);
    }
    if (node.network) lines.push(`  network: ${yamlQuote(node.network)}`);
    if (node.realityPublicKey) {
      lines.push(`  reality-opts:`);
      lines.push(`    public-key: ${yamlQuote(node.realityPublicKey)}`);
      if (node.realityShortId)
        lines.push(`    short-id: ${yamlQuote(node.realityShortId)}`);
    }
    if (node.insecure) lines.push(`  skip-cert-verify: true`);
  } else if (node.type === "vmess") {
    lines.push(`  uuid: ${yamlQuote(node.uuid || "")}`);
    lines.push(`  alterId: ${Number(node.extras.aid || 0)}`);
    lines.push(`  cipher: ${yamlQuote(node.cipher || "auto")}`);
    lines.push(`  udp: true`);
    if (node.tls) lines.push(`  tls: true`);
    if (node.servername) lines.push(`  servername: ${yamlQuote(node.servername)}`);
    if (node.network) lines.push(`  network: ${yamlQuote(node.network)}`);
    if (node.fingerprint)
      lines.push(`  client-fingerprint: ${yamlQuote(node.fingerprint)}`);
    if (node.extras.path || node.extras.host) {
      lines.push(`  ws-opts:`);
      if (node.extras.path)
        lines.push(`    path: ${yamlQuote(node.extras.path)}`);
      if (node.extras.host) {
        lines.push(`    headers:`);
        lines.push(`      Host: ${yamlQuote(node.extras.host)}`);
      }
    }
  } else if (node.type === "trojan") {
    lines.push(`  password: ${yamlQuote(node.password || "")}`);
    lines.push(`  udp: true`);
    if (node.servername) lines.push(`  sni: ${yamlQuote(node.servername)}`);
    if (node.fingerprint)
      lines.push(`  client-fingerprint: ${yamlQuote(node.fingerprint)}`);
    if (node.alpn?.length) {
      lines.push(`  alpn:`);
      for (const a of node.alpn) lines.push(`    - ${yamlQuote(a)}`);
    }
    if (node.insecure) lines.push(`  skip-cert-verify: true`);
  } else if (node.type === "hysteria2") {
    lines.push(`  password: ${yamlQuote(node.password || "")}`);
    if (node.servername) lines.push(`  sni: ${yamlQuote(node.servername)}`);
    if (node.insecure) lines.push(`  skip-cert-verify: true`);
  } else if (node.type === "ss") {
    lines.push(`  cipher: ${yamlQuote(node.cipher || "aes-128-gcm")}`);
    lines.push(`  password: ${yamlQuote(node.password || "")}`);
    lines.push(`  udp: true`);
  } else if (node.type === "tuic") {
    lines.push(`  uuid: ${yamlQuote(node.uuid || "")}`);
    lines.push(`  password: ${yamlQuote(node.password || "")}`);
    if (node.servername) lines.push(`  sni: ${yamlQuote(node.servername)}`);
    if (node.alpn?.length) {
      lines.push(`  alpn:`);
      for (const a of node.alpn) lines.push(`    - ${yamlQuote(a)}`);
    }
    if (node.insecure) lines.push(`  skip-cert-verify: true`);
  }

  return lines.join("\n");
}

export function renderClashYaml(nodes: ProxyNode[], profileName: string): string {
  const names = nodes.map((n) => n.name);
  const proxies = nodes.map(clashProxy).join("\n");
  return [
    `# ${profileName}`,
    `mixed-port: 7890`,
    `allow-lan: false`,
    `mode: rule`,
    `log-level: info`,
    `ipv6: true`,
    ``,
    `proxies:`,
    proxies || `# (empty)`,
    ``,
    `proxy-groups:`,
    `- name: ${yamlQuote(profileName)}`,
    `  type: select`,
    `  proxies:`,
    names.length ? yamlList("    ", names) : `    - DIRECT`,
    `- name: ${yamlQuote(`${profileName}-Auto`)}`,
    `  type: url-test`,
    `  url: http://www.gstatic.com/generate_204`,
    `  interval: 300`,
    `  proxies:`,
    names.length ? yamlList("    ", names) : `    - DIRECT`,
    ``,
    `rules:`,
    `- ${yamlQuote(`MATCH,${profileName}`)}`,
    ``,
  ].join("\n");
}

function surgeProxy(node: ProxyNode): string | null {
  // Surge has limited native support; emit what we can.
  if (node.type === "ss") {
    return `${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${node.cipher || "aes-128-gcm"}, password=${node.password || ""}${node.udp === false ? "" : ", udp-relay=true"}`;
  }
  if (node.type === "trojan") {
    const parts = [
      `${node.name} = trojan, ${node.server}, ${node.port}, password=${node.password || ""}`,
    ];
    if (node.servername) parts.push(`sni=${node.servername}`);
    if (node.insecure) parts.push(`skip-cert-verify=true`);
    return parts.join(", ");
  }
  if (node.type === "vmess") {
    const parts = [
      `${node.name} = vmess, ${node.server}, ${node.port}, username=${node.uuid || ""}`,
    ];
    if (node.tls) parts.push(`tls=true`);
    if (node.servername) parts.push(`sni=${node.servername}`);
    if (node.network === "ws") {
      parts.push(`ws=true`);
      if (node.extras.path) parts.push(`ws-path=${node.extras.path}`);
      if (node.extras.host) parts.push(`ws-headers=Host:${node.extras.host}`);
    }
    return parts.join(", ");
  }
  if (node.type === "hysteria2") {
    const parts = [
      `${node.name} = hysteria2, ${node.server}, ${node.port}, password=${node.password || ""}`,
    ];
    if (node.servername) parts.push(`sni=${node.servername}`);
    if (node.insecure) parts.push(`skip-cert-verify=true`);
    return parts.join(", ");
  }
  // vless / tuic: Surge may not support; keep as external comment via skip
  return null;
}

export function renderSurgeProfile(
  nodes: ProxyNode[],
  profileName: string,
): string {
  const lines = nodes.map(surgeProxy).filter(Boolean) as string[];
  // Fallback: include unsupported as managed list note — still emit group with available
  const names = lines.map((l) => l.split(" = ")[0]!);
  const groupProxies = names.length ? names.join(", ") : "DIRECT";
  return [
    `#!MANAGED-CONFIG ${profileName}`,
    ``,
    `[General]`,
    `loglevel = notify`,
    `bypass-system = true`,
    `skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local`,
    `dns-server = system`,
    ``,
    `[Proxy]`,
    ...lines,
    ``,
    `[Proxy Group]`,
    `${profileName} = select, ${groupProxies}`,
    ``,
    `[Rule]`,
    `FINAL,${profileName}`,
    ``,
  ].join("\n");
}

function qxLine(node: ProxyNode): string | null {
  if (node.type === "ss") {
    return `shadowsocks=${node.server}:${node.port}, method=${node.cipher || "aes-128-gcm"}, password=${node.password || ""}, tag=${node.name}`;
  }
  if (node.type === "vmess") {
    const parts = [
      `vmess=${node.server}:${node.port}`,
      `method=${node.cipher || "auto"}`,
      `password=${node.uuid || ""}`,
    ];
    if (node.tls) parts.push("obfs=wss");
    else if (node.network === "ws") parts.push("obfs=ws");
    if (node.extras.path) parts.push(`obfs-uri=${node.extras.path}`);
    if (node.extras.host || node.servername)
      parts.push(`obfs-host=${node.extras.host || node.servername}`);
    parts.push(`tag=${node.name}`);
    return parts.join(", ");
  }
  if (node.type === "trojan") {
    const parts = [
      `trojan=${node.server}:${node.port}`,
      `password=${node.password || ""}`,
      `over-tls=true`,
    ];
    if (node.servername) parts.push(`tls-host=${node.servername}`);
    if (node.insecure) parts.push("tls-verification=false");
    parts.push(`tag=${node.name}`);
    return parts.join(", ");
  }
  if (node.type === "vless") {
    // QX limited; emit as raw uri comment-friendly fallback via http remote style
    // Prefer trojan-like if not reality — otherwise skip (client may use base64 sub)
    return null;
  }
  return null;
}

export function renderQuantumultX(
  nodes: ProxyNode[],
  profileName: string,
): string {
  const lines = nodes.map(qxLine).filter(Boolean) as string[];
  // Also append share URIs as fallback remarks for unsupported types
  const unsupported = nodes.filter((n) => !qxLine(n));
  const uriFallback = unsupported.map((n) => n.raw);
  return [
    `# ${profileName}`,
    ...lines,
    ...uriFallback,
    ``,
  ].join("\n");
}

export function renderBase64(
  nodes: ProxyNode[],
  profileName?: string,
  meta?: SubRenderMeta,
): string {
  const title = profileName?.trim();
  const head: string[] = [];
  if (title) {
    head.push(
      `#profile-title: base64:${Buffer.from(title, "utf8").toString("base64")}`,
    );
    head.push(`#profile-update-interval: 24`);
  }
  const prefix = head.length ? `${head.join("\n")}\n` : "";
  const body = prefix + nodes.map((n) => n.raw).join("\n");
  return Buffer.from(body, "utf8").toString("base64");
}

/**
 * Whole body must be valid Base64. Shadowrocket rejects a plaintext prefix
 * ("无法获取订阅节点"). STATUS=/REMARKS= go on the first decoded lines,
 * same as common Chinese panels.
 */
export function renderShadowrocket(
  nodes: ProxyNode[],
  profileName: string,
  meta?: SubRenderMeta,
): string {
  const status = meta?.statusLine?.replace(/[\r\n]+/g, " ").trim() || "";
  const remarks = profileName.replace(/[\r\n]+/g, " ").trim();
  const lines: string[] = [];
  if (status) lines.push(status);
  if (remarks) lines.push(`REMARKS=${remarks}`);
  lines.push(...nodes.map((n) => n.raw));
  return Buffer.from(lines.join("\n"), "utf8").toString("base64");
}

export type SubRenderMeta = {
  userinfo?: string | null;
  announce?: string | null;
  /** Shadowrocket: first decoded line, e.g. STATUS=⬆️:0B,⏬:1GB,剩余:10GB,过期:2026-09-04 */
  statusLine?: string | null;
};

/** Body-level comments Hiddify reads when CDNs/proxies strip HTTP headers. */
export function renderHiddifyPreamble(
  profileName: string,
  meta?: SubRenderMeta,
): string {
  const title = profileName.trim();
  const lines = [
    `#profile-title: base64:${Buffer.from(title || "VPN", "utf8").toString("base64")}`,
    `#profile-update-interval: 24`,
  ];
  if (meta?.userinfo?.trim()) {
    lines.push(`#subscription-userinfo: ${meta.userinfo.trim()}`);
  }
  if (meta?.announce?.trim()) {
    lines.push(
      `#announce: base64:${Buffer.from(meta.announce.trim(), "utf8").toString("base64")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderHiddifyYaml(
  nodes: ProxyNode[],
  profileName: string,
  meta?: SubRenderMeta,
): string {
  return renderHiddifyPreamble(profileName, meta) + renderClashYaml(nodes, profileName);
}

export function renderSubscription(
  kind: SubRenderKind,
  nodes: ProxyNode[],
  profileName: string,
  meta?: SubRenderMeta,
): { body: string; contentType: string; filename: string } {
  switch (kind) {
    case "clash":
      return {
        body: renderClashYaml(nodes, profileName),
        contentType: "text/yaml; charset=utf-8",
        filename: `${sanitizeFilename(profileName)}.yaml`,
      };
    case "hiddify":
      return {
        body: renderHiddifyYaml(nodes, profileName, meta),
        contentType: "text/yaml; charset=utf-8",
        filename: `${sanitizeFilename(profileName)}.yaml`,
      };
    case "surge":
      return {
        body: renderSurgeProfile(nodes, profileName),
        contentType: "text/plain; charset=utf-8",
        filename: `${sanitizeFilename(profileName)}.conf`,
      };
    case "quantumult_x":
      return {
        body: renderQuantumultX(nodes, profileName),
        contentType: "text/plain; charset=utf-8",
        filename: `${sanitizeFilename(profileName)}.txt`,
      };
    case "shadowrocket":
      return {
        body: renderShadowrocket(nodes, profileName, meta),
        contentType: "text/plain; charset=utf-8",
        filename: `${sanitizeFilename(profileName)}.txt`,
      };
    default:
      return {
        body: renderBase64(nodes, profileName, meta),
        contentType: "text/plain; charset=utf-8",
        filename: `${sanitizeFilename(profileName)}.txt`,
      };
  }
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fff]+/g, "_").slice(0, 64);
  return cleaned || "subscription";
}
