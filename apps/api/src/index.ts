import { buildApp } from "./app.js";
import { env } from "./config.js";
import { seedAdminIfNeeded } from "./lib/seed-admin.js";
import { seedReferralConfigIfNeeded } from "./services/referral/config.js";
import { startCommissionSettleJob } from "./services/referral/settle-job.js";

await seedAdminIfNeeded();
await seedReferralConfigIfNeeded();

const app = await buildApp();

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  startCommissionSettleJob(app.log);
  app.log.info(`Habibi API listening on http://${env.API_HOST}:${env.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
