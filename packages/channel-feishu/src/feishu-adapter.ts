import type {
  ChannelAdapter,
  ChannelTarget,
  MessageReceipt,
  NormalizedMessage,
  OutboundMessage,
  PermissionRequest,
} from "@opencode-channel/core";
import { FeishuApi } from "./feishu-api.js";
import type { FeishuAdapterConfig, FeishuEventEnvelope, FeishuMessageEvent, FeishuTextContent } from "./types.js";

export class FeishuAdapter implements ChannelAdapter {
  readonly id = "feishu";
  private readonly api: FeishuApi;
  private readonly allowedChatIds: Set<string> | undefined;

  constructor(private readonly config: FeishuAdapterConfig) {
    this.api = new FeishuApi({
      appId: config.appId,
      appSecret: config.appSecret,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
    this.allowedChatIds = config.allowedChatIds ? new Set(config.allowedChatIds) : undefined;
  }

  verifyEnvelope(envelope: FeishuEventEnvelope): void {
    if (this.config.verificationToken) {
      const token = envelope.header?.token ?? envelope.token;
      if (token && token !== this.config.verificationToken) {
        throw new Error("Feishu event verification token mismatch");
      }
    }
    if (envelope.encrypt || this.config.encryptKey) {
      throw new Error("Encrypted Feishu event payloads are not implemented yet");
    }
  }

  async normalizeInbound(event: unknown): Promise<NormalizedMessage | null> {
    const envelope = event as FeishuEventEnvelope;
    if (envelope.challenge) return null;
    this.verifyEnvelope(envelope);
    if (envelope.header?.event_type && envelope.header.event_type !== "im.message.receive_v1") return null;

    const messageEvent = envelope.event;
    if (!messageEvent) return null;
    const message = messageEvent?.message;
    if (!message?.message_id || !message.chat_id) return null;
    if (this.allowedChatIds && !this.allowedChatIds.has(message.chat_id)) return null;

    const text = extractText(messageEvent);
    if (!text) return null;

    const senderId = messageEvent.sender?.sender_id?.open_id
      ?? messageEvent.sender?.sender_id?.user_id
      ?? messageEvent.sender?.sender_id?.union_id
      ?? "unknown";
    const threadId = message.root_id ?? message.parent_id ?? undefined;

    return {
      channel: this.id,
      chatId: message.chat_id,
      userId: senderId,
      messageId: message.message_id,
      text,
      ...(threadId ? { threadId } : {}),
      target: {
        channel: this.id,
        chatId: message.chat_id,
        ...(threadId ? { threadId } : {}),
        userId: senderId,
        replyToMessageId: message.message_id,
        raw: envelope,
      },
      dedupeId: envelope.header?.event_id ? `${this.id}:${envelope.header.event_id}` : `${this.id}:${message.message_id}`,
      raw: envelope,
    };
  }

  resolveThreadTarget(message: NormalizedMessage): ChannelTarget {
    return message.target;
  }

  async sendMessage(target: ChannelTarget, message: OutboundMessage): Promise<MessageReceipt> {
    const sentMessageId = target.replyToMessageId
      ? await this.api.replyText(target.replyToMessageId, message.text)
      : await this.api.sendText(target.chatId, message.text);

    return {
      channel: this.id,
      chatId: target.chatId,
      messageId: sentMessageId,
      ...(target.threadId ? { threadId: target.threadId } : {}),
      sentAt: new Date(),
    };
  }

  async sendPermissionRequest(target: ChannelTarget, request: PermissionRequest): Promise<MessageReceipt> {
    const text = [
      request.title,
      request.description,
      "Reply is not interactive yet in Feishu. Handle this request from another channel or opencode UI.",
    ].filter(Boolean).join("\n\n");
    return this.sendMessage(target, { text, parseMode: "plain" });
  }
}

export function isFeishuChallenge(event: unknown): event is { challenge: string } {
  return Boolean(event) && typeof event === "object" && typeof (event as { challenge?: unknown }).challenge === "string";
}

function extractText(event: FeishuMessageEvent): string | undefined {
  const message = event.message;
  if (!message?.content) return undefined;
  if (message.message_type !== "text") return undefined;
  const parsed = JSON.parse(message.content) as FeishuTextContent;
  return parsed.text?.trim();
}
