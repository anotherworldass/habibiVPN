import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { User } from "@prisma/client";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signUserToken, verifyUserToken } from "../lib/user-jwt.js";
import {
  claimFreePlan,
  listUserSubscriptions,
  refreshUpstreamSubscriptionUrl,
  syncUpstreamSlot,
} from "../services/provision.js";
import { getPublicNodePool } from "../services/nodes.js";
import {
  bindCredentialsToUser,
  createAnonymousUser,
  createUserWithInvite,
  verifySoftBoundEmail,
} from "../services/referral/bind.js";
import { resolveSource, sourceHintsFromRequest } from "../services/project.js";
import {
  type ClientMetaInput,
  extractAuthContext,
  recordAuthEvent,
} from "../services/auth-events.js";
import {
  requestPasswordReset,
  resetPasswordWithCode,
} from "../services/password-reset.js";
import {
  consumeLoginEmailCode,
  consumeRegisterEmailCode,
  sendLoginEmailCode,
  sendRegisterEmailCode,
} from "../services/email-otp.js";
import { getAuthEmailPolicy } from "../services/system-settings.js";
import {
  assertBootstrapBurstLimit,
  assertBootstrapNewAccountAllowed,
  findAnonymousUserByDevice,
  readBootstrapContext,
  reuseAnonymousBootstrap,
} from "../services/bootstrap-guard.js";
import { writeAudit } from "../lib/audit.js";
import { WireRawError } from "../wireraw/client.js";

const clientMetaBody = z
  .object({
    timezone: z.string().max(64).optional(),
    locale: z.string().max(32).optional(),
    os_name: z.string().max(64).optional(),
    os_version: z.string().max(64).optional(),
    app_version: z.string().max(64).optional(),
    device_id: z.string().max(128).optional(),
    shell: z.string().max(64).optional(),
    platform: z.string().max(64).optional(),
  })
  .optional();

function localeFromRequest(req: FastifyRequest): string | null {
  const q = req.query as { locale?: string; lang?: string };
  return (
    q.locale ||
    q.lang ||
    (Array.isArray(req.headers["accept-language"])
      ? req.headers["accept-language"][0]
      : req.headers["accept-language"]) ||
    null
  );
}

/** `?live=1|true|yes` forces upstream sync; default is local cache + TTL background refresh. */
function parseLiveQuery(req: FastifyRequest): boolean {
  const q = req.query as { live?: string };
  return q.live === "1" || q.live === "true" || q.live === "yes";
}

const registerSendCodeBody = z.object({
  email: z.string().email(),
  /** Optional when Bearer user is soft-bound (reuse existing password hash). */
  password: z.string().min(6).max(72).optional(),
  invite_code: z.string().min(2).max(32).optional(),
  client_meta: clientMetaBody,
});

const registerBody = z.object({
  email: z.string().email(),
  /** Optional when verifying via OTP for an already soft-bound session. */
  password: z.string().min(6).max(72).optional(),
  /** 6-digit email verification code from /auth/register/send-code (optional for soft-bind). */
  code: z.string().min(4).max(12).optional(),
  invite_code: z.string().min(2).max(32).optional(),
  client_meta: clientMetaBody,
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  client_meta: clientMetaBody,
});

const loginSendCodeBody = z.object({
  email: z.string().email(),
  client_meta: clientMetaBody,
});

const loginCodeBody = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
  client_meta: clientMetaBody,
});

const bootstrapBody = z.object({
  invite_code: z.string().min(2).max(32).optional(),
  client_meta: clientMetaBody,
});

const changePasswordBody = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6).max(72),
});

const forgotPasswordBody = z.object({
  email: z.string().email(),
});

const resetPasswordBody = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
  new_password: z.string().min(6).max(72),
});

const patchMeBody = z.object({
  phone: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(/^\+?[0-9\-\s()]+$/)
    .nullable()
    .optional(),
});

const patchPreferencesBody = z
  .object({
    connect_mode: z.enum(["unset", "official_app", "subscription_client"]).optional(),
    connect_clients: z.array(z.string().min(1).max(32)).max(8).optional(),
    source: z
      .enum(["onboarding", "connect_page", "settings", "claim_prompt", "inferred"])
      .optional(),
  })
  .refine(
    (v) => v.connect_mode !== undefined || v.connect_clients !== undefined,
    { message: "preferences.empty" },
  );

function clientMetaFromBody(meta: ClientMetaInput | undefined) {
  return meta ?? null;
}

function publicAuthUser(user: User) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    email_verified: !!user.emailVerifiedAt,
    email_verified_at: user.emailVerifiedAt?.toISOString() ?? null,
    status: user.status,
    invite_code: user.inviteCode,
    invited_by_id: user.invitedById,
    is_anonymous: !user.email,
    project_id: user.projectId,
    source_site_id: user.sourceSiteId,
    source_package_id: user.sourcePackageId,
    source_client: user.sourceClient,
  };
}

async function loadPreferenceUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      connectMode: true,
      connectClients: true,
      connectPrefSource: true,
      connectPrefAt: true,
    },
  });
}

/** Optional Bearer — invalid/missing token returns null (web register stays open). */
async function tryUserFromAuth(req: FastifyRequest) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return await verifyUserToken(header.slice(7));
  } catch {
    return null;
  }
}

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (err instanceof WireRawError) {
    return reply.code(err.status).send({ error: err.code, upstream: err.body });
  }
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  /**
   * App first-open: create anonymous user + numeric uid + JWT.
   * Web continues to skip this and register/login as before.
   */
  app.post(`${USER_API_PREFIX}/auth/bootstrap`, async (req, reply) => {
    const parsed = bootstrapBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }

    const clientMeta = clientMetaFromBody(parsed.data.client_meta);

    // Already have a valid session — return current identity (idempotent for App relaunch)
    const existingAuth = await tryUserFromAuth(req);
    if (existingAuth) {
      const existing = await prisma.user.findUnique({ where: { id: existingAuth.sub } });
      if (existing && existing.status === "active") {
        const token = await signUserToken({ sub: existing.id, email: existing.email });
        return { token, user: publicAuthUser(existing) };
      }
    }

    try {
      const ctx = readBootstrapContext({ req, clientMeta });
      assertBootstrapBurstLimit({ ip: ctx.ip, deviceIdHash: ctx.deviceIdHash });

      // Same device → reuse existing anonymous identity (no new uid)
      if (ctx.deviceIdHash) {
        const prior = await findAnonymousUserByDevice(ctx.deviceIdHash);
        if (prior) {
          const user = await reuseAnonymousBootstrap({
            userId: prior.id,
            inviteCode: parsed.data.invite_code?.trim() || undefined,
          });
          const source = await resolveSource(sourceHintsFromRequest(req));
          void recordAuthEvent({
            userId: user.id,
            eventType: "anonymous_bootstrap",
            req,
            clientMeta,
            fallbackClient: source.sourceClient ?? user.sourceClient,
            meta: { project_id: user.projectId, reused: true },
          });
          const token = await signUserToken({ sub: user.id, email: user.email });
          return { token, user: publicAuthUser(user), reused: true };
        }
      }

      await assertBootstrapNewAccountAllowed(ctx.deviceIdHash);

      const source = await resolveSource(sourceHintsFromRequest(req));
      const user = await createAnonymousUser({
        inviteCode: parsed.data.invite_code?.trim() || undefined,
        source,
      });
      void recordAuthEvent({
        userId: user.id,
        eventType: "anonymous_bootstrap",
        req,
        clientMeta,
        fallbackClient: source.sourceClient,
        meta: { project_id: source.projectId, reused: false },
      });
      const token = await signUserToken({ sub: user.id, email: user.email });
      return { token, user: publicAuthUser(user), reused: false };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  /** Send register / bind-email verification code (does not create user yet). */
  app.post(`${USER_API_PREFIX}/auth/register/send-code`, async (req, reply) => {
    const parsed = registerSendCodeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const source = await resolveSource(sourceHintsFromRequest(req));
      const session = await tryUserFromAuth(req);
      let bindUserId: string | null = null;
      if (session) {
        const current = await prisma.user.findUnique({
          where: { id: session.sub },
          select: { id: true, email: true, emailVerifiedAt: true },
        });
        if (current?.emailVerifiedAt) {
          return reply.code(409).send({ error: "auth.already_registered" });
        }
        // Anonymous or soft-bound (unverified): OTP may bind / re-verify / change email.
        if (current) bindUserId = current.id;
      }
      const { ip } = extractAuthContext(req);
      return await sendRegisterEmailCode({
        projectId: source.projectId,
        email: parsed.data.email,
        password: parsed.data.password,
        inviteCode: parsed.data.invite_code?.trim() || null,
        bindUserId,
        ip,
      });
    } catch (err) {
      const retry =
        typeof err === "object" &&
        err &&
        "retryAfterSeconds" in err &&
        typeof (err as { retryAfterSeconds?: unknown }).retryAfterSeconds ===
          "number"
          ? (err as { retryAfterSeconds: number }).retryAfterSeconds
          : undefined;
      if (retry != null) {
        reply.header("Retry-After", String(retry));
      }
      return mapErr(err, reply);
    }
  });

  app.post(`${USER_API_PREFIX}/auth/register`, async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const code = parsed.data.code?.trim() || "";
    const source = await resolveSource(sourceHintsFromRequest(req));
    const authPolicy = await getAuthEmailPolicy(source.projectId);
    const clientMeta = clientMetaFromBody(parsed.data.client_meta);

    try {
      // Soft-bind: anonymous Bearer + no OTP → unverified email (policy-gated).
      // Also allows updating an existing unverified soft-bound email.
      if (!code) {
        if (!authPolicy.allowSoftBindWithoutCode) {
          return reply.code(400).send({ error: "auth.verify_code_required" });
        }
        const session = await tryUserFromAuth(req);
        if (!session) {
          return reply.code(400).send({ error: "auth.verify_code_required" });
        }
        const current = await prisma.user.findUnique({
          where: { id: session.sub },
        });
        if (!current || current.status !== "active") {
          return reply.code(404).send({ error: "user.not_found" });
        }
        if (current.emailVerifiedAt) {
          return reply.code(409).send({ error: "auth.already_registered" });
        }

        const password = parsed.data.password?.trim() || "";
        const inviteCode = parsed.data.invite_code?.trim() || undefined;

        // Update soft-bound email (and optional password) without OTP.
        if (current.email && !current.emailVerifiedAt) {
          const taken = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (taken && taken.id !== current.id) {
            return reply.code(409).send({ error: "auth.email_taken" });
          }
          if (password && password.length < 6) {
            return reply.code(400).send({ error: "validation.failed" });
          }
          const data: {
            email: string;
            passwordHash?: string;
          } = { email };
          if (password.length >= 6) {
            data.passwordHash = await hashPassword(password);
          }
          const user = await prisma.user.update({
            where: { id: current.id },
            data,
          });
          void recordAuthEvent({
            userId: user.id,
            eventType: "register_bind",
            req,
            clientMeta,
            fallbackClient: source.sourceClient ?? current.sourceClient,
            meta: {
              email,
              invite_code: inviteCode || null,
              project_id: source.projectId,
              email_verified: false,
              soft_bind_update: true,
            },
          });
          const token = await signUserToken({ sub: user.id, email: user.email });
          return { token, user: publicAuthUser(user) };
        }

        if (!password || password.length < 6) {
          return reply.code(400).send({ error: "validation.failed" });
        }
        const taken = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (taken) {
          return reply.code(409).send({ error: "auth.email_taken" });
        }
        const passwordHash = await hashPassword(password);
        const user = await bindCredentialsToUser({
          userId: current.id,
          email,
          passwordHash,
          inviteCode,
          emailVerifiedAt: null,
          claimUnverified: false,
        });
        void recordAuthEvent({
          userId: user.id,
          eventType: "register_bind",
          req,
          clientMeta,
          fallbackClient: source.sourceClient ?? current.sourceClient,
          meta: {
            email,
            invite_code: inviteCode || null,
            project_id: source.projectId,
            email_verified: false,
            soft_bind: true,
          },
        });
        const token = await signUserToken({ sub: user.id, email: user.email });
        return { token, user: publicAuthUser(user) };
      }

      const otpPayload = await consumeRegisterEmailCode({
        email,
        code,
        password: parsed.data.password,
      });
      const inviteCode =
        parsed.data.invite_code?.trim() ||
        otpPayload.inviteCode?.trim() ||
        undefined;
      const passwordHash = otpPayload.passwordHash;
      const verifiedAt = new Date();
      const claimUnverified = authPolicy.allowClaimUnverifiedEmail;

      // Prefer bind target from OTP payload (captured at send-code), else current Bearer.
      let bindUserId = otpPayload.bindUserId || null;
      if (!bindUserId) {
        const session = await tryUserFromAuth(req);
        if (session) {
          const current = await prisma.user.findUnique({
            where: { id: session.sub },
          });
          if (current?.email) {
            return reply.code(409).send({ error: "auth.already_registered" });
          }
          if (current && !current.email) bindUserId = current.id;
        }
      }

      if (bindUserId) {
        const current = await prisma.user.findUnique({ where: { id: bindUserId } });
        if (!current) {
          return reply.code(409).send({ error: "auth.already_registered" });
        }
        if (current.emailVerifiedAt) {
          return reply.code(409).send({ error: "auth.already_registered" });
        }
        // Same-user upgrade: soft-bound email → verified via OTP.
        if (current.email === email && !current.emailVerifiedAt) {
          const user = await verifySoftBoundEmail({
            userId: current.id,
            email,
            passwordHash,
          });
          void recordAuthEvent({
            userId: user.id,
            eventType: "register_bind",
            req,
            clientMeta,
            fallbackClient: source.sourceClient ?? current.sourceClient,
            meta: {
              email,
              invite_code: inviteCode || null,
              project_id: source.projectId,
              email_verified: true,
              verify_soft_bind: true,
            },
          });
          const token = await signUserToken({ sub: user.id, email: user.email });
          return { token, user: publicAuthUser(user) };
        }
        // Soft-bound user verifying a *different* email: clear old then bind verified.
        if (current.email && current.email !== email && !current.emailVerifiedAt) {
          await prisma.user.update({
            where: { id: current.id },
            data: { email: null, emailVerifiedAt: null },
          });
        } else if (current.email) {
          return reply.code(409).send({ error: "auth.already_registered" });
        }
        const user = await bindCredentialsToUser({
          userId: current.id,
          email,
          passwordHash,
          inviteCode,
          emailVerifiedAt: verifiedAt,
          claimUnverified,
        });
        void recordAuthEvent({
          userId: user.id,
          eventType: "register_bind",
          req,
          clientMeta,
          fallbackClient: source.sourceClient ?? current.sourceClient,
          meta: {
            email,
            invite_code: inviteCode || null,
            project_id: source.projectId,
            email_verified: true,
            email_changed: !!current.email && current.email !== email,
          },
        });
        const token = await signUserToken({ sub: user.id, email: user.email });
        return { token, user: publicAuthUser(user) };
      }

      const user = await createUserWithInvite({
        email,
        passwordHash,
        inviteCode,
        source,
        emailVerifiedAt: verifiedAt,
        claimUnverified,
      });
      void recordAuthEvent({
        userId: user.id,
        eventType: "register",
        req,
        clientMeta,
        fallbackClient: source.sourceClient,
        meta: {
          email,
          invite_code: inviteCode || null,
          project_id: source.projectId,
          email_verified: true,
        },
      });
      const token = await signUserToken({ sub: user.id, email: user.email });
      return { token, user: publicAuthUser(user) };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${USER_API_PREFIX}/auth/login`, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const clientMeta = clientMetaFromBody(parsed.data.client_meta);
    const source = await resolveSource(sourceHintsFromRequest(req));
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      void recordAuthEvent({
        userId: user?.id ?? null,
        eventType: "login_failed",
        success: false,
        failureReason: user ? "invalid_credentials" : "user_not_found",
        req,
        clientMeta,
        fallbackClient: source.sourceClient ?? user?.sourceClient ?? null,
        meta: { email, method: "password" },
      });
      return reply.code(401).send({ error: "auth.invalid_credentials" });
    }
    if (user.status !== "active") {
      void recordAuthEvent({
        userId: user.id,
        eventType: "login_failed",
        success: false,
        failureReason: "user_disabled",
        req,
        clientMeta,
        fallbackClient: source.sourceClient ?? user.sourceClient,
        meta: { email, method: "password" },
      });
      return reply.code(403).send({ error: "auth.user_disabled" });
    }
    if (!user.emailVerifiedAt) {
      const authPolicy = await getAuthEmailPolicy(
        user.projectId || source.projectId,
      );
      if (!authPolicy.allowUnverifiedPasswordLogin) {
        void recordAuthEvent({
          userId: user.id,
          eventType: "login_failed",
          success: false,
          failureReason: "email_unverified",
          req,
          clientMeta,
          fallbackClient: source.sourceClient ?? user.sourceClient,
          meta: { email, method: "password" },
        });
        return reply.code(403).send({ error: "auth.email_unverified" });
      }
    }
    void recordAuthEvent({
      userId: user.id,
      eventType: "login",
      req,
      clientMeta,
      fallbackClient: source.sourceClient ?? user.sourceClient,
      meta: { email, method: "password" },
    });
    const token = await signUserToken({ sub: user.id, email: user.email });
    return {
      token,
      user: publicAuthUser(user),
    };
  });

  /** Send login OTP (anti-enumeration; only verified emails receive mail). */
  app.post(`${USER_API_PREFIX}/auth/login/send-code`, async (req, reply) => {
    const parsed = loginSendCodeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const source = await resolveSource(sourceHintsFromRequest(req));
      const { ip } = extractAuthContext(req);
      return await sendLoginEmailCode({
        projectId: source.projectId,
        email: parsed.data.email,
        ip,
      });
    } catch (err) {
      const retry =
        typeof err === "object" &&
        err &&
        "retryAfterSeconds" in err &&
        typeof (err as { retryAfterSeconds?: unknown }).retryAfterSeconds ===
          "number"
          ? (err as { retryAfterSeconds: number }).retryAfterSeconds
          : undefined;
      if (retry != null) reply.header("Retry-After", String(retry));
      return mapErr(err, reply);
    }
  });

  /** Login with email OTP. */
  app.post(`${USER_API_PREFIX}/auth/login/code`, async (req, reply) => {
    const parsed = loginCodeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const clientMeta = clientMetaFromBody(parsed.data.client_meta);
    const source = await resolveSource(sourceHintsFromRequest(req));
    try {
      const { userId } = await consumeLoginEmailCode({
        email,
        code: parsed.data.code,
      });
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.email !== email || user.status !== "active") {
        void recordAuthEvent({
          userId: user?.id ?? null,
          eventType: "login_failed",
          success: false,
          failureReason: "verify_code_invalid",
          req,
          clientMeta,
          fallbackClient: source.sourceClient ?? user?.sourceClient ?? null,
          meta: { email, method: "email_code" },
        });
        return reply.code(400).send({ error: "auth.verify_code_invalid" });
      }
      void recordAuthEvent({
        userId: user.id,
        eventType: "login",
        req,
        clientMeta,
        fallbackClient: source.sourceClient ?? user.sourceClient,
        meta: { email, method: "email_code" },
      });
      const token = await signUserToken({ sub: user.id, email: user.email });
      return { token, user: publicAuthUser(user) };
    } catch (err) {
      void recordAuthEvent({
        userId: null,
        eventType: "login_failed",
        success: false,
        failureReason: "verify_code_invalid",
        req,
        clientMeta,
        fallbackClient: source.sourceClient,
        meta: { email, method: "email_code" },
      });
      return mapErr(err, reply);
    }
  });

  app.get(
    `${USER_API_PREFIX}/me`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        include: {
          upstreams: true,
          promoGroup: { select: { id: true, code: true, name: true } },
        },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      const { publicUserPreferences } = await import("../services/user-preferences.js");
      return {
        user: {
          ...publicAuthUser(user),
          phone: user.phone,
          promo_enabled: user.promoEnabled,
          promo_group: user.promoGroup
            ? {
                id: user.promoGroup.id,
                code: user.promoGroup.code,
                name: user.promoGroup.name,
              }
            : null,
          created_at: user.createdAt,
          subscription_count: user.upstreams.length,
          has_subscription: user.upstreams.length > 0,
          preferences: publicUserPreferences(user),
        },
      };
    },
  );

  /**
   * Cross-client usage preference (official app vs subscription clients).
   * Explicit sources overwrite; `inferred` only applies when still unset / previously inferred.
   */
  app.patch(
    `${USER_API_PREFIX}/me/preferences`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = patchPreferencesBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation.failed",
          details: parsed.error.flatten(),
        });
      }

      const {
        normalizePreferencePatch,
        publicUserPreferences,
        shouldApplyPreferenceWrite,
      } = await import("../services/user-preferences.js");

      const current = await loadPreferenceUser(req.user!.sub);
      if (!current) return reply.code(404).send({ error: "user.not_found" });

      const normalized = normalizePreferencePatch(parsed.data);
      if (
        !shouldApplyPreferenceWrite({
          currentMode: current.connectMode,
          currentSource: current.connectPrefSource,
          nextSource: normalized.connectPrefSource,
        })
      ) {
        return {
          skipped: true,
          reason: "preferences.inferred_ignored",
          preferences: publicUserPreferences(current),
        };
      }

      if (
        normalized.connectMode === undefined &&
        normalized.connectClients === undefined
      ) {
        return reply.code(400).send({ error: "validation.failed" });
      }

      const user = await prisma.user.update({
        where: { id: current.id },
        data: {
          ...(normalized.connectMode !== undefined
            ? { connectMode: normalized.connectMode }
            : {}),
          ...(normalized.connectClients !== undefined
            ? { connectClients: normalized.connectClients }
            : {}),
          connectPrefSource: normalized.connectPrefSource,
          connectPrefAt: new Date(),
        },
        select: {
          connectMode: true,
          connectClients: true,
          connectPrefSource: true,
          connectPrefAt: true,
        },
      });

      await writeAudit({
        actorType: "user",
        actorId: current.id,
        action: "user.preferences_updated",
        targetType: "user",
        targetId: current.id,
        meta: {
          connect_mode: user.connectMode,
          connect_clients: user.connectClients,
          source: user.connectPrefSource,
        },
      });

      return { preferences: publicUserPreferences(user) };
    },
  );

  app.patch(
    `${USER_API_PREFIX}/me`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = patchMeBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      if (parsed.data.phone === undefined) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      try {
        const phone =
          parsed.data.phone === null ? null : parsed.data.phone.replace(/\s+/g, "");
        if (phone) {
          const taken = await prisma.user.findFirst({
            where: { phone, id: { not: req.user!.sub } },
            select: { id: true },
          });
          if (taken) {
            return reply.code(409).send({ error: "auth.phone_taken" });
          }
        }
        const user = await prisma.user.update({
          where: { id: req.user!.sub },
          data: { phone },
        });
        await writeAudit({
          actorType: "user",
          actorId: user.id,
          action: "user.profile_updated",
          targetType: "user",
          targetId: user.id,
          meta: { phone: user.phone },
        });
        return { user: publicAuthUser(user) };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  app.post(
    `${USER_API_PREFIX}/auth/change-password`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = changePasswordBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      if (parsed.data.current_password === parsed.data.new_password) {
        return reply.code(400).send({ error: "auth.password_unchanged" });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      if (!user.email) {
        return reply.code(400).send({ error: "auth.anonymous_no_password" });
      }
      if (!(await verifyPassword(parsed.data.current_password, user.passwordHash))) {
        return reply.code(401).send({ error: "auth.invalid_credentials" });
      }
      const passwordHash = await hashPassword(parsed.data.new_password);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await writeAudit({
        actorType: "user",
        actorId: user.id,
        action: "auth.password_changed",
        targetType: "user",
        targetId: user.id,
      });
      return { ok: true };
    },
  );

  app.post(`${USER_API_PREFIX}/auth/forgot-password`, async (req, reply) => {
    const parsed = forgotPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const source = await resolveSource(sourceHintsFromRequest(req));
      const { ip } = extractAuthContext(req);
      return await requestPasswordReset(parsed.data.email, {
        projectId: source.projectId,
        ip,
      });
    } catch (err) {
      const retry =
        typeof err === "object" &&
        err &&
        "retryAfterSeconds" in err &&
        typeof (err as { retryAfterSeconds?: unknown }).retryAfterSeconds ===
          "number"
          ? (err as { retryAfterSeconds: number }).retryAfterSeconds
          : undefined;
      if (retry != null) reply.header("Retry-After", String(retry));
      return mapErr(err, reply);
    }
  });

  app.post(`${USER_API_PREFIX}/auth/reset-password`, async (req, reply) => {
    const parsed = resetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      return await resetPasswordWithCode({
        email: parsed.data.email,
        code: parsed.data.code,
        newPassword: parsed.data.new_password,
      });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  /** Public node pool summary (region / status / count) — no IPs or links */
  app.get(`${USER_API_PREFIX}/nodes`, async (_req, reply) => {
    try {
      return await getPublicNodePool();
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${USER_API_PREFIX}/plans`, async (req, reply) => {
    const q = req.query as { client?: string; locale?: string; lang?: string };
    try {
      const { parseClientChannel, listCatalogForClient } = await import(
        "../services/catalog.js"
      );
      const source = await resolveSource(sourceHintsFromRequest(req));
      const client = parseClientChannel(
        q.client || (req.headers["x-habibi-client"] as string | undefined) || source.sourceClient || "h5",
      );
      const locale = localeFromRequest(req);
      let claimedPlanIds = new Set<string>();
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) {
        try {
          const { verifyUserToken } = await import("../lib/user-jwt.js");
          const payload = await verifyUserToken(header.slice(7));
          const owned = await prisma.userUpstream.findMany({
            where: { userId: payload.sub, planId: { not: null } },
            select: { planId: true },
          });
          claimedPlanIds = new Set(
            owned.map((o) => o.planId).filter((id): id is string => !!id),
          );
        } catch {
          /* public list */
        }
      }

      const { plans, groups } = await listCatalogForClient({
        client,
        projectId: source.projectId,
        claimedPlanIds,
        locale,
      });
      return {
        client,
        project_id: source.projectId,
        project_code: source.projectCode,
        groups,
        plans,
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  /** List all package slots for current user */
  app.get(
    `${USER_API_PREFIX}/subscriptions`,
    { preHandler: [app.requireUser] },
    async (req) => {
      const locale = localeFromRequest(req);
      const live = parseLiveQuery(req);
      const subscriptions = await listUserSubscriptions(req.user!.sub, {
        mode: live ? "live" : "cached",
        locale,
      });
      return { subscriptions };
    },
  );

  /** Backward-compatible: first active subscription or none */
  app.get(
    `${USER_API_PREFIX}/subscription`,
    { preHandler: [app.requireUser] },
    async (req) => {
      const locale = localeFromRequest(req);
      const live = parseLiveQuery(req);
      const subscriptions = await listUserSubscriptions(req.user!.sub, {
        mode: live ? "live" : "cached",
        locale,
      });
      const active =
        subscriptions.find((s) => s.status === "active") || subscriptions[0] || null;
      if (!active) {
        return {
          status: "none",
          expires_at: null,
          used_traffic_bytes: null,
          data_limit_bytes: null,
          subscription_url: null,
          client_urls: null,
          online_ip_limit: null,
          next_plan_ref: null,
          subscriptions: [],
        };
      }
      return { ...active, subscriptions };
    },
  );

  app.get(
    `${USER_API_PREFIX}/subscriptions/:id`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const sub = await syncUpstreamSlot(
          req.user!.sub,
          id,
          localeFromRequest(req),
        );
        if (!sub) return reply.code(404).send({ error: "subscription.not_found" });
        return { subscription: sub };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  /** Free claim after register — creates a new upstream customer for this plan */
  app.post(
    `${USER_API_PREFIX}/subscriptions/claim`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = z.object({ plan_id: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      try {
        const result = await claimFreePlan(
          req.user!.sub,
          parsed.data.plan_id,
          localeFromRequest(req),
        );
        return {
          ok: true,
          subscription: result.subscription,
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  /**
   * Rotate subscription URL (WireRaw refresh).
   * Old link becomes invalid immediately; client must re-import.
   */
  app.post(
    `${USER_API_PREFIX}/subscriptions/:id/refresh-url`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await refreshUpstreamSubscriptionUrl(
          req.user!.sub,
          id,
          localeFromRequest(req),
        );
        return {
          ok: true,
          subscription: result.subscription,
          subscription_url_changed: result.subscription_url_changed,
          previous_subscription_url: result.previous_subscription_url,
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

};
