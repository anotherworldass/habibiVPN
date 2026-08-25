import type { ProxyNode } from "../subscription-convert/parse.js";
import { renderClashProxyBlock } from "../subscription-convert/render.js";

export function renderProbeClashYaml(input: {
  nodes: ProxyNode[];
  mixedPort: number;
  controllerHost: string;
  secret: string;
}): string {
  const names = input.nodes.map((n) => n.name);
  const nameLines = names.length
    ? names.map((n) => `      - ${JSON.stringify(n)}`).join("\n")
    : `      - DIRECT`;
  const proxies = renderClashProxyBlock(input.nodes);
  return [
    `mixed-port: ${input.mixedPort}`,
    `bind-address: 127.0.0.1`,
    `allow-lan: false`,
    `mode: global`,
    `log-level: warning`,
    `ipv6: true`,
    `external-controller: ${input.controllerHost}`,
    `secret: ${JSON.stringify(input.secret)}`,
    ``,
    `proxies:`,
    proxies || `  # empty`,
    ``,
    `proxy-groups:`,
    `  - name: PROXY`,
    `    type: select`,
    `    proxies:`,
    nameLines,
    ``,
    `rules:`,
    `  - MATCH,PROXY`,
    ``,
  ].join("\n");
}
