import type {
  TelegramGetUpdatesResult,
  TelegramGetWebhookInfoResult,
  TelegramSendExtra,
  TelegramWebhookInfo,
  TelegramInlineKeyboardMarkup,
  TelegramMessage,
  TelegramSendMessageResult,
  TelegramUpdate,
} from "./types.js";

export type TelegramSendMessageInput = {
  chatId: string;
  text: string;
  messageThreadId?: string;
  replyToMessageId?: string;
  parseMode?: "MarkdownV2" | "HTML";
  replyMarkup?: TelegramInlineKeyboardMarkup;
};

export type TelegramCallbackAnswerInput = {
  callbackQueryId: string;
  text?: string;
};

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
  ) {
    super(`Telegram ${method} failed: ${description}`);
    this.name = "TelegramApiError";
  }
}

export function isTelegramGetUpdatesConflict(error: unknown): boolean {
  return error instanceof TelegramApiError
    && error.method === "getUpdates"
    && error.status === 409
    && error.description.toLowerCase().includes("terminated by other getupdates request");
}

export class TelegramApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(botToken: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    this.fetchImpl = fetchImpl;
  }

  async sendMessage(input: TelegramSendMessageInput): Promise<TelegramMessage> {
    const payload: Record<string, unknown> = {
      chat_id: input.chatId,
      text: input.text,
    };
    if (input.messageThreadId) payload.message_thread_id = Number(input.messageThreadId);
    if (input.replyToMessageId) payload.reply_to_message_id = Number(input.replyToMessageId);
    if (input.parseMode) payload.parse_mode = input.parseMode;
    if (input.replyMarkup) payload.reply_markup = input.replyMarkup;

    const result = await this.call<TelegramSendMessageResult>("sendMessage", payload);
    if (!result.result) throw new Error("Telegram sendMessage response did not include result");
    return result.result;
  }

  async getUpdates(offset?: number, timeoutSeconds = 30, limit = 25): Promise<TelegramUpdate[]> {
    const payload: Record<string, unknown> = {
      timeout: timeoutSeconds,
      limit,
      allowed_updates: ["message", "edited_message", "callback_query"],
    };
    if (offset !== undefined) payload.offset = offset;

    const result = await this.call<TelegramGetUpdatesResult>("getUpdates", payload);
    return result.result ?? [];
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    const result = await this.call<TelegramGetWebhookInfoResult>("getWebhookInfo", {});
    if (!result.result) throw new Error("Telegram getWebhookInfo response did not include result");
    return result.result;
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<void> {
    await this.call<{ ok: boolean; description?: string }>("deleteWebhook", {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call<{ ok: boolean; description?: string }>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  private async call<T extends { ok: boolean; description?: string }>(method: string, payload: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json() as T;
    if (!response.ok || !json.ok) {
      throw new TelegramApiError(method, response.status, json.description ?? response.statusText);
    }
    return json;
  }
}
