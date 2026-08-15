import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { writeAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { sendMailWithSesConfig } from "../services/mail/ses.js";
import { probeStorageS3Profile } from "../services/storage/s3-probe.js";
import {
  DEFAULT_MAIL_RATE_LIMIT_VALUE,
  DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE,
  DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE,
  SETTING_KEYS,
  STORAGE_S3_ROLES,
  SUBSCRIPTION_NOTICE_CLIENTS,
  SUBSCRIPTION_NOTICE_ITEM_MAX,
  SUBSCRIPTION_NOTICE_ITEMS_MAX,
  SUPPORT_CLIENT_MESSAGE_WINDOW_MAX,
  SUPPORT_CLIENT_MESSAGE_WINDOW_MIN,
  authEmailValueSchema,
  createStorageS3Profile,
  deleteStorageS3Profile,
  getAuthEmailConfig,
  getMailRateLimitConfig,
  getMailSesConfig,
  getSubscriptionNoticeConfig,
  getSubscriptionNodeNameConfig,
  getSupportClientMessageWindowConfig,
  listStorageS3ProfilesPublic,
  mailRateLimitValueSchema,
  mergeMailSesValue,
  primeMailRateLimitCache,
  primeSubscriptionNoticeCache,
  primeSubscriptionNodeNameCache,
  primeSupportClientMessageWindowCache,
  SUBSCRIPTION_NODE_NAME_MODES,
  subscriptionNoticeClientBlockSchema,
  subscriptionNoticeValueSchema,
  subscriptionNodeNameValueSchema,
  supportClientMessageWindowValueSchema,
  updateStorageS3Bindings,
  updateStorageS3Profile,
  upsertProjectSetting,
  type StorageS3BindingsPatch,
} from "../services/system-settings.js";

const mailSesPatch = z.object({
  enabled: z.boolean(),
  region: z.string().min(1).max(64),
  accessKeyId: z.string().min(1).max(128),
  secretAccessKey: z.string().max(256).optional(),
  fromEmail: z.string().email().max(320),
  fromName: z.string().max(128).nullable().optional(),
  configurationSet: z.string().max(128).nullable().optional(),
  remark: z.string().max(255).nullable().optional(),
});

const testMailBody = z.object({
  to: z.string().email().max(320),
});

const authEmailPatch = z.object({
  enabled: z.boolean(),
  allowSoftBindWithoutCode: z.boolean(),
  allowUnverifiedPasswordLogin: z.boolean(),
  allowClaimUnverifiedEmail: z.boolean(),
  remark: z.string().max(255).nullable().optional(),
});

const mailRateLimitPatch = z.object({
  enabled: z.boolean(),
  emailCooldownSeconds: z.number().int().min(0).max(3600),
  emailPerHour: z.number().int().min(1).max(100),
  ipPerMinute: z.number().int().min(1).max(1000),
  ipPerHour: z.number().int().min(1).max(10_000),
  projectPerMinute: z.number().int().min(1).max(10_000),
  remark: z.string().max(255).nullable().optional(),
});

const supportClientMessageWindowPatch = z.object({
  enabled: z.boolean(),
  messageWindowSize: z
    .number()
    .int()
    .min(SUPPORT_CLIENT_MESSAGE_WINDOW_MIN)
    .max(SUPPORT_CLIENT_MESSAGE_WINDOW_MAX),
  remark: z.string().max(255).nullable().optional(),
});

const subscriptionNoticePatch = z.object({
  by_client: z.object({
    shadowrocket: subscriptionNoticeClientBlockSchema,
    clash: subscriptionNoticeClientBlockSchema,
    hiddify: subscriptionNoticeClientBlockSchema,
    v2ray: subscriptionNoticeClientBlockSchema,
    surge: subscriptionNoticeClientBlockSchema,
    quantumult_x: subscriptionNoticeClientBlockSchema,
  }),
  remark: z.string().max(255).nullable().optional(),
});

const subscriptionNodeNamePatch = z.object({
  mode: z.enum(SUBSCRIPTION_NODE_NAME_MODES),
  remark: z.string().max(255).nullable().optional(),
});

const storageS3ProfileBody = z.object({
  name: z.string().min(1).max(64),
  enabled: z.boolean(),
  region: z.string().min(1).max(64),
  bucket: z.string().min(1).max(128),
  accessKeyId: z.string().min(1).max(128),
  secretAccessKey: z.string().max(256).optional(),
  publicBaseUrl: z.string().url().max(500),
  endpoint: z.string().url().max(500).nullable().optional(),
  forcePathStyle: z.boolean().optional(),
  keyPrefix: z.string().max(200).nullable().optional(),
  remark: z.string().max(255).nullable().optional(),
});

const storageS3IdList = z
  .union([
    z.array(z.string().min(1).max(64)).max(20),
    z.string().min(1).max(64),
    z.null(),
  ])
  .optional();

const storageS3BindingsBody = z.object({
  support: z.string().min(1).max(64).nullable().optional(),
  /** Multi-select: fan-out app package uploads. */
  app_dist: storageS3IdList,
  /** Multi-select: fan-out config publish. */
  config: storageS3IdList,
});

const storageS3ProbeBody = z.object({
  /** Also GET publicBaseUrl; default true. */
  checkPublic: z.boolean().optional(),
});

export const adminSettingsRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/settings`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/mail/ses`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getMailSesConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.MAIL_SES,
        enabled: cfg.enabled,
        remark: cfg.remark,
        ...cfg.publicValue,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/mail/ses`, async (req, reply) => {
    const parsed = mailSesPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const existing = await getMailSesConfig(projectId);
      const value = mergeMailSesValue(existing.value ?? {}, parsed.data);
      const row = await upsertProjectSetting({
        projectId,
        key: SETTING_KEYS.MAIL_SES,
        value,
        enabled: parsed.data.enabled,
        remark: parsed.data.remark ?? null,
      });

      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.mail_ses.upsert",
        targetType: "project",
        targetId: projectId,
        meta: {
          enabled: row.enabled,
          region: value.region,
          fromEmail: value.fromEmail,
        },
      });

      const cfg = await getMailSesConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.MAIL_SES,
        enabled: cfg.enabled,
        remark: cfg.remark,
        ...cfg.publicValue,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
        ...(typeof err === "object" &&
        err &&
        "details" in err
          ? { details: (err as { details: unknown }).details }
          : {}),
      });
    }
  });

  app.get(`${prefix}/auth/email`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getAuthEmailConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.AUTH_EMAIL,
        enabled: cfg.enabled,
        remark: cfg.remark,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/auth/email`, async (req, reply) => {
    const parsed = authEmailPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const value = authEmailValueSchema.parse({
        allowSoftBindWithoutCode: parsed.data.allowSoftBindWithoutCode,
        allowUnverifiedPasswordLogin: parsed.data.allowUnverifiedPasswordLogin,
        allowClaimUnverifiedEmail: parsed.data.allowClaimUnverifiedEmail,
      });
      const row = await upsertProjectSetting({
        projectId,
        key: SETTING_KEYS.AUTH_EMAIL,
        value,
        enabled: parsed.data.enabled,
        remark: parsed.data.remark ?? null,
      });

      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.auth_email.upsert",
        targetType: "project",
        targetId: projectId,
        meta: {
          enabled: row.enabled,
          ...value,
        },
      });

      const cfg = await getAuthEmailConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.AUTH_EMAIL,
        enabled: cfg.enabled,
        remark: cfg.remark,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/mail/rate-limit`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getMailRateLimitConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.MAIL_RATE_LIMIT,
        enabled: cfg.enabled,
        remark: cfg.remark,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/mail/rate-limit`, async (req, reply) => {
    const parsed = mailRateLimitPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const value = mailRateLimitValueSchema.parse({
        emailCooldownSeconds: parsed.data.emailCooldownSeconds,
        emailPerHour: parsed.data.emailPerHour,
        ipPerMinute: parsed.data.ipPerMinute,
        ipPerHour: parsed.data.ipPerHour,
        projectPerMinute: parsed.data.projectPerMinute,
      });
      const row = await upsertProjectSetting({
        projectId,
        key: SETTING_KEYS.MAIL_RATE_LIMIT,
        value,
        enabled: parsed.data.enabled,
        remark: parsed.data.remark ?? null,
      });

      // Hot-reload into this process; other instances pick up within soft TTL.
      primeMailRateLimitCache(
        projectId,
        parsed.data.enabled
          ? value
          : { ...DEFAULT_MAIL_RATE_LIMIT_VALUE },
      );

      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.mail_rate_limit.upsert",
        targetType: "project",
        targetId: projectId,
        meta: {
          enabled: row.enabled,
          ...value,
        },
      });

      const cfg = await getMailRateLimitConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.MAIL_RATE_LIMIT,
        enabled: cfg.enabled,
        remark: cfg.remark,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/support/client-message-window`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getSupportClientMessageWindowConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.SUPPORT_CLIENT_MESSAGE_WINDOW,
        enabled: cfg.enabled,
        remark: cfg.remark,
        min: SUPPORT_CLIENT_MESSAGE_WINDOW_MIN,
        max: SUPPORT_CLIENT_MESSAGE_WINDOW_MAX,
        default_size:
          DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE.messageWindowSize,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/support/client-message-window`, async (req, reply) => {
    const parsed = supportClientMessageWindowPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const value = supportClientMessageWindowValueSchema.parse({
        messageWindowSize: parsed.data.messageWindowSize,
      });
      const row = await upsertProjectSetting({
        projectId,
        key: SETTING_KEYS.SUPPORT_CLIENT_MESSAGE_WINDOW,
        value,
        enabled: parsed.data.enabled,
        remark: parsed.data.remark ?? null,
      });

      primeSupportClientMessageWindowCache(
        projectId,
        parsed.data.enabled
          ? value
          : { ...DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE },
      );

      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.support_client_message_window.upsert",
        targetType: "project",
        targetId: projectId,
        meta: {
          enabled: row.enabled,
          ...value,
        },
      });

      const cfg = await getSupportClientMessageWindowConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.SUPPORT_CLIENT_MESSAGE_WINDOW,
        enabled: cfg.enabled,
        remark: cfg.remark,
        min: SUPPORT_CLIENT_MESSAGE_WINDOW_MIN,
        max: SUPPORT_CLIENT_MESSAGE_WINDOW_MAX,
        default_size:
          DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE.messageWindowSize,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/subscription/notice`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getSubscriptionNoticeConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.SUBSCRIPTION_NOTICE,
        enabled: cfg.enabled,
        remark: cfg.remark,
        item_max: SUBSCRIPTION_NOTICE_ITEM_MAX,
        items_max: SUBSCRIPTION_NOTICE_ITEMS_MAX,
        available_clients: SUBSCRIPTION_NOTICE_CLIENTS,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/subscription/notice`, async (req, reply) => {
    const parsed = subscriptionNoticePatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const value = subscriptionNoticeValueSchema.parse({
        by_client: parsed.data.by_client,
      });
      const anyEnabled = SUBSCRIPTION_NOTICE_CLIENTS.some(
        (id) =>
          value.by_client[id].enabled && value.by_client[id].items.length > 0,
      );
      await upsertProjectSetting({
        projectId,
        key: SETTING_KEYS.SUBSCRIPTION_NOTICE,
        value,
        enabled: anyEnabled,
        remark: parsed.data.remark ?? null,
      });

      primeSubscriptionNoticeCache(projectId, value);

      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.subscription_notice.upsert",
        targetType: "project",
        targetId: projectId,
        meta: {
          enabled: anyEnabled,
          clients: SUBSCRIPTION_NOTICE_CLIENTS.filter(
            (id) => value.by_client[id].enabled,
          ),
        },
      });

      const cfg = await getSubscriptionNoticeConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.SUBSCRIPTION_NOTICE,
        enabled: cfg.enabled,
        remark: cfg.remark,
        item_max: SUBSCRIPTION_NOTICE_ITEM_MAX,
        items_max: SUBSCRIPTION_NOTICE_ITEMS_MAX,
        available_clients: SUBSCRIPTION_NOTICE_CLIENTS,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/subscription/node-name`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getSubscriptionNodeNameConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.SUBSCRIPTION_NODE_NAME,
        remark: cfg.remark,
        modes: SUBSCRIPTION_NODE_NAME_MODES,
        default_mode: DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE.mode,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/subscription/node-name`, async (req, reply) => {
    const parsed = subscriptionNodeNamePatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const value = subscriptionNodeNameValueSchema.parse({
        mode: parsed.data.mode,
      });
      await upsertProjectSetting({
        projectId,
        key: SETTING_KEYS.SUBSCRIPTION_NODE_NAME,
        value,
        enabled: true,
        remark: parsed.data.remark ?? null,
      });
      primeSubscriptionNodeNameCache(projectId, value);

      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.subscription_node_name.upsert",
        targetType: "project",
        targetId: projectId,
        meta: { mode: value.mode },
      });

      const cfg = await getSubscriptionNodeNameConfig(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.SUBSCRIPTION_NODE_NAME,
        remark: cfg.remark,
        modes: SUBSCRIPTION_NODE_NAME_MODES,
        default_mode: DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE.mode,
        ...cfg.value,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/storage/s3`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await listStorageS3ProfilesPublic(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.STORAGE_S3_PROFILES,
        roles: STORAGE_S3_ROLES,
        profiles: cfg.profiles,
        bindings: cfg.bindings,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(`${prefix}/storage/s3/profiles`, async (req, reply) => {
    const parsed = storageS3ProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const bundle = await createStorageS3Profile(projectId, parsed.data);
      const created = bundle.profiles[bundle.profiles.length - 1];
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.storage_s3.profile.create",
        targetType: "project",
        targetId: projectId,
        meta: {
          id: created?.id,
          name: created?.name,
          bucket: created?.bucket,
          publicBaseUrl: created?.publicBaseUrl,
        },
      });
      const cfg = await listStorageS3ProfilesPublic(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.STORAGE_S3_PROFILES,
        roles: STORAGE_S3_ROLES,
        profiles: cfg.profiles,
        bindings: cfg.bindings,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
        ...(typeof err === "object" && err && "details" in err
          ? { details: (err as { details: unknown }).details }
          : {}),
      });
    }
  });

  app.put(`${prefix}/storage/s3/profiles/:id`, async (req, reply) => {
    const id = z.string().min(1).max(64).safeParse((req.params as { id?: string }).id);
    if (!id.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    const parsed = storageS3ProfileBody.partial().extend({
      name: z.string().min(1).max(64).optional(),
      enabled: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const bundle = await updateStorageS3Profile(
        projectId,
        id.data,
        parsed.data,
      );
      const updated = bundle.profiles.find((p) => p.id === id.data);
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.storage_s3.profile.update",
        targetType: "project",
        targetId: projectId,
        meta: {
          id: updated?.id,
          name: updated?.name,
          enabled: updated?.enabled,
          bucket: updated?.bucket,
        },
      });
      const cfg = await listStorageS3ProfilesPublic(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.STORAGE_S3_PROFILES,
        roles: STORAGE_S3_ROLES,
        profiles: cfg.profiles,
        bindings: cfg.bindings,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
        ...(typeof err === "object" && err && "details" in err
          ? { details: (err as { details: unknown }).details }
          : {}),
      });
    }
  });

  app.delete(`${prefix}/storage/s3/profiles/:id`, async (req, reply) => {
    const id = z.string().min(1).max(64).safeParse((req.params as { id?: string }).id);
    if (!id.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      await deleteStorageS3Profile(projectId, id.data);
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.storage_s3.profile.delete",
        targetType: "project",
        targetId: projectId,
        meta: { id: id.data },
      });
      const cfg = await listStorageS3ProfilesPublic(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.STORAGE_S3_PROFILES,
        roles: STORAGE_S3_ROLES,
        profiles: cfg.profiles,
        bindings: cfg.bindings,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/storage/s3/bindings`, async (req, reply) => {
    const parsed = storageS3BindingsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      await updateStorageS3Bindings(
        projectId,
        parsed.data as StorageS3BindingsPatch,
      );
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.storage_s3.bindings.update",
        targetType: "project",
        targetId: projectId,
        meta: parsed.data,
      });
      const cfg = await listStorageS3ProfilesPublic(projectId);
      return {
        project_id: projectId,
        key: SETTING_KEYS.STORAGE_S3_PROFILES,
        roles: STORAGE_S3_ROLES,
        profiles: cfg.profiles,
        bindings: cfg.bindings,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /** Upload → Head → public GET → Delete probe for one profile. */
  app.post(`${prefix}/storage/s3/profiles/:id/test`, async (req, reply) => {
    const id = z
      .string()
      .min(1)
      .max(64)
      .safeParse((req.params as { id?: string }).id);
    if (!id.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    const parsed = storageS3ProbeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const result = await probeStorageS3Profile({
        projectId,
        profileId: id.data,
        checkPublic: parsed.data.checkPublic,
      });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.storage_s3.profile.test",
        targetType: "project",
        targetId: projectId,
        meta: {
          id: result.profile_id,
          name: result.profile_name,
          ok: result.ok,
          key: result.key,
          steps: result.steps.map((s) => ({
            step: s.step,
            ok: s.ok,
            ms: s.ms,
          })),
        },
      });
      // Always 200 when probe executed — UI reads steps[].ok for pass/fail.
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      const detail =
        (typeof err === "object" &&
          err &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string" &&
          (err as { message: string }).message.trim()) ||
        (err instanceof Error ? err.message : "internal_error");
      return reply.code(status).send({
        error: detail,
        code:
          err instanceof Error && err.message.startsWith("storage.")
            ? err.message
            : "storage.s3.probe_failed",
        message: detail,
      });
    }
  });

  /** Send a test email using saved project SES config. */
  app.post(`${prefix}/mail/ses/test`, async (req, reply) => {
    const parsed = testMailBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getMailSesConfig(projectId);
      if (!cfg.enabled || !cfg.value) {
        return reply.code(400).send({
          error: "请先保存并启用 Amazon SES 配置后再发送测试邮件",
          code: "mail.ses.not_configured",
          message: "请先保存并启用 Amazon SES 配置后再发送测试邮件",
        });
      }
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, code: true },
      });
      const brand =
        cfg.value.fromName?.trim() ||
        project?.name?.trim() ||
        project?.code ||
        projectId;
      const subject = `[${brand}] SES 测试邮件`;
      req.log.info({ projectId, brand, subject }, "mail.ses.test.send");
      const result = await sendMailWithSesConfig(cfg.value, {
        to: parsed.data.to,
        subject,
        text: `这是一封项目「${brand}」(${projectId}) 的 Amazon SES 测试邮件。若收到说明配置可用。`,
      });
      return { ok: true, message_id: result.messageId, subject };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 502;
      const detail = formatSesSendError(err);
      // Put human text in `error` so adminFetch always surfaces it.
      return reply.code(status).send({
        error: detail,
        code: "mail.send_failed",
        message: detail,
      });
    }
  });
};

function formatSesSendError(err: unknown): string {
  if (err == null) return "发送失败（未知错误）";
  if (typeof err === "string" && err.trim()) return err.trim();

  const parts: string[] = [];
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    const name =
      (typeof e.Code === "string" && e.Code) ||
      (typeof e.name === "string" && e.name !== "Error" ? e.name : "");
    const msg =
      typeof e.message === "string"
        ? e.message.trim()
        : typeof e.Message === "string"
          ? e.Message.trim()
          : "";
    const reason = typeof e.Reason === "string" ? e.Reason.trim() : "";
    if (name) parts.push(name);
    if (msg) parts.push(msg);
    if (reason && reason !== msg) parts.push(reason);
    if (e.cause instanceof Error && e.cause.message.trim()) {
      parts.push(e.cause.message.trim());
    }
  } else if (err instanceof Error && err.message.trim()) {
    parts.push(err.message.trim());
  }

  const uniq = [...new Set(parts.filter(Boolean))];
  if (uniq.length) return uniq.join(" — ");
  return "发送失败（无详细信息，请检查 Region / Access Key / 发件人是否已在 SES 验证）";
}
