import {
  ChannelRuntime,
  JsonFileSessionStore,
  OpencodeHttpBridge,
} from "@silent-night-no-trace/core";
import { DiscordAdapter } from "./discord-adapter.js";

export type DiscordRunnerOptions = {
  botToken: string;
  applicationId?: string;
  opencodeBaseUrl: string;
  opencodeAuthToken?: string;
  opencodeAuthHeader?: string;
  opencodePassword?: string;
  sessionStorePath: string;
  allowedGuildIds?: readonly string[];
  allowedChannelIds?: readonly string[];
  ignoreBots?: boolean;
};

export function createDiscordRuntime(options: DiscordRunnerOptions): {
  adapter: DiscordAdapter;
  runtime: ChannelRuntime;
  start: () => Promise<void>;
} {
  const adapter = new DiscordAdapter({
    botToken: options.botToken,
    ...(options.applicationId ? { applicationId: options.applicationId } : {}),
    ...(options.allowedGuildIds ? { allowedGuildIds: options.allowedGuildIds } : {}),
    ...(options.allowedChannelIds ? { allowedChannelIds: options.allowedChannelIds } : {}),
    ...(options.ignoreBots !== undefined ? { ignoreBots: options.ignoreBots } : {}),
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

  adapter.onMessage(async (message) => {
    await runtime.handleInbound(message);
  });
  adapter.onInteraction(async (interaction) => {
    await runtime.handleInbound(interaction);
  });

  return {
    adapter,
    runtime,
    start: async () => {
      await runtime.bindEvents();
      await adapter.start();
    },
  };
}
