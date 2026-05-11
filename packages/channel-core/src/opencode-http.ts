import type {
  OpencodeBridge,
  OpencodeEvent,
  OpencodePromptInput,
  OpencodeSessionSummary,
  PromptResult,
  OpencodeSessionInput,
  PermissionChoice,
  SessionId,
} from "./types.js";

export type OpencodeHttpBridgeOptions = {
  baseUrl: string;
  authToken?: string;
  authHeader?: string;
  password?: string;
  fetchImpl?: typeof fetch;
};

export class OpencodeHttpBridge implements OpencodeBridge {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpencodeHttpBridgeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createSession(input: OpencodeSessionInput): Promise<SessionId> {
    const response = await this.request("/session", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const payload = await response.json() as unknown;
    const id = readString(payload, ["id", "sessionId"]);
    if (!id) throw new Error("opencode create session response did not include id/sessionId");
    return id;
  }

  async prompt(input: OpencodePromptInput): Promise<PromptResult> {
    const response = await this.request(`/session/${encodeURIComponent(input.sessionId)}/message`, {
      method: "POST",
      body: JSON.stringify({
        parts: [{ type: "text", text: input.text }],
      }),
    });
    const payload = await response.json() as unknown;
    const text = extractPromptResponseText(payload);
    return {
      ...(text ? { text } : {}),
      raw: payload,
    };
  }

  async getSession(sessionId: SessionId): Promise<OpencodeSessionSummary> {
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}`, {
      method: "GET",
    });
    const payload = await response.json() as unknown;
    const id = readString(payload, ["id", "sessionId"]);
    if (!id) throw new Error("opencode get session response did not include id/sessionId");
    const title = readString(payload, ["title"]);
    return {
      id,
      ...(title ? { title } : {}),
      raw: payload,
    };
  }

  async listSessions(limit = 10): Promise<OpencodeSessionSummary[]> {
    const query = limit > 0 ? `?limit=${encodeURIComponent(String(limit))}` : "";
    const response = await this.request(`/session${query}`, { method: "GET" });
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      throw new Error("opencode list sessions response was not an array");
    }
    const sessions: OpencodeSessionSummary[] = [];
    for (const item of payload) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = readString(record, ["id", "sessionId"]);
      if (!id) continue;
      const title = readString(record, ["title"]);
      sessions.push({
        id,
        ...(title ? { title } : {}),
        raw: record,
      });
    }
    return sessions;
  }

  async replyPermission(permissionId: string, choice: PermissionChoice): Promise<void> {
    await this.request(`/permission/${encodeURIComponent(permissionId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply: choice }),
    });
  }

  async subscribe(onEvent: (event: OpencodeEvent) => void | Promise<void>): Promise<() => void> {
    const controller = new AbortController();
    const response = await this.request("/event", {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });

    void this.consumeEventStream(response, onEvent, controller.signal);
    return () => controller.abort();
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
    const authHeader = resolveAuthHeader(this.options);
    if (authHeader) headers.set("authorization", authHeader);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`opencode request failed ${response.status}: ${body}`);
    }
    return response;
  }

  private async consumeEventStream(
    response: Response,
    onEvent: (event: OpencodeEvent) => void | Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (!response.body) throw new Error("opencode event response did not include a body");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (!signal.aborted) {
      const result = await reader.read();
      if (result.done) break;
      buffer += result.value;

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        await this.handleSseChunk(chunk, onEvent);
        boundary = buffer.indexOf("\n\n");
      }
    }
  }

  private async handleSseChunk(
    chunk: string,
    onEvent: (event: OpencodeEvent) => void | Promise<void>,
  ): Promise<void> {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;

    const raw = JSON.parse(data) as unknown;
    const event: OpencodeEvent = {
      type: readString(raw, ["type"]) ?? "unknown",
      raw,
    };
    const sessionId = readString(raw, ["sessionId", "sessionID"]);
    const message = readMessageText(raw);
    if (sessionId) event.sessionId = sessionId;
    if (message) event.message = message;
    const permissionRequest = readPermissionRequest(raw);
    if (permissionRequest) event.permissionRequest = permissionRequest;
    await onEvent(event);
  }
}

function readMessageText(value: unknown): string | undefined {
  const direct = readString(value, ["message", "text"]);
  if (direct) return direct;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (!properties || typeof properties !== "object") return undefined;
  const part = (properties as Record<string, unknown>).part;
  if (!part || typeof part !== "object") return undefined;
  const partRecord = part as Record<string, unknown>;
  const type = partRecord.type;
  if (type === "text") return readString(partRecord, ["text"]);
  if (type === "tool") {
    const tool = readString(partRecord, ["tool"]) ?? "tool";
    const state = partRecord.state;
    if (state && typeof state === "object") {
      const stateRecord = state as Record<string, unknown>;
      const status = readString(stateRecord, ["status"]);
      const title = readString(stateRecord, ["title"]);
      if (status === "completed" && title) return `${tool} - ${title}`;
    }
  }
  return undefined;
}

function resolveAuthHeader(options: OpencodeHttpBridgeOptions): string | undefined {
  if (options.authHeader) return options.authHeader;
  if (options.password) return `Basic ${Buffer.from(`opencode:${options.password}`).toString("base64")}`;
  if (options.authToken) return `Bearer ${options.authToken}`;
  return undefined;
}

function readString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const entry = record[key];
    if (typeof entry === "string") return entry;
  }
  return undefined;
}

function readPermissionRequest(value: unknown): OpencodeEvent["permissionRequest"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const candidate = record.type === "permission.asked" ? record.properties : record.permission ?? record.permissionRequest ?? record.request;
  if (!candidate || typeof candidate !== "object") return undefined;
  const permission = candidate as Record<string, unknown>;
  const id = typeof permission.id === "string" ? permission.id : undefined;
  if (!id) return undefined;
  const permissionName = typeof permission.permission === "string" ? permission.permission : undefined;
  const patterns = Array.isArray(permission.patterns)
    ? permission.patterns.filter((pattern): pattern is string => typeof pattern === "string")
    : undefined;
  const title = typeof permission.title === "string"
    ? permission.title
    : `Permission requested${permissionName ? `: ${permissionName}` : ""}`;
  const description = typeof permission.description === "string"
    ? permission.description
    : patterns?.length
      ? `Patterns: ${patterns.join(", ")}`
      : undefined;
  return {
    id,
    title,
    ...(description ? { description } : {}),
    ...(typeof permission.sessionID === "string" ? { sessionId: permission.sessionID } : {}),
    ...(permissionName ? { permission: permissionName } : {}),
    ...(patterns?.length ? { patterns } : {}),
  };
}

function extractPromptResponseText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const info = record.info;
  if (info && typeof info === "object") {
    const content = readString(info as Record<string, unknown>, ["content"]);
    if (content) return content;
  }

  const parts = record.parts;
  if (Array.isArray(parts)) {
    const texts = parts
      .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === "object")
      .filter((part) => part.type === "text")
      .map((part) => readString(part, ["text"]))
      .filter((text): text is string => typeof text === "string" && text.length > 0);
    if (texts.length) return texts.join("\n");
  }

  return undefined;
}
