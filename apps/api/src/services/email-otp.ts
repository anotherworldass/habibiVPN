import { createHash, randomInt } from "node:crypto";
import type { EmailOtpPurpose, Prisma } from "@prisma/client";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { writeAudit } from "../lib/audit.js";
import {
  assertMailProjectSendAllowed,
  assertMailSendAttemptAllowed,
} from "./mail/rate-limit.js";
import { sendMailViaProjectSes } from "./mail/ses.js";
import { getAuthEmailPolicy } from "./system-settings.js";
import { listEmailHolders } from "./email-canonical.js";

const TTL_MS = 15 * 60_000;
const CODE_LEN = 6;

export type RegisterOtpPayload = {
  passwordHash: string;
  inviteCode?: string | null;
  bindUserId?: string | null;
};

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function genCode(): string {
  const max = 10 ** CODE_LEN;
  return String(randomInt(0, max)).padStart(CODE_LEN, "0");
}

export function shouldReturnDevEmailCode(): boolean {
  if (env.PASSWORD_RESET_DEV_RETURN_CODE != null) {
    return env.PASSWORD_RESET_DEV_RETURN_CODE;
  }
  return env.NODE_ENV !== "production";
}

function asRegisterPayload(raw: unknown): RegisterOtpPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.passwordHash !== "string" || !o.passwordHash) return null;
  return {
    passwordHash: o.passwordHash,
    inviteCode:
      typeof o.inviteCode === "string" && o.inviteCode.trim()
        ? o.inviteCode.trim()
        : null,
    bindUserId:
      typeof o.bindUserId === "string" && o.bindUserId.trim()
        ? o.bindUserId.trim()
        : null,
  };
}

export async function sendRegisterEmailCode(input: {
  projectId: string;
  email: string;
  /** Optional when re-verifying / changing an already soft-bound unverified email. */
  password?: string | null;
  inviteCode?: string | null;
  bindUserId?: string | null;
  ip?: string | null;
}): Promise<{
  ok: true;
  expires_in_seconds: number;
  verify_code?: string;
}> {
  const email = input.email.trim().toLowerCase();
  const authPolicy = await getAuthEmailPolicy(input.projectId);
  const holders = await listEmailHolders(
    prisma,
    email,
    authPolicy.blockGmailAliasVariants,
  );
  if (holders.some((h) => h.emailVerifiedAt)) {
    throw Object.assign(new Error("auth.email_taken"), { statusCode: 409 });
  }
  const other = holders.find((h) => h.id !== input.bindUserId);
  if (other && input.bindUserId) {
    throw Object.assign(new Error("auth.email_taken"), { statusCode: 409 });
  }

  let reusePasswordHash: string | null = null;

  if (input.bindUserId) {
    const bindUser = await prisma.user.findUnique({
      where: { id: input.bindUserId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        passwordHash: true,
        status: true,
      },
    });
    if (!bindUser || bindUser.status !== "active") {
      throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
    }
    if (bindUser.email) {
      if (bindUser.emailVerifiedAt) {
        throw Object.assign(new Error("auth.already_registered"), {
          statusCode: 409,
        });
      }
      // Soft-bound: allow re-verify same email, or change to another unverified address.
      reusePasswordHash = bindUser.passwordHash;
    }
  }

  const password = input.password?.trim() || "";
  let passwordHash: string;
  if (password.length >= 6) {
    passwordHash = await hashPassword(password);
  } else if (reusePasswordHash) {
    passwordHash = reusePasswordHash;
  } else {
    throw Object.assign(new Error("auth.password_required"), {
      statusCode: 400,
    });
  }

  const policy = await assertMailSendAttemptAllowed({
    projectId: input.projectId,
    email,
    purpose: "register",
    ip: input.ip,
  });

  const code = genCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const payload: RegisterOtpPayload = {
    passwordHash,
    inviteCode: input.inviteCode?.trim() || null,
    bindUserId: input.bindUserId || null,
  };

  await prisma.emailOtp.updateMany({
    where: {
      email,
      purpose: "register",
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  await prisma.emailOtp.create({
    data: {
      projectId: input.projectId,
      email,
      purpose: "register" satisfies EmailOtpPurpose,
      codeHash: hashCode(code),
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });

  await assertMailProjectSendAllowed({
    projectId: input.projectId,
    policy,
  });

  let mailSent = false;
  try {
    await sendMailViaProjectSes({
      projectId: input.projectId,
      to: email,
      subject: "Email verification code / 邮箱验证码",
      text: [
        `Your verification code is: ${code}`,
        "",
        `你的邮箱验证码：${code}`,
        "",
        `Valid for ${Math.floor(TTL_MS / 60_000)} minutes.`,
        `有效期 ${Math.floor(TTL_MS / 60_000)} 分钟。`,
      ].join("\n"),
    });
    mailSent = true;
  } catch {
    mailSent = false;
  }

  if (!mailSent && !shouldReturnDevEmailCode()) {
    throw Object.assign(new Error("mail.ses.not_configured"), {
      statusCode: 503,
    });
  }

  await writeAudit({
    actorType: "user",
    actorId: input.bindUserId || null,
    action: "auth.register_code_sent",
    targetType: "email",
    targetId: email,
    meta: {
      project_id: input.projectId,
      mail_sent: mailSent,
      expires_at: expiresAt.toISOString(),
    },
  });

  const out: {
    ok: true;
    expires_in_seconds: number;
    verify_code?: string;
  } = {
    ok: true,
    expires_in_seconds: Math.floor(TTL_MS / 1000),
  };
  if (shouldReturnDevEmailCode()) {
    out.verify_code = code;
  }
  return out;
}

export async function consumeRegisterEmailCode(input: {
  email: string;
  code: string;
  /** When omitted, OTP alone is enough (password already stored in OTP payload). */
  password?: string | null;
}): Promise<RegisterOtpPayload> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) {
    throw Object.assign(new Error("auth.verify_code_invalid"), {
      statusCode: 400,
    });
  }

  const otp = await prisma.emailOtp.findFirst({
    where: {
      email,
      purpose: "register",
      codeHash: hashCode(code),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    throw Object.assign(new Error("auth.verify_code_invalid"), {
      statusCode: 400,
    });
  }

  const payload = asRegisterPayload(otp.payload);
  if (!payload) {
    throw Object.assign(new Error("auth.verify_code_invalid"), {
      statusCode: 400,
    });
  }

  const password = input.password?.trim() || "";
  if (password) {
    const passwordOk = await verifyPassword(password, payload.passwordHash);
    if (!passwordOk) {
      throw Object.assign(new Error("auth.verify_code_invalid"), {
        statusCode: 400,
      });
    }
  }

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });
  await prisma.emailOtp.updateMany({
    where: {
      email,
      purpose: "register",
      usedAt: null,
      id: { not: otp.id },
    },
    data: { usedAt: new Date() },
  });

  return payload;
}

/**
 * Send login OTP. Always returns ok (anti-enumeration) unless cooldown / mail hard-fail in prod.
 * Mail is only sent when the email belongs to an active, verified user.
 */
export async function sendLoginEmailCode(input: {
  projectId: string;
  email: string;
  ip?: string | null;
}): Promise<{
  ok: true;
  expires_in_seconds: number;
  verify_code?: string;
}> {
  const email = input.email.trim().toLowerCase();
  const policy = await assertMailSendAttemptAllowed({
    projectId: input.projectId,
    email,
    purpose: "login",
    ip: input.ip,
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      projectId: true,
    },
  });

  const eligible =
    !!user &&
    !!user.email &&
    user.status === "active" &&
    !!user.emailVerifiedAt;

  const code = genCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const projectId = eligible ? user!.projectId : input.projectId;

  await prisma.emailOtp.updateMany({
    where: { email, purpose: "login", usedAt: null },
    data: { usedAt: new Date() },
  });

  if (eligible) {
    await prisma.emailOtp.create({
      data: {
        projectId,
        email,
        purpose: "login",
        codeHash: hashCode(code),
        payload: { userId: user!.id } as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    await assertMailProjectSendAllowed({ projectId, policy });

    let mailSent = false;
    try {
      await sendMailViaProjectSes({
        projectId,
        to: email,
        subject: "Login code / 登录验证码",
        text: [
          `Your login code is: ${code}`,
          "",
          `你的登录验证码：${code}`,
          "",
          `Valid for ${Math.floor(TTL_MS / 60_000)} minutes. If you did not request this, ignore this email.`,
          `有效期 ${Math.floor(TTL_MS / 60_000)} 分钟。如非本人操作请忽略。`,
        ].join("\n"),
      });
      mailSent = true;
    } catch {
      mailSent = false;
    }

    if (!mailSent && !shouldReturnDevEmailCode()) {
      throw Object.assign(new Error("mail.ses.not_configured"), {
        statusCode: 503,
      });
    }

    await writeAudit({
      actorType: "user",
      actorId: user!.id,
      action: "auth.login_code_sent",
      targetType: "user",
      targetId: user!.id,
      meta: {
        email,
        mail_sent: mailSent,
        expires_at: expiresAt.toISOString(),
      },
    });
  }

  const out: {
    ok: true;
    expires_in_seconds: number;
    verify_code?: string;
  } = {
    ok: true,
    expires_in_seconds: Math.floor(TTL_MS / 1000),
  };
  if (eligible && shouldReturnDevEmailCode()) {
    out.verify_code = code;
  }
  return out;
}

export async function consumeLoginEmailCode(input: {
  email: string;
  code: string;
}): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) {
    throw Object.assign(new Error("auth.verify_code_invalid"), {
      statusCode: 400,
    });
  }

  const otp = await prisma.emailOtp.findFirst({
    where: {
      email,
      purpose: "login",
      codeHash: hashCode(code),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    throw Object.assign(new Error("auth.verify_code_invalid"), {
      statusCode: 400,
    });
  }

  const payload =
    otp.payload && typeof otp.payload === "object" && !Array.isArray(otp.payload)
      ? (otp.payload as { userId?: unknown })
      : null;
  const userId =
    typeof payload?.userId === "string" ? payload.userId : null;
  if (!userId) {
    throw Object.assign(new Error("auth.verify_code_invalid"), {
      statusCode: 400,
    });
  }

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });
  await prisma.emailOtp.updateMany({
    where: {
      email,
      purpose: "login",
      usedAt: null,
      id: { not: otp.id },
    },
    data: { usedAt: new Date() },
  });

  return { userId };
}
