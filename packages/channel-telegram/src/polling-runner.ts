import {
  ChannelRuntime,
  JsonFileSessionStore,
  type NormalizedMessage,
  OpencodeHttpBridge,
} from "@opencode-channel/core";
import { TelegramAdapter } from "./telegram-adapter.js";

export type TelegramPollingRunnerOptions = {
  botToken: string;
  opencodeBaseUrl: string;
  opencodeAuthToken?: string;
  opencodeAuthHeader?: string;
  opencodePassword?: string;
  sessionStorePath: string;
  allowedChatIds?: readonly string[];
  proxyUrl?: string;
  polling?: {
    timeoutSeconds?: number;
    limit?: number;
    retryDelayMs?: number;
  };
  debug?: boolean;
};

export function createTelegramPollingRuntime(options: TelegramPollingRunnerOptions): {
  adapter: TelegramAdapter;
  runtime: ChannelRuntime;
  start: () => Promise<void>;
} {
  const { adapter, runtime } = createTelegramRuntime(options);

  return {
    adapter,
    runtime,
    start: async () => {
      try {
        await runtime.bindEvents();
        if (options.debug) console.log("[telegram] connected to opencode event stream");
      } catch (error) {
        console.error("[telegram] failed to subscribe to opencode events; polling will still start", error);
      }
      await adapter.startPolling(async (update) => {
        if (options.debug) console.log("[telegram] update", JSON.stringify(update));
        try {
          if (await handleTelegramSessionSelection(runtime, adapter, update, options.debug)) {
            if (options.debug) console.log("[telegram] handled session selection callback", { updateId: update.update_id });
            return;
          }

          const normalized = await adapter.normalizeInbound(update);
          if (!normalized) {
            const sessionId = await runtime.handleInbound(update);
            if (options.debug) console.log("[telegram] handled non-message update", { updateId: update.update_id, sessionId });
            return;
          }

          if (await handleTelegramSessionCommand(runtime, adapter, normalized, options.debug)) {
            if (options.debug) console.log("[telegram] handled session command", { updateId: update.update_id });
            return;
          }

          const sessionId = await runtime.handleMessage(normalized);
          if (options.debug) console.log("[telegram] handled update", { updateId: update.update_id, sessionId });
        } catch (error) {
          console.error("[telegram] failed to handle update", error);
        }
      });
    },
  };
}

type SessionCommand =
  | { type: "current" }
  | { type: "list" }
  | { type: "use"; sessionId: string }
  | { type: "new"; title?: string }
  | { type: "clear" };

async function handleTelegramSessionCommand(
  runtime: ChannelRuntime,
  adapter: TelegramAdapter,
  message: NormalizedMessage,
  debug = false,
): Promise<boolean> {
  const command = parseSessionCommand(message.text);
  if (!command) return false;

  if (debug) console.log("[telegram] session command", command);

  switch (command.type) {
    case "current": {
      const current = await runtime.getCurrentSession(message);
      const text = current
        ? [`Current session: ${current}`, "Use /session list to see recent sessions.", "Use /session use <session_id> to switch."].join("\n")
        : "No session is currently bound to this chat/thread. The next normal message will create one automatically.";
      await adapter.sendMessage(message.target, { text, parseMode: "plain" });
      return true;
    }
    case "list": {
      const current = await runtime.getCurrentSession(message);
      const sessions = await runtime.listSessions(10);
      const lines = sessions.length
        ? sessions.map((session, index) => {
            const marker = session.id === current ? "*" : " ";
            return `${marker}${index + 1}. ${session.id}${session.title ? ` — ${session.title}` : ""}`;
          })
        : ["No sessions returned by opencode."];
      const text = [
        "Recent sessions:",
        ...lines,
        "",
        "Tap a button below or use /session use <session_id> to switch.",
      ].join("\n");
      const replyMarkup = sessions.length
        ? {
            inline_keyboard: sessions.map((session, index) => [{
              text: `${index + 1}${session.id === current ? " *" : ""}${session.title ? ` ${truncate(session.title, 24)}` : ""}`,
              callback_data: `opencode:session:use:${session.id}`,
            }]),
          }
        : undefined;
      if (replyMarkup) {
        await adapter.sendMessageWithKeyboard(message.target, { text, parseMode: "plain" }, replyMarkup);
      } else {
        await adapter.sendMessage(message.target, { text, parseMode: "plain" });
      }
      return true;
    }
    case "use": {
      if (!command.sessionId.startsWith("ses")) {
        await adapter.sendMessage(message.target, {
          text: "Session ID must start with 'ses'. Use /session list to pick a valid session.",
          parseMode: "plain",
        });
        return true;
      }
      const session = await runtime.getSession(command.sessionId);
      await runtime.bindSession(message, session.id);
      const text = `Bound this chat to session ${session.id}${session.title ? ` (${session.title})` : ""}.`;
      await adapter.sendMessage(message.target, { text, parseMode: "plain" });
      return true;
    }
    case "new": {
      const sessionId = await runtime.createAndBindSession(message, command.title);
      await adapter.sendMessage(message.target, {
        text: `Created and bound a new session: ${sessionId}`,
        parseMode: "plain",
      });
      return true;
    }
    case "clear": {
      await runtime.clearSession(message);
      await adapter.sendMessage(message.target, {
        text: "Cleared the bound session for this chat/thread. The next normal message will create a new session automatically.",
        parseMode: "plain",
      });
      return true;
    }
  }
}

async function handleTelegramSessionSelection(
  runtime: ChannelRuntime,
  adapter: TelegramAdapter,
  update: { update_id: number },
  debug = false,
): Promise<boolean> {
  const selection = await adapter.handleSessionSelectionCallback(update);
  if (!selection) return false;
  if (debug) console.log("[telegram] session selection", selection);

  const message = await adapter.normalizeInbound(update);
  const bindSource = message ?? {
    channel: adapter.id,
    chatId: selection.target.chatId,
    userId: selection.target.userId ?? "unknown",
    messageId: selection.target.replyToMessageId ?? String(update.update_id),
    text: "/session use",
    ...(selection.target.threadId ? { threadId: selection.target.threadId } : {}),
    target: selection.target,
    raw: update,
  };

  const session = await runtime.getSession(selection.sessionId);
  await runtime.bindSession(bindSource, session.id);
  await adapter.sendMessage(selection.target, {
    text: `Bound this chat to session ${session.id}${session.title ? ` (${session.title})` : ""}.`,
    parseMode: "plain",
  });
  return true;
}

function parseSessionCommand(text: string): SessionCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/session")) return null;
  const [first, ...rest] = trimmed.split(/\s+/);
  const base = first?.split("@")[0];
  if (base !== "/session") return null;

  const subcommand = rest[0]?.toLowerCase();
  if (!subcommand || subcommand === "current") return { type: "current" };
  if (subcommand === "list") return { type: "list" };
  if (subcommand === "clear") return { type: "clear" };
  if (subcommand === "use") {
    const sessionId = rest[1];
    return sessionId ? { type: "use", sessionId } : { type: "current" };
  }
  if (subcommand === "new") {
    const title = rest.slice(1).join(" ").trim();
    return title ? { type: "new", title } : { type: "new" };
  }
  return { type: "current" };
}

export function createTelegramRuntime(options: TelegramPollingRunnerOptions): {
  adapter: TelegramAdapter;
  runtime: ChannelRuntime;
  handleUpdate: (update: unknown) => Promise<void>;
} {
  const adapter = new TelegramAdapter({
    botToken: options.botToken,
    ...(options.allowedChatIds ? { allowedChatIds: options.allowedChatIds } : {}),
    ...(options.proxyUrl ? { proxyUrl: options.proxyUrl } : {}),
    ...(options.polling ? { polling: options.polling } : {}),
  });
  const runtime = new ChannelRuntime({
    adapter,
    opencode: new OpencodeHttpBridge({
      baseUrl: options.opencodeBaseUrl,
      ...(options.opencodeAuthHeader ? { authHeader: options.opencodeAuthHeader } : {}),
      ...(options.opencodePassword ? { password: options.opencodePassword } : {}),
      ...(options.opencodeAuthToken ? { authToken: options.opencodeAuthToken } : {}),
    }),
    sessionStore: new JsonFileSessionStore(options.sessionStorePath),
  });

  return {
    adapter,
    runtime,
    handleUpdate: async (update) => {
      const telegramUpdate = update as { update_id?: number };
      if (await handleTelegramSessionSelection(runtime, adapter, update as { update_id: number }, options.debug)) {
        if (options.debug) console.log("[telegram] handled session selection callback", { updateId: telegramUpdate.update_id });
        return;
      }
      const normalized = await adapter.normalizeInbound(update);
      if (!normalized) {
        await runtime.handleInbound(update);
        return;
      }

      if (await handleTelegramSessionCommand(runtime, adapter, normalized, options.debug)) {
        if (options.debug) console.log("[telegram] handled session command", { updateId: telegramUpdate.update_id });
        return;
      }

      const sessionId = await runtime.handleMessage(normalized);
      if (options.debug) console.log("[telegram] handled update", { updateId: telegramUpdate.update_id, sessionId });
    },
  };
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
}
