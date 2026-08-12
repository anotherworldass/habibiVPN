import { createHash, randomInt } from "node:crypto";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { hashPassword } from "../lib/password.js";
import {
  assertMailProjectSendAllowed,
  assertMailSendAttemptAllowed,
} from "./mail/rate-limit.js";
import { sendMailViaProjectSes } from "./mail/ses.js";

const TTL_MS = 15 * 60_000;
const CODE_LEN = 6;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function shouldReturnDevCode(): boolean {
  if (env.PASSWORD_RESET_DEV_RETURN_CODE != null) {
    return env.PASSWORD_RESET_DEV_RETURN_CODE;
  }
  return env.NODE_ENV !== "production";
}

function genCode(): string {
  const max = 10 ** CODE_LEN;
  return String(randomInt(0, max)).padStart(CODE_LEN, "0");
}

/**
 * Always returns ok (anti-enumeration). Sends code via project Amazon SES when configured.
 * In non-prod (or when flagged), also includes reset_code in the response.
 * Rate limits always apply (including non-existent emails) to stop SES / probe abuse.
 */
export async function requestPasswordReset(
  emailRaw: string,
  opts: { projectId: string; ip?: string | null },
): Promise<{
  ok: true;
  reset_code?: string;
  expires_in_seconds?: number;
}> {
  const email = emailRaw.trim().toLowerCase();
  const ratePolicy = await assertMailSendAttemptAllowed({
    projectId: opts.projectId,
    email,
    purpose: "password_reset",
    ip: opts.ip,
  });

  const user = await prisma.user.findUnique({ where: { email } });
  // Anti-enumeration: only send when email exists, active, and verified.
  if (!user || !user.email || user.status !== "active" || !user.emailVerifiedAt) {
    return { ok: true };
  }

  const code = genCode();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashCode(code),
      expiresAt,
    },
  });

  let mailSent = false;
  try {
    await assertMailProjectSendAllowed({
      projectId: user.projectId,
      policy: ratePolicy,
    });
    await sendMailViaProjectSes({
      projectId: user.projectId,
      to: email,
      subject: "Password reset code / 密码重置验证码",
      text: [
        `Your password reset code is: ${code}`,
        "",
        `你的密码重置验证码：${code}`,
        "",
        `Valid for ${Math.floor(TTL_MS / 60_000)} minutes. If you did not request this, ignore this email.`,
        `有效期 ${Math.floor(TTL_MS / 60_000)} 分钟。如非本人操作请忽略。`,
      ].join("\n"),
    });
    mailSent = true;
  } catch (err) {
    const codeName = err instanceof Error ? err.message : "";
    if (codeName === "auth.mail_rate_limited" || codeName === "auth.code_cooldown") {
      throw err;
    }
    // Keep anti-enumeration; ops rely on audit + SES config.
    mailSent = false;
  }

  await writeAudit({
    actorType: "user",
    actorId: user.id,
    action: "auth.password_reset_requested",
    targetType: "user",
    targetId: user.id,
    meta: {
      email,
      expires_at: expiresAt.toISOString(),
      mail_sent: mailSent,
    },
  });

  if (shouldReturnDevCode()) {
    return {
      ok: true,
      reset_code: code,
      expires_in_seconds: Math.floor(TTL_MS / 1000),
    };
  }
  return { ok: true };
}

export async function resetPasswordWithCode(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ ok: true }> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) {
    throw Object.assign(new Error("auth.reset_code_invalid"), { statusCode: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.email || user.status !== "active") {
    throw Object.assign(new Error("auth.reset_code_invalid"), { statusCode: 400 });
  }

  const token = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      tokenHash: hashCode(code),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!token) {
    throw Object.assign(new Error("auth.reset_code_invalid"), { statusCode: 400 });
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, id: { not: token.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  await writeAudit({
    actorType: "user",
    actorId: user.id,
    action: "auth.password_reset",
    targetType: "user",
    targetId: user.id,
  });

  return { ok: true };
}
