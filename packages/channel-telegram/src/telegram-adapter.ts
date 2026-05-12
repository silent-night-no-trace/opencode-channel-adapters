import type {
  ChannelAdapter,
  ChannelTarget,
  MessageReceipt,
  NormalizedMessage,
  OutboundMessage,
  PermissionResponse,
  PermissionRequest,
} from "@opencode-channel/core";
import { TelegramApi } from "./telegram-api.js";
import { isTelegramGetUpdatesConflict } from "./telegram-api.js";
import type { TelegramAdapterConfig, TelegramInlineKeyboardMarkup, TelegramMessage, TelegramUpdate } from "./types.js";

export class TelegramAdapter implements ChannelAdapter {
  readonly id = "telegram";
  private readonly api: TelegramApi;
  private pollingAbort: AbortController | undefined;
  private nextUpdateOffset: number | undefined;
  private readonly allowedChatIds: Set<string> | undefined;

  constructor(private readonly config: TelegramAdapterConfig) {
    this.api = new TelegramApi(config.botToken, config.fetchImpl);
    this.allowedChatIds = config.allowedChatIds ? new Set(config.allowedChatIds) : undefined;
  }

  async normalizeInbound(event: unknown): Promise<NormalizedMessage | null> {
    const update = event as TelegramUpdate;
    if (this.parsePermissionCallback(update)) return null;
    const message = update.message ?? update.edited_message ?? update.callback_query?.message;
    if (!message) return null;

    const text = this.extractText(update, message);
    if (!text) return null;

    const chatId = String(message.chat.id);
    if (this.allowedChatIds && !this.allowedChatIds.has(chatId)) return null;

    const user = update.callback_query?.from ?? message.from;
    if (!user) return null;

    const threadId = message.message_thread_id ? String(message.message_thread_id) : undefined;
    const messageId = String(message.message_id);

    return {
      channel: this.id,
      chatId,
      userId: String(user.id),
      messageId,
      text,
      ...(threadId ? { threadId } : {}),
      target: {
        channel: this.id,
        chatId,
        ...(threadId ? { threadId } : {}),
        userId: String(user.id),
        replyToMessageId: messageId,
        raw: message,
      },
      dedupeId: `${this.id}:${update.update_id}`,
      raw: update,
    };
  }

  async normalizePermissionResponse(event: unknown): Promise<PermissionResponse | null> {
    const update = event as TelegramUpdate;
    const parsed = this.parsePermissionCallback(update);
    if (!parsed || !update.callback_query?.message) return null;
    const message = update.callback_query.message;
    const threadId = message.message_thread_id ? String(message.message_thread_id) : undefined;
    await this.answerCallbackQuery(update.callback_query.id, parsed.choice === "approve" ? "Approved" : "Denied");
    return {
      permissionId: parsed.permissionId,
      choice: parsed.choice === "approve" ? "once" : "reject",
      target: {
        channel: this.id,
        chatId: String(message.chat.id),
        ...(threadId ? { threadId } : {}),
        userId: String(update.callback_query.from.id),
        replyToMessageId: String(message.message_id),
        raw: message,
      },
      raw: update,
    };
  }

  resolveThreadTarget(message: NormalizedMessage): ChannelTarget {
    return message.target;
  }

  async sendMessage(target: ChannelTarget, message: OutboundMessage): Promise<MessageReceipt> {
    return this.sendTelegramMessage(target, message);
  }

  async sendMessageWithKeyboard(
    target: ChannelTarget,
    message: OutboundMessage,
    replyMarkup: TelegramInlineKeyboardMarkup,
  ): Promise<MessageReceipt> {
    return this.sendTelegramMessage(target, message, replyMarkup);
  }

  async handleSessionSelectionCallback(update: TelegramUpdate): Promise<{ sessionId: string; target: ChannelTarget } | null> {
    const callbackQuery = update.callback_query;
    const data = callbackQuery?.data;
    const message = callbackQuery?.message;
    if (!callbackQuery || !data || !message) return null;
    const match = /^opencode:session:use:(ses[^:]+)$/.exec(data);
    if (!match) return null;
    const sessionId = match[1];
    if (!sessionId) return null;
    const threadId = message.message_thread_id ? String(message.message_thread_id) : undefined;
    await this.answerCallbackQuery(callbackQuery.id, `Switching to ${sessionId}`);
    return {
      sessionId,
      target: {
        channel: this.id,
        chatId: String(message.chat.id),
        ...(threadId ? { threadId } : {}),
        userId: String(callbackQuery.from.id),
        replyToMessageId: String(message.message_id),
        raw: message,
      },
    };
  }

  private async sendTelegramMessage(
    target: ChannelTarget,
    message: OutboundMessage,
    replyMarkup?: TelegramInlineKeyboardMarkup,
  ): Promise<MessageReceipt> {
    const input = {
      chatId: target.chatId,
      text: message.text,
    } satisfies { chatId: string; text: string } & Record<string, unknown>;
    const replyToMessageId = message.replyToMessageId ?? target.replyToMessageId;
    const parseMode = toTelegramParseMode(message.parseMode, this.config.defaultParseMode);
    const sent = await this.api.sendMessage({
      ...input,
      ...(target.threadId ? { messageThreadId: target.threadId } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(parseMode ? { parseMode } : {}),
      ...(replyMarkup ? { replyMarkup } : {}),
    });

    return {
      channel: this.id,
      chatId: String(sent.chat.id),
      messageId: String(sent.message_id),
      ...(sent.message_thread_id ? { threadId: String(sent.message_thread_id) } : {}),
      sentAt: new Date(),
      raw: sent,
    };
  }

  async sendPermissionRequest(target: ChannelTarget, request: PermissionRequest): Promise<MessageReceipt> {
    const text = [request.title, request.description].filter(Boolean).join("\n\n");
    const sent = await this.api.sendMessage({
      chatId: target.chatId,
      text,
      ...(target.threadId ? { messageThreadId: target.threadId } : {}),
      ...(target.replyToMessageId ? { replyToMessageId: target.replyToMessageId } : {}),
      replyMarkup: {
        inline_keyboard: [[
          { text: "Approve", callback_data: `opencode:permission:${request.id}:approve` },
          { text: "Deny", callback_data: `opencode:permission:${request.id}:deny` },
        ]],
      },
    });

    return {
      channel: this.id,
      chatId: String(sent.chat.id),
      messageId: String(sent.message_id),
      ...(sent.message_thread_id ? { threadId: String(sent.message_thread_id) } : {}),
      sentAt: new Date(),
      raw: sent,
    };
  }

  async startPolling(onUpdate: (update: TelegramUpdate) => Promise<void>): Promise<void> {
    if (this.pollingAbort) throw new Error("Telegram polling is already running");
    const abort = new AbortController();
    this.pollingAbort = abort;

    while (!abort.signal.aborted) {
      const updates = await this.getUpdatesOrThrowFriendlyConflict();

      for (const update of updates) {
        this.nextUpdateOffset = update.update_id + 1;
        await onUpdate(update);
      }
    }
  }

  private async getUpdatesOrThrowFriendlyConflict(): Promise<TelegramUpdate[]> {
    try {
      return await this.api.getUpdates(
        this.nextUpdateOffset,
        this.config.polling?.timeoutSeconds,
        this.config.polling?.limit,
      );
    } catch (error) {
      if (isTelegramGetUpdatesConflict(error)) {
        throw new Error([
          "Telegram polling conflict: another getUpdates consumer is already running for this bot token.",
          "Only one opencode-channel-telegram process can poll the same bot at a time.",
          "Close the other terminal/process, then start this adapter again.",
        ].join(" "));
      }
      throw error;
    }
  }

  async getWebhookInfo(): Promise<import("./types.js").TelegramWebhookInfo> {
    return this.api.getWebhookInfo();
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<void> {
    await this.api.deleteWebhook(dropPendingUpdates);
  }

  async stop(): Promise<void> {
    this.pollingAbort?.abort();
    this.pollingAbort = undefined;
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.api.answerCallbackQuery(callbackQueryId, text);
  }

  private extractText(update: TelegramUpdate, message: TelegramMessage): string | undefined {
    if (update.callback_query?.data?.startsWith("opencode:permission:")) {
      return update.callback_query.data;
    }
    return message.text ?? message.caption;
  }

  private parsePermissionCallback(update: TelegramUpdate): { permissionId: string; choice: "approve" | "deny" } | null {
    const data = update.callback_query?.data;
    if (!data) return null;
    const match = /^opencode:permission:([^:]+):(approve|deny)$/.exec(data);
    if (!match) return null;
    const [, permissionId, choice] = match;
    if (!permissionId || (choice !== "approve" && choice !== "deny")) return null;
    return { permissionId, choice };
  }
}

function toTelegramParseMode(
  parseMode: OutboundMessage["parseMode"],
  defaultParseMode: TelegramAdapterConfig["defaultParseMode"],
): "MarkdownV2" | "HTML" | undefined {
  if (parseMode === "plain") return undefined;
  if (parseMode === "html") return "HTML";
  if (parseMode === "markdown") return defaultParseMode ?? undefined;
  return defaultParseMode;
}
