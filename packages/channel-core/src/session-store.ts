import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ChannelTarget,
  NormalizedMessage,
  SerializableChannelTarget,
  SessionId,
  SessionKey,
} from "./types.js";

export type SessionStore = {
  get(key: SessionKey): Promise<SessionId | undefined>;
  set(key: SessionKey, sessionId: SessionId): Promise<void>;
  delete?(key: SessionKey): Promise<void>;
  getTarget?(sessionId: SessionId): Promise<SerializableChannelTarget | undefined>;
  setTarget?(sessionId: SessionId, target: ChannelTarget): Promise<void>;
};

type SessionStoreData = {
  sessions: Record<SessionKey, SessionId>;
  targets: Record<SessionId, SerializableChannelTarget>;
};

export function defaultSessionKey(message: NormalizedMessage): SessionKey {
  const thread = message.threadId ?? "default";
  return `${message.channel}:${message.chatId}:${thread}`;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<SessionKey, SessionId>();
  private readonly targets = new Map<SessionId, SerializableChannelTarget>();

  async get(key: SessionKey): Promise<SessionId | undefined> {
    return this.sessions.get(key);
  }

  async set(key: SessionKey, sessionId: SessionId): Promise<void> {
    this.sessions.set(key, sessionId);
  }

  async delete(key: SessionKey): Promise<void> {
    this.sessions.delete(key);
  }

  async getTarget(sessionId: SessionId): Promise<SerializableChannelTarget | undefined> {
    return this.targets.get(sessionId);
  }

  async setTarget(sessionId: SessionId, target: ChannelTarget): Promise<void> {
    this.targets.set(sessionId, serializeTarget(target));
  }
}

export class JsonFileSessionStore implements SessionStore {
  private cache: SessionStoreData | undefined;

  constructor(private readonly filePath: string) {}

  async get(key: SessionKey): Promise<SessionId | undefined> {
    const data = await this.load();
    return data.sessions[key];
  }

  async set(key: SessionKey, sessionId: SessionId): Promise<void> {
    const data = await this.load();
    data.sessions[key] = sessionId;
    await this.save(data);
  }

  async delete(key: SessionKey): Promise<void> {
    const data = await this.load();
    delete data.sessions[key];
    await this.save(data);
  }

  async getTarget(sessionId: SessionId): Promise<SerializableChannelTarget | undefined> {
    const data = await this.load();
    return data.targets[sessionId];
  }

  async setTarget(sessionId: SessionId, target: ChannelTarget): Promise<void> {
    const data = await this.load();
    data.targets[sessionId] = serializeTarget(target);
    await this.save(data);
  }

  private async save(data: SessionStoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  private async load(): Promise<SessionStoreData> {
    if (this.cache) return this.cache;

    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as unknown;
      this.cache = normalizeStoreData(parsed, this.filePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.cache = { sessions: {}, targets: {} };
      } else {
        throw error;
      }
    }

    return this.cache;
  }
}

function normalizeStoreData(value: unknown, filePath: string): SessionStoreData {
  if (isStringRecord(value)) {
    return { sessions: value, targets: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Session store ${filePath} must contain a JSON object`);
  }

  const record = value as Record<string, unknown>;
  const sessions = record.sessions;
  const targets = record.targets;
  if (!isStringRecord(sessions) || !isTargetRecord(targets)) {
    throw new Error(`Session store ${filePath} must contain sessions and targets objects`);
  }
  return { sessions, targets };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isTargetRecord(value: unknown): value is Record<string, SerializableChannelTarget> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const target = entry as Record<string, unknown>;
    return typeof target.channel === "string" && typeof target.chatId === "string";
  });
}

function serializeTarget(target: ChannelTarget): SerializableChannelTarget {
  return {
    channel: target.channel,
    chatId: target.chatId,
    ...(target.threadId ? { threadId: target.threadId } : {}),
    ...(target.userId ? { userId: target.userId } : {}),
    ...(target.replyToMessageId ? { replyToMessageId: target.replyToMessageId } : {}),
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
