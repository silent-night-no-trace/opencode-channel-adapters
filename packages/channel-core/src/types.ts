export type ChannelId = string;

export type SessionId = string;

export type SessionKey = string;

export type ChannelTarget = {
  channel: ChannelId;
  chatId: string;
  threadId?: string;
  userId?: string;
  replyToMessageId?: string;
  raw?: unknown;
};

export type SerializableChannelTarget = Omit<ChannelTarget, "raw">;

export type NormalizedMessage = {
  channel: ChannelId;
  chatId: string;
  userId: string;
  messageId: string;
  text: string;
  threadId?: string;
  target: ChannelTarget;
  dedupeId?: string;
  raw: unknown;
};

export type OutboundMessage = {
  text: string;
  parseMode?: "plain" | "markdown" | "html";
  replyToMessageId?: string;
};

export type PromptResult = {
  text?: string;
  raw: unknown;
};

export type OpencodeSessionSummary = {
  id: SessionId;
  title?: string;
  raw: unknown;
};

export type MessageReceipt = {
  channel: ChannelId;
  chatId: string;
  messageId: string;
  threadId?: string;
  sentAt: Date;
  raw?: unknown;
};

export type PermissionChoice = "once" | "always" | "reject";

export type PermissionRequest = {
  id: string;
  title: string;
  description?: string;
  sessionId?: SessionId;
  permission?: string;
  patterns?: readonly string[];
  metadata?: Record<string, string>;
};

export type ChannelEvent =
  | { type: "message"; message: NormalizedMessage }
  | { type: "permission"; target: ChannelTarget; request: PermissionRequest };

export type PermissionResponse = {
  permissionId: string;
  choice: PermissionChoice;
  target?: ChannelTarget;
  raw: unknown;
};

export type ChannelAdapter = {
  id: ChannelId;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  normalizeInbound(event: unknown): Promise<NormalizedMessage | null>;
  normalizePermissionResponse?(event: unknown): Promise<PermissionResponse | null>;
  resolveThreadTarget(message: NormalizedMessage): ChannelTarget;
  sendMessage(target: ChannelTarget, message: OutboundMessage): Promise<MessageReceipt>;
  sendPermissionRequest?(target: ChannelTarget, request: PermissionRequest): Promise<MessageReceipt>;
};

export type OpencodePromptInput = {
  sessionId: SessionId;
  text: string;
};

export type OpencodeSessionInput = {
  title?: string;
  metadata?: Record<string, string>;
};

export type OpencodeEvent = {
  type: "message" | "permission" | "unknown" | string;
  sessionId?: SessionId;
  message?: string;
  permissionRequest?: PermissionRequest;
  raw: unknown;
};

export type OpencodeBridge = {
  createSession(input: OpencodeSessionInput): Promise<SessionId>;
  prompt(input: OpencodePromptInput): Promise<PromptResult>;
  getSession?(sessionId: SessionId): Promise<OpencodeSessionSummary>;
  listSessions?(limit?: number): Promise<OpencodeSessionSummary[]>;
  replyPermission?(permissionId: string, choice: PermissionChoice): Promise<void>;
  subscribe?(onEvent: (event: OpencodeEvent) => void | Promise<void>): Promise<() => Promise<void> | void>;
};
