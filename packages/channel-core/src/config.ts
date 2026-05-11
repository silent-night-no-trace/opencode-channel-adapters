import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

export type OpencodeChannelConfig = {
  opencode?: {
    baseUrl?: string;
    authToken?: string;
    authHeader?: string;
    password?: string;
  };
  storage?: {
    sessionStore?: string;
  };
  channels?: {
    telegram?: TelegramChannelConfig;
    feishu?: FeishuChannelConfig;
    discord?: DiscordChannelConfig;
    [channel: string]: unknown;
  };
};

export type TelegramChannelConfig = {
  enabled?: boolean;
  botToken?: string;
  allowedChatIds?: string[];
  polling?: {
    timeoutSeconds?: number;
    limit?: number;
  };
};

export type FeishuChannelConfig = {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  allowedChatIds?: string[];
  webhook?: {
    hostname?: string;
    port?: number;
    path?: string;
  };
};

export type DiscordChannelConfig = {
  enabled?: boolean;
  botToken?: string;
  applicationId?: string;
  allowedGuildIds?: string[];
  allowedChannelIds?: string[];
  ignoreBots?: boolean;
};

export type LoadConfigOptions = {
  configPath?: string;
  cwd?: string;
  configHome?: string;
  env?: NodeJS.ProcessEnv;
};

export type LoadedConfig = {
  path?: string;
  config: OpencodeChannelConfig;
};

const DEFAULT_CONFIG_FILENAMES = [
  "opencode-channel.jsonc",
  "opencode-channel.json",
  ".opencode-channel.jsonc",
  ".opencode-channel.json",
] as const;

export async function loadChannelConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const requestedPath = options.configPath ?? env.OPENCODE_CHANNEL_CONFIG;
  const configPath = requestedPath
    ? expandPath(requestedPath, cwd)
    : await findConfigPath(cwd, options.configHome);

  if (!configPath) return { config: {} };

  const content = await readFile(configPath, "utf8");
  const parsed = JSON.parse(stripJsonComments(content)) as unknown;
  if (!isConfigObject(parsed)) {
    throw new Error(`Config file ${configPath} must contain a JSON object`);
  }

  return { path: configPath, config: parsed };
}

export async function findConfigPath(cwd = process.cwd(), configHome = defaultConfigHome()): Promise<string | undefined> {
  const candidates = [
    resolve(configHome, "opencode-channel.json"),
    resolve(configHome, "opencode-channel.jsonc"),
    ...DEFAULT_CONFIG_FILENAMES.map((name) => resolve(cwd, name)),
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  return undefined;
}

export function mergeConfigWithEnv(
  config: OpencodeChannelConfig,
  env: NodeJS.ProcessEnv = process.env,
): OpencodeChannelConfig {
  const telegramAllowedChatIds = splitCsv(env.TELEGRAM_ALLOWED_CHAT_IDS);
  const feishuAllowedChatIds = splitCsv(env.FEISHU_ALLOWED_CHAT_IDS);
  const discordAllowedGuildIds = splitCsv(env.DISCORD_ALLOWED_GUILD_IDS);
  const discordAllowedChannelIds = splitCsv(env.DISCORD_ALLOWED_CHANNEL_IDS);

  return {
    ...config,
    opencode: {
      ...config.opencode,
      ...(env.OPENCODE_BASE_URL ? { baseUrl: env.OPENCODE_BASE_URL } : {}),
      ...(env.OPENCODE_PASSWORD ? { password: env.OPENCODE_PASSWORD } : {}),
      ...(env.OPENCODE_AUTH_HEADER ? { authHeader: env.OPENCODE_AUTH_HEADER } : {}),
      ...(env.OPENCODE_AUTH_TOKEN ? { authToken: env.OPENCODE_AUTH_TOKEN } : {}),
    },
    storage: {
      ...config.storage,
      ...(env.CHANNEL_SESSION_STORE ? { sessionStore: env.CHANNEL_SESSION_STORE } : {}),
    },
    channels: {
      ...config.channels,
      telegram: {
        ...asObject(config.channels?.telegram),
        ...(env.TELEGRAM_BOT_TOKEN ? { botToken: env.TELEGRAM_BOT_TOKEN } : {}),
        ...(telegramAllowedChatIds.length ? { allowedChatIds: telegramAllowedChatIds } : {}),
      },
      feishu: {
        ...asObject(config.channels?.feishu),
        ...(env.FEISHU_APP_ID ? { appId: env.FEISHU_APP_ID } : {}),
        ...(env.FEISHU_APP_SECRET ? { appSecret: env.FEISHU_APP_SECRET } : {}),
        ...(env.FEISHU_ENCRYPT_KEY ? { encryptKey: env.FEISHU_ENCRYPT_KEY } : {}),
        ...(env.FEISHU_VERIFICATION_TOKEN ? { verificationToken: env.FEISHU_VERIFICATION_TOKEN } : {}),
        ...(feishuAllowedChatIds.length ? { allowedChatIds: feishuAllowedChatIds } : {}),
        ...(env.FEISHU_WEBHOOK_HOSTNAME || env.FEISHU_WEBHOOK_PORT || env.FEISHU_WEBHOOK_PATH ? {
          webhook: {
            ...asObject(asObject(config.channels?.feishu).webhook),
            ...(env.FEISHU_WEBHOOK_HOSTNAME ? { hostname: env.FEISHU_WEBHOOK_HOSTNAME } : {}),
            ...(env.FEISHU_WEBHOOK_PORT ? { port: Number(env.FEISHU_WEBHOOK_PORT) } : {}),
            ...(env.FEISHU_WEBHOOK_PATH ? { path: env.FEISHU_WEBHOOK_PATH } : {}),
          },
        } : {}),
      },
      discord: {
        ...asObject(config.channels?.discord),
        ...(env.DISCORD_BOT_TOKEN ? { botToken: env.DISCORD_BOT_TOKEN } : {}),
        ...(env.DISCORD_APPLICATION_ID ? { applicationId: env.DISCORD_APPLICATION_ID } : {}),
        ...(discordAllowedGuildIds.length ? { allowedGuildIds: discordAllowedGuildIds } : {}),
        ...(discordAllowedChannelIds.length ? { allowedChannelIds: discordAllowedChannelIds } : {}),
        ...(env.DISCORD_IGNORE_BOTS ? { ignoreBots: parseBooleanEnv(env.DISCORD_IGNORE_BOTS) } : {}),
      },
    },
  };
}

export function resolveTelegramRuntimeConfig(config: OpencodeChannelConfig): {
  botToken: string;
  opencodeBaseUrl: string;
  opencodeAuthToken?: string;
  opencodeAuthHeader?: string;
  opencodePassword?: string;
  sessionStorePath: string;
  allowedChatIds?: string[];
} {
  const telegram = asObject(config.channels?.telegram);
  const botToken = readString(telegram.botToken);
  if (!botToken) {
    throw new Error("Telegram bot token is required. Set channels.telegram.botToken or TELEGRAM_BOT_TOKEN.");
  }

  const opencode = config.opencode ?? {};
  const storage = config.storage ?? {};
  const allowedChatIds = readStringArray(telegram.allowedChatIds);

  return {
    botToken,
    opencodeBaseUrl: opencode.baseUrl ?? "http://127.0.0.1:4096",
    ...(opencode.authToken ? { opencodeAuthToken: opencode.authToken } : {}),
    ...(opencode.authHeader ? { opencodeAuthHeader: opencode.authHeader } : {}),
    ...(opencode.password ? { opencodePassword: opencode.password } : {}),
    sessionStorePath: storage.sessionStore ?? "./sessions.json",
    ...(allowedChatIds.length ? { allowedChatIds } : {}),
  };
}

export function resolveDiscordRuntimeConfig(config: OpencodeChannelConfig): {
  botToken: string;
  applicationId?: string;
  opencodeBaseUrl: string;
  opencodeAuthToken?: string;
  opencodeAuthHeader?: string;
  opencodePassword?: string;
  sessionStorePath: string;
  allowedGuildIds?: string[];
  allowedChannelIds?: string[];
  ignoreBots?: boolean;
} {
  const discord = asObject(config.channels?.discord);
  const botToken = readString(discord.botToken);
  if (!botToken) {
    throw new Error("Discord bot token is required. Set channels.discord.botToken or DISCORD_BOT_TOKEN.");
  }

  const opencode = config.opencode ?? {};
  const storage = config.storage ?? {};
  const allowedGuildIds = readStringArray(discord.allowedGuildIds);
  const allowedChannelIds = readStringArray(discord.allowedChannelIds);
  const ignoreBots = typeof discord.ignoreBots === "boolean" ? discord.ignoreBots : undefined;
  const applicationId = readString(discord.applicationId);

  return {
    botToken,
    ...(applicationId ? { applicationId } : {}),
    opencodeBaseUrl: opencode.baseUrl ?? "http://127.0.0.1:4096",
    ...(opencode.authToken ? { opencodeAuthToken: opencode.authToken } : {}),
    ...(opencode.authHeader ? { opencodeAuthHeader: opencode.authHeader } : {}),
    ...(opencode.password ? { opencodePassword: opencode.password } : {}),
    sessionStorePath: storage.sessionStore ?? "./sessions.json",
    ...(allowedGuildIds.length ? { allowedGuildIds } : {}),
    ...(allowedChannelIds.length ? { allowedChannelIds } : {}),
    ...(ignoreBots !== undefined ? { ignoreBots } : {}),
  };
}

export function resolveFeishuRuntimeConfig(config: OpencodeChannelConfig): {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  opencodeBaseUrl: string;
  opencodeAuthToken?: string;
  opencodeAuthHeader?: string;
  opencodePassword?: string;
  sessionStorePath: string;
  allowedChatIds?: string[];
  webhookHostname: string;
  webhookPort: number;
  webhookPath: string;
} {
  const feishu = asObject(config.channels?.feishu);
  const appId = readString(feishu.appId);
  const appSecret = readString(feishu.appSecret);
  if (!appId) throw new Error("Feishu app ID is required. Set channels.feishu.appId or FEISHU_APP_ID.");
  if (!appSecret) throw new Error("Feishu app secret is required. Set channels.feishu.appSecret or FEISHU_APP_SECRET.");

  const opencode = config.opencode ?? {};
  const storage = config.storage ?? {};
  const webhook = asObject(feishu.webhook);
  const allowedChatIds = readStringArray(feishu.allowedChatIds);
  const webhookPort = typeof webhook.port === "number" ? webhook.port : 3001;
  const encryptKey = readString(feishu.encryptKey);
  const verificationToken = readString(feishu.verificationToken);

  return {
    appId,
    appSecret,
    ...(encryptKey ? { encryptKey } : {}),
    ...(verificationToken ? { verificationToken } : {}),
    opencodeBaseUrl: opencode.baseUrl ?? "http://127.0.0.1:4096",
    ...(opencode.authToken ? { opencodeAuthToken: opencode.authToken } : {}),
    ...(opencode.authHeader ? { opencodeAuthHeader: opencode.authHeader } : {}),
    ...(opencode.password ? { opencodePassword: opencode.password } : {}),
    sessionStorePath: storage.sessionStore ?? "./sessions.json",
    ...(allowedChatIds.length ? { allowedChatIds } : {}),
    webhookHostname: readString(webhook.hostname) ?? "127.0.0.1",
    webhookPort,
    webhookPath: readString(webhook.path) ?? "/feishu/events",
  };
}

export function redactConfig(config: OpencodeChannelConfig): OpencodeChannelConfig {
  const telegram = asObject(config.channels?.telegram);
  const feishu = asObject(config.channels?.feishu);
  const discord = asObject(config.channels?.discord);

  return {
    ...config,
    opencode: {
      ...config.opencode,
      ...(config.opencode?.password ? { password: redactSecret(config.opencode.password) } : {}),
      ...(config.opencode?.authHeader ? { authHeader: redactSecret(config.opencode.authHeader) } : {}),
      ...(config.opencode?.authToken ? { authToken: redactSecret(config.opencode.authToken) } : {}),
    },
    channels: {
      ...config.channels,
      telegram: {
        ...telegram,
        ...(typeof telegram.botToken === "string" ? { botToken: redactSecret(telegram.botToken) } : {}),
      },
      feishu: {
        ...feishu,
        ...(typeof feishu.appSecret === "string" ? { appSecret: redactSecret(feishu.appSecret) } : {}),
        ...(typeof feishu.encryptKey === "string" ? { encryptKey: redactSecret(feishu.encryptKey) } : {}),
        ...(typeof feishu.verificationToken === "string" ? { verificationToken: redactSecret(feishu.verificationToken) } : {}),
      },
      discord: {
        ...discord,
        ...(typeof discord.botToken === "string" ? { botToken: redactSecret(discord.botToken) } : {}),
      },
    },
  };
}

export function defaultConfigHome(): string {
  return resolve(homedir(), ".config", "opencode");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function expandPath(path: string, cwd: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(cwd, path);
}

function isConfigObject(value: unknown): value is OpencodeChannelConfig {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseBooleanEnv(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    const next = input[index + 1] ?? "";

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}
