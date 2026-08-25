import net from "node:net";

export async function tcpConnectMs(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<{ ok: true; ms: number } | { ok: false; ms: null }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok ? { ok: true, ms: Date.now() - started } : { ok: false, ms: null });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}
