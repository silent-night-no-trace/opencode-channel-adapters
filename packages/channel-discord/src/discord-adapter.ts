import type {
  ChannelAdapter,
  ChannelTarget,
  MessageReceipt,
  NormalizedMessage,
  OutboundMessage,
  PermissionRequest,
  PermissionResponse,
} from "@silent-night-no-trace/core";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Interaction,
  type Message,
  type MessageCreateOptions,
  type SendableChannels,
  type TextBasedChannel,
} from "discord.js";
import type { DiscordAdapterConfig } from "./types.js";

export class DiscordAdapter implements ChannelAdapter {
  readonly id = "discord";
  private readonly client: Client;
  private readonly allowedGuildIds: Set<string> | undefined;
  private readonly allowedChannelIds: Set<string> | undefined;

  constructor(private readonly config: DiscordAdapterConfig) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });
    this.allowedGuildIds = config.allowedGuildIds ? new Set(config.allowedGuildIds) : undefined;
    this.allowedChannelIds = config.allowedChannelIds ? new Set(config.allowedChannelIds) : undefined;
  }

  async start(): Promise<void> {
    if (this.client.isReady()) return;
    await this.client.login(this.config.botToken);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.client.on(Events.MessageCreate, (message) => {
      void handler(message);
    });
  }

  onInteraction(handler: (interaction: Interaction) => Promise<void>): void {
    this.client.on(Events.InteractionCreate, (interaction) => {
      void handler(interaction);
    });
  }

  async normalizeInbound(event: unknown): Promise<NormalizedMessage | null> {
    if (!isMessage(event)) return null;
    if (this.config.ignoreBots !== false && event.author.bot) return null;
    if (!event.content.trim()) return null;
    if (this.allowedGuildIds && (!event.guildId || !this.allowedGuildIds.has(event.guildId))) return null;
    if (this.allowedChannelIds && !this.allowedChannelIds.has(event.channelId)) return null;

    const threadId = resolveDiscordThreadId(event);
    const target: ChannelTarget = {
      channel: this.id,
      chatId: event.channelId,
      ...(threadId ? { threadId } : {}),
      userId: event.author.id,
      replyToMessageId: event.id,
      raw: event,
    };

    return {
      channel: this.id,
      chatId: event.channelId,
      userId: event.author.id,
      messageId: event.id,
      text: event.content,
      ...(threadId ? { threadId } : {}),
      target,
      dedupeId: `${this.id}:${event.id}`,
      raw: event,
    };
  }

  async normalizePermissionResponse(event: unknown): Promise<PermissionResponse | null> {
    if (!isInteraction(event) || !event.isButton()) return null;
    const parsed = parsePermissionCustomId(event.customId);
    if (!parsed) return null;
    await event.deferUpdate();
    return {
      permissionId: parsed.permissionId,
      choice: parsed.choice === "approve" ? "once" : "reject",
      target: {
        channel: this.id,
        chatId: event.channelId ?? "unknown",
        userId: event.user.id,
        ...(event.message?.id ? { replyToMessageId: event.message.id } : {}),
        raw: event,
      },
      raw: event,
    };
  }

  resolveThreadTarget(message: NormalizedMessage): ChannelTarget {
    return message.target;
  }

  async sendMessage(target: ChannelTarget, message: OutboundMessage): Promise<MessageReceipt> {
    const channel = await this.fetchTextChannel(target.chatId);
    const sent = await channel.send(toDiscordMessageOptions(message, target));
    const threadId = resolveDiscordThreadId(sent);
    return {
      channel: this.id,
      chatId: sent.channelId,
      messageId: sent.id,
      ...(threadId ? { threadId } : {}),
      sentAt: sent.createdAt,
      raw: sent,
    };
  }

  async sendPermissionRequest(target: ChannelTarget, request: PermissionRequest): Promise<MessageReceipt> {
    const channel = await this.fetchTextChannel(target.chatId);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`opencode:permission:${request.id}:approve`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`opencode:permission:${request.id}:deny`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger),
    );
    const content = [request.title, request.description].filter(Boolean).join("\n\n");
    const permissionOptions: MessageCreateOptions = {
      content,
      components: [row],
      ...(target.replyToMessageId ? { reply: { messageReference: target.replyToMessageId } } : {}),
    };
    const sent = await channel.send({
      ...permissionOptions,
    });
    const threadId = resolveDiscordThreadId(sent);

    return {
      channel: this.id,
      chatId: sent.channelId,
      messageId: sent.id,
      ...(threadId ? { threadId } : {}),
      sentAt: sent.createdAt,
      raw: sent,
    };
  }

  private async fetchTextChannel(channelId: string): Promise<TextBasedChannel & SendableChannels> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error(`Discord channel ${channelId} is not text-based or could not be fetched`);
    }
    return channel;
  }
}

function toDiscordMessageOptions(message: OutboundMessage, target: ChannelTarget): MessageCreateOptions {
  const replyToMessageId = message.replyToMessageId ?? target.replyToMessageId;
  return {
    content: message.text,
    ...(replyToMessageId
      ? { reply: { messageReference: replyToMessageId } }
      : {}),
  };
}

function parsePermissionCustomId(customId: string): { permissionId: string; choice: "approve" | "deny" } | null {
  const match = /^opencode:permission:([^:]+):(approve|deny)$/.exec(customId);
  if (!match) return null;
  const [, permissionId, choice] = match;
  if (!permissionId || (choice !== "approve" && choice !== "deny")) return null;
  return { permissionId, choice };
}

function resolveDiscordThreadId(message: Message): string | undefined {
  const channel = message.channel;
  if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread || channel.type === ChannelType.AnnouncementThread) {
    return channel.id;
  }
  return undefined;
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  return true
    && "author" in value
    && "channelId" in value
    && "content" in value
    && "id" in value;
}

function isInteraction(value: unknown): value is Interaction {
  if (!value || typeof value !== "object") return false;
  return true
    && "isButton" in value
    && "user" in value;
}
