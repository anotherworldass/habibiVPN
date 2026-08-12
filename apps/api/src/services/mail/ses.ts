import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  getMailSesConfig,
  type MailSesValue,
} from "../system-settings.js";

export type SendMailInput = {
  projectId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function fromHeader(cfg: MailSesValue): string {
  const name = cfg.fromName?.trim();
  if (name) return `${name} <${cfg.fromEmail}>`;
  return cfg.fromEmail;
}

export async function sendMailViaProjectSes(
  input: SendMailInput,
): Promise<{ ok: true; messageId?: string }> {
  const { enabled, value } = await getMailSesConfig(input.projectId);
  if (!enabled || !value) {
    throw Object.assign(new Error("mail.ses.not_configured"), {
      statusCode: 503,
    });
  }

  const client = new SESv2Client({
    region: value.region,
    credentials: {
      accessKeyId: value.accessKeyId,
      secretAccessKey: value.secretAccessKey,
    },
  });

  const result = await client.send(
    new SendEmailCommand({
      FromEmailAddress: fromHeader(value),
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Charset: "UTF-8", Data: input.subject },
          Body: {
            Text: { Charset: "UTF-8", Data: input.text },
            ...(input.html
              ? { Html: { Charset: "UTF-8", Data: input.html } }
              : {}),
          },
        },
      },
      ...(value.configurationSet
        ? { ConfigurationSetName: value.configurationSet }
        : {}),
    }),
  );

  return { ok: true, messageId: result.MessageId };
}

/** Direct send with an already-loaded config (admin test mail). */
export async function sendMailWithSesConfig(
  cfg: MailSesValue,
  input: Omit<SendMailInput, "projectId">,
): Promise<{ ok: true; messageId?: string }> {
  const client = new SESv2Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  const result = await client.send(
    new SendEmailCommand({
      FromEmailAddress: fromHeader(cfg),
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Charset: "UTF-8", Data: input.subject },
          Body: {
            Text: { Charset: "UTF-8", Data: input.text },
          },
        },
      },
      ...(cfg.configurationSet
        ? { ConfigurationSetName: cfg.configurationSet }
        : {}),
    }),
  );

  return { ok: true, messageId: result.MessageId };
}
