import type {
  ChannelAdapter,
  NormalizedMessage,
  OpencodeEvent,
  OpencodeBridge,
  OpencodeSessionSummary,
  OutboundMessage,
  SessionId,
  SessionKey,
} from "./types.js";
import { defaultSessionKey, type SessionStore } from "./session-store.js";

export type ChannelRuntimeOptions = {
  adapter: ChannelAdapter;
  opencode: OpencodeBridge;
  sessionStore: SessionStore;
  resolveSessionKey?: (message: NormalizedMessage) => SessionKey;
  createSessionTitle?: (message: NormalizedMessage) => string;
};

export class ChannelRuntime {
  private readonly resolveSessionKey: (message: NormalizedMessage) => SessionKey;
  private readonly createSessionTitle: (message: NormalizedMessage) => string;

  constructor(private readonly options: ChannelRuntimeOptions) {
    this.resolveSessionKey = options.resolveSessionKey ?? defaultSessionKey;
    this.createSessionTitle =
      options.createSessionTitle ??
      ((message) => `${message.channel}:${message.chatId}:${message.threadId ?? "default"}`);
  }

  async start(): Promise<void> {
    await this.options.adapter.start?.();
  }

  async stop(): Promise<void> {
    await this.options.adapter.stop?.();
  }

  async handleInbound(rawEvent: unknown): Promise<SessionId | null> {
    const permission = await this.options.adapter.normalizePermissionResponse?.(rawEvent);
    if (permission) {
      if (!this.options.opencode.replyPermission) {
        throw new Error("opencode bridge does not support permission replies");
      }
      await this.options.opencode.replyPermission(permission.permissionId, permission.choice);
      return null;
    }

    const message = await this.options.adapter.normalizeInbound(rawEvent);
    if (!message) return null;

    return this.handleMessage(message);
  }

  async handleMessage(message: NormalizedMessage): Promise<SessionId> {

    const sessionId = await this.resolveSession(message);
    const target = this.options.adapter.resolveThreadTarget(message);
    await this.options.sessionStore.setTarget?.(sessionId, target);
    const result = await this.options.opencode.prompt({ sessionId, text: message.text });
    if (result.text) {
      await this.options.adapter.sendMessage(target, {
        text: result.text,
        parseMode: "plain",
      });
    }
    return sessionId;
  }

  async bindEvents(): Promise<(() => Promise<void> | void) | undefined> {
    return this.options.opencode.subscribe?.(async (event) => {
      await this.handleOpencodeEvent(event);
    });
  }

  async handleOpencodeEvent(event: OpencodeEvent): Promise<void> {
    if (!event.sessionId) return;
    const target = await this.options.sessionStore.getTarget?.(event.sessionId);
    if (!target) return;

    if (event.permissionRequest && this.options.adapter.sendPermissionRequest) {
      await this.options.adapter.sendPermissionRequest(target, event.permissionRequest);
      return;
    }

    if (!shouldForwardSideEvent(event)) return;

    const outbound = this.toOutboundMessage(event);
    if (!outbound) return;
    await this.options.adapter.sendMessage(target, outbound);
  }

  async resolveSession(message: NormalizedMessage): Promise<SessionId> {
    const key = this.resolveSessionKey(message);
    const existing = await this.options.sessionStore.get(key);
    if (existing) return existing;

    const sessionId = await this.options.opencode.createSession({
      title: this.createSessionTitle(message),
      metadata: {
        channel: message.channel,
        chatId: message.chatId,
        threadId: message.threadId ?? "",
        userId: message.userId,
      },
    });
    await this.options.sessionStore.set(key, sessionId);
    return sessionId;
  }

  async getCurrentSession(message: NormalizedMessage): Promise<SessionId | undefined> {
    return this.options.sessionStore.get(this.resolveSessionKey(message));
  }

  async bindSession(message: NormalizedMessage, sessionId: SessionId): Promise<void> {
    const key = this.resolveSessionKey(message);
    await this.options.sessionStore.set(key, sessionId);
    await this.options.sessionStore.setTarget?.(sessionId, this.options.adapter.resolveThreadTarget(message));
  }

  async clearSession(message: NormalizedMessage): Promise<void> {
    await this.options.sessionStore.delete?.(this.resolveSessionKey(message));
  }

  async createAndBindSession(message: NormalizedMessage, title?: string): Promise<SessionId> {
    const sessionId = await this.options.opencode.createSession({
      title: title ?? this.createSessionTitle(message),
      metadata: {
        channel: message.channel,
        chatId: message.chatId,
        threadId: message.threadId ?? "",
        userId: message.userId,
      },
    });
    await this.bindSession(message, sessionId);
    return sessionId;
  }

  async getSession(sessionId: SessionId): Promise<OpencodeSessionSummary> {
    if (!this.options.opencode.getSession) {
      throw new Error("opencode bridge does not support getSession");
    }
    return this.options.opencode.getSession(sessionId);
  }

  async listSessions(limit = 10): Promise<OpencodeSessionSummary[]> {
    if (!this.options.opencode.listSessions) {
      throw new Error("opencode bridge does not support listSessions");
    }
    return this.options.opencode.listSessions(limit);
  }

  private toOutboundMessage(event: OpencodeEvent): OutboundMessage | null {
    if (!event.message) return null;
    return { text: event.message, parseMode: "plain" };
  }
}

function shouldForwardSideEvent(event: OpencodeEvent): boolean {
  return event.type === "message.part.updated" || event.type === "permission.asked";
}
