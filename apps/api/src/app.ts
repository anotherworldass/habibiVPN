import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { corsOrigins } from "./config.js";
import adminAuthPlugin from "./plugins/admin-auth.js";
import userAuthPlugin from "./plugins/user-auth.js";
import { healthRoutes } from "./routes/health.js";
import { adminAuthRoutes } from "./routes/admin-auth.js";
import { adminPlansRoutes } from "./routes/admin-plans.js";
import { adminPlanGroupsRoutes } from "./routes/admin-plan-groups.js";
import { adminProjectsRoutes } from "./routes/admin-projects.js";
import { adminUsersRoutes } from "./routes/admin-users.js";
import { adminWirerawRoutes } from "./routes/admin-wireraw.js";
import { adminReferralRoutes } from "./routes/admin-referral.js";
import { userRoutes } from "./routes/user.js";
import { userSubRoutes } from "./routes/user-sub.js";
import { userReferralRoutes } from "./routes/user-referral.js";
import { paymentRoutes } from "./routes/payments.js";
import { adminPaymentRoutes } from "./routes/admin-payments.js";
import { adminOrderRoutes } from "./routes/admin-orders.js";
import { adminEntitlementLedgerRoutes } from "./routes/admin-entitlement-ledger.js";
import { adminAuditRoutes } from "./routes/admin-audit.js";
import { adminOpsRoutes } from "./routes/admin-ops.js";
import { adminNodeProbeRoutes } from "./routes/admin-node-probe.js";
import { userStatusRoutes } from "./routes/user-status.js";
import { iapRoutes } from "./routes/iap.js";
import { adminCampaignRoutes } from "./routes/admin-campaigns.js";
import { userCampaignRoutes } from "./routes/user-campaigns.js";
import { adminRedeemRoutes } from "./routes/admin-redeem.js";
import { userRedeemRoutes } from "./routes/user-redeem.js";
import { adminCouponRoutes } from "./routes/admin-coupons.js";
import { userCouponRoutes } from "./routes/user-coupons.js";
import { userAppRoutes } from "./routes/user-app.js";
import { adminAnnouncementRoutes } from "./routes/admin-announcements.js";
import { userAnnouncementRoutes } from "./routes/user-announcements.js";
import { telegramRoutes } from "./routes/telegram.js";
import { adminTelegramRoutes } from "./routes/admin-telegram.js";
import { adminSettingsRoutes } from "./routes/admin-settings.js";
import { supportWebRoutes } from "./routes/support-web.js";
import { supportTelegramForwardRoutes } from "./routes/support-telegram-forward.js";
import { adminSupportRoutes } from "./routes/admin-support.js";
import { adminLlmRoutes } from "./routes/admin-llm.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(String(body))));
      } catch (error) {
        done(error as Error);
      }
    },
  );

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 512 * 1024 * 1024,
      files: 1,
      fields: 40,
    },
  });

  await app.register(adminAuthPlugin);
  await app.register(userAuthPlugin);
  await app.register(healthRoutes);
  await app.register(adminAuthRoutes);
  await app.register(adminPlansRoutes);
  await app.register(adminPlanGroupsRoutes);
  await app.register(adminProjectsRoutes);
  await app.register(adminUsersRoutes);
  await app.register(adminWirerawRoutes);
  await app.register(adminReferralRoutes);
  await app.register(adminPaymentRoutes);
  await app.register(adminSettingsRoutes);
  await app.register(adminLlmRoutes);
  await app.register(adminOrderRoutes);
  await app.register(adminEntitlementLedgerRoutes);
  await app.register(adminAuditRoutes);
  await app.register(adminOpsRoutes);
  await app.register(adminNodeProbeRoutes);
  await app.register(adminCampaignRoutes);
  await app.register(adminRedeemRoutes);
  await app.register(adminCouponRoutes);
  await app.register(adminAnnouncementRoutes);
  await app.register(userRoutes);
  await app.register(userStatusRoutes);
  await app.register(userSubRoutes);
  await app.register(userAppRoutes);
  await app.register(userAnnouncementRoutes);
  await app.register(userReferralRoutes);
  await app.register(userCampaignRoutes);
  await app.register(userRedeemRoutes);
  await app.register(userCouponRoutes);
  await app.register(paymentRoutes);
  await app.register(iapRoutes);
  await app.register(telegramRoutes);
  await app.register(adminTelegramRoutes);
  await app.register(supportWebRoutes);
  await app.register(supportTelegramForwardRoutes);
  await app.register(adminSupportRoutes);

  return app;
}
