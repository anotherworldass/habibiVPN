/**
 * Baota / PM2 entry for API.
 * Project name & start file: habibi-api.js
 * Run from: /www/wwwroot/habibiVPN/apps/api
 * Requires prior build: pnpm --filter @habibi/api build
 */
import { existsSync } from "node:fs";
import { chdir } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
chdir(root);

const entry = join(root, "dist", "index.js");
if (!existsSync(entry)) {
  console.error(
    `[habibi-api] Missing ${entry}. Build first:\n` +
      `  cd /www/wwwroot/habibiVPN && pnpm --filter @habibi/shared build && pnpm --filter @habibi/api run prisma:generate && pnpm --filter @habibi/api build`,
  );
  process.exit(1);
}

await import(entry);
