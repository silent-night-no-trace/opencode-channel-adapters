export type DiscordAdapterConfig = {
  botToken: string;
  applicationId?: string;
  allowedGuildIds?: readonly string[];
  allowedChannelIds?: readonly string[];
  ignoreBots?: boolean;
};
