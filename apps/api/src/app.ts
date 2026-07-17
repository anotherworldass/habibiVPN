import Fastify from "fastify";
import cors from "@fastify/cors";
import { corsOrigins } from "./config.js";
import adminAuthPlugin from "./plugins/admin-auth.js";
import userAuthPlugin from "./plugins/user-auth.js";
import { healthRoutes } from "./routes/health.js";
import { adminAuthRoutes } from "./routes/admin-auth.js";
import { adminPlansRoutes } from "./routes/admin-plans.js";
import { adminUsersRoutes } from "./routes/admin-users.js";
import { adminWirerawRoutes } from "./routes/admin-wireraw.js";
import { adminReferralRoutes } from "./routes/admin-referral.js";
import { userRoutes } from "./routes/user.js";
import { userReferralRoutes } from "./routes/user-referral.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  await app.register(adminAuthPlugin);
  await app.register(userAuthPlugin);
  await app.register(healthRoutes);
  await app.register(adminAuthRoutes);
  await app.register(adminPlansRoutes);
  await app.register(adminUsersRoutes);
  await app.register(adminWirerawRoutes);
  await app.register(adminReferralRoutes);
  await app.register(userRoutes);
  await app.register(userReferralRoutes);

  return app;
}
