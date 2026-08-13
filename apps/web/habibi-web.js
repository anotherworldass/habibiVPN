/**
 * Baota / PM2 entry for Next.js web.
 * Project name & start file: habibi-web.js
 * Run from: /www/wwwroot/habibiVPN/apps/web
 * Requires prior build: pnpm --filter @habibi/web build
 */
const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const dir = __dirname;
process.chdir(dir);

const buildId = path.join(dir, ".next", "BUILD_ID");
if (!existsSync(buildId)) {
  console.error(
    `[habibi-web] Missing ${buildId}. Build first:\n` +
      `  cd /www/wwwroot/habibiVPN && pnpm --filter @habibi/web build`,
  );
  process.exit(1);
}

let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [dir] });
} catch {
  console.error(
    `[habibi-web] next binary not found under ${dir}. Run pnpm install from repo root.`,
  );
  process.exit(1);
}

const port = String(process.env.PORT || process.env.WEB_PORT || 3000);
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
