/**
 * Phase 0: verify WireRaw credentials & customer-plans.
 * Usage (from repo root): pnpm wireraw:smoke
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const host = (process.env.WIRERAW_HOST ?? "").replace(/\/$/, "");
const keyId = process.env.WIRERAW_KEY_ID ?? "";
const keySecret = process.env.WIRERAW_KEY_SECRET ?? "";

if (!host || !keyId || !keySecret) {
  console.error("Missing WIRERAW_HOST / WIRERAW_KEY_ID / WIRERAW_KEY_SECRET in .env");
  process.exit(1);
}

async function main() {
  console.log(`→ GET ${host}/v1/proxy/customer-plans`);
  const res = await fetch(`${host}/v1/proxy/customer-plans`, {
    headers: {
      "X-Wireraw-Key-ID": keyId,
      "X-Wireraw-Key-Secret": keySecret,
      Accept: "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }

  console.log(`← HTTP ${res.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok) {
    process.exit(1);
  }

  console.log("\nSmoke OK: credentials accepted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
