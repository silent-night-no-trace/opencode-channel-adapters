export type TelegramAdapterConfig = {
  botToken: string;
  allowedChatIds?: readonly string[];
  defaultParseMode?: "MarkdownV2" | "HTML";
  polling?: {
    timeoutSeconds?: number;
    limit?: number;
  };
  fetchImpl?: typeof fetch;
};

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel" | string;
  title?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramSendMessageResult = {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
};

export type TelegramGetUpdatesResult = {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

export type TelegramWebhookInfo = {
  url: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
};

export type TelegramGetWebhookInfoResult = {
  ok: boolean;
  result?: TelegramWebhookInfo;
  description?: string;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export type TelegramSendExtra = {
  replyMarkup?: TelegramInlineKeyboardMarkup;
};
