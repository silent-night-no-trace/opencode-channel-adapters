export type FeishuAdapterConfig = {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  allowedChatIds?: readonly string[];
  fetchImpl?: typeof fetch;
};

export type FeishuWebhookConfig = {
  hostname: string;
  port: number;
  path: string;
};

export type FeishuEventEnvelope = {
  challenge?: string;
  token?: string;
  type?: string;
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    token?: string;
  };
  event?: FeishuMessageEvent;
  encrypt?: string;
};

export type FeishuMessageEvent = {
  sender?: {
    sender_id?: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
  };
  message?: {
    message_id?: string;
    root_id?: string;
    parent_id?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    mentions?: Array<{
      name?: string;
      key?: string;
      id?: { open_id?: string; user_id?: string; union_id?: string };
    }>;
  };
};

export type FeishuTextContent = {
  text?: string;
};
