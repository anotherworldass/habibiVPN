/**
 * Phase 0: verify WireRaw credentials & customer-plans.
 * Usage (from repo root): pnpm wireraw:smoke
 *
 * Respects WIRERAW_HTTP_PROXY via the shared WireRaw client.
 */
import { wireraw } from "../src/wireraw/client.js";
import { env } from "../src/config.js";

async function main() {
  console.log(`→ GET ${env.WIRERAW_HOST}/v1/proxy/customer-plans`);
  if (env.WIRERAW_HTTP_PROXY) {
    console.log(`  via proxy ${env.WIRERAW_HTTP_PROXY}`);
  } else {
    console.log("  direct (WIRERAW_HTTP_PROXY unset)");
  }

  const body = await wireraw.listCustomerPlans();
  console.log("← OK");
  console.log(JSON.stringify(body, null, 2));
  console.log("\nSmoke OK: credentials accepted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
