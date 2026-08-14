/**
 * Production entry for Telegram Mini App (Next.js).
 * Run from: apps/tg
 * Requires prior build: pnpm --filter @habibi/tg build
 */
const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const dir = __dirname;
process.chdir(dir);

const buildId = path.join(dir, ".next", "BUILD_ID");
if (!existsSync(buildId)) {
  console.error(
    `[habibi-tg] Missing ${buildId}. Build first:\n` +
      `  cd /www/wwwroot/habibiVPN && pnpm --filter @habibi/tg build`,
  );
  process.exit(1);
}

let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [dir] });
} catch {
  console.error(
    `[habibi-tg] next binary not found under ${dir}. Run pnpm install from repo root.`,
  );
  process.exit(1);
}

const port = String(process.env.PORT || process.env.TG_PORT || 3002);
const host = process.env.HOST || "0.0.0.0";

const child = spawn(
  process.execPath,
  [nextBin, "start", "-H", host, "-p", port],
  {
    cwd: dir,
    stdio: "inherit",
    env: process.env,
  },
);

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
