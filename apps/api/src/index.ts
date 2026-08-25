import { buildApp } from "./app.js";
import { env } from "./config.js";
import { seedAdminIfNeeded } from "./lib/seed-admin.js";
import { seedReferralConfigIfNeeded } from "./services/referral/config.js";
import { seedPromoGroupsIfNeeded } from "./services/referral/groups.js";
import { seedDefaultProjectIfNeeded } from "./services/project.js";
import { startCommissionSettleJob } from "./services/referral/settle-job.js";
import { startFupBandwidthJob } from "./services/fup-job.js";
import { startPendingOrderExpireJob } from "./services/payments-expire-job.js";
import { startTelegramBroadcastWorker } from "./services/telegram/broadcast-worker.js";
import { startNodeProbeJob } from "./services/node-probe/job.js";

await seedAdminIfNeeded();
await seedReferralConfigIfNeeded();
await seedPromoGroupsIfNeeded();
await seedDefaultProjectIfNeeded();

const app = await buildApp();

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  startCommissionSettleJob(app.log);
  startFupBandwidthJob(app.log);
  startPendingOrderExpireJob(app.log);
  startTelegramBroadcastWorker(app.log);
  startNodeProbeJob(app.log);
  app.log.info(`Habibi API listening on http://${env.API_HOST}:${env.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
