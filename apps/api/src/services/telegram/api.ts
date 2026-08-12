type TgApiResult<T> = { ok: true; result: T } | { ok: false; description?: string; error_code?: number };

async function callBotApi<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as TgApiResult<T>;
  if (!data.ok) {
    const err = Object.assign(new Error(data.description || "telegram.api_error"), {
      statusCode: 502,
      telegramCode: data.error_code,
    });
    throw err;
  }
  return data.result;
}

export async function getMe(botToken: string) {
  return callBotApi<{ id: number; username?: string; first_name?: string }>(botToken, "getMe");
}

export async function sendMessage(
  botToken: string,
  input: {
    chat_id: string | number;
    text: string;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    reply_markup?: unknown;
    disable_web_page_preview?: boolean;
  },
) {
  return callBotApi<{ message_id: number; chat: { id: number } }>(
    botToken,
    "sendMessage",
    input as Record<string, unknown>,
  );
}

/** Send a photo by publicly reachable HTTPS URL. */
export async function sendPhoto(
  botToken: string,
  input: {
    chat_id: string | number;
    photo: string;
    caption?: string;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  },
) {
  return callBotApi<{ message_id: number; chat: { id: number } }>(
    botToken,
    "sendPhoto",
    input as Record<string, unknown>,
  );
}

/** Delete a bot-sent message (private chats: typically within ~48h). */
export async function deleteMessage(
  botToken: string,
  input: { chat_id: string | number; message_id: number | string },
) {
  return callBotApi<boolean>(botToken, "deleteMessage", {
    chat_id: input.chat_id,
    message_id:
      typeof input.message_id === "string"
        ? Number(input.message_id)
        : input.message_id,
  });
}

export async function setWebhook(
  botToken: string,
  url: string,
  secretToken?: string,
) {
  return callBotApi(botToken, "setWebhook", {
    url,
    allowed_updates: ["message", "my_chat_member", "chat_member"],
    drop_pending_updates: false,
    ...(secretToken ? { secret_token: secretToken } : {}),
  });
}

export async function deleteWebhook(botToken: string) {
  return callBotApi(botToken, "deleteWebhook", { drop_pending_updates: false });
}
