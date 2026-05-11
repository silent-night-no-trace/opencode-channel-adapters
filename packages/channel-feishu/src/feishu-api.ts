export type FeishuApiOptions = {
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
};

type TenantTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

type SendMessageResponse = {
  code?: number;
  msg?: string;
  data?: {
    message_id?: string;
  };
};

export class FeishuApi {
  private readonly fetchImpl: typeof fetch;
  private token: { value: string; expiresAt: number } | undefined;

  constructor(private readonly options: FeishuApiOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendText(receiveId: string, text: string, receiveIdType = "chat_id"): Promise<string> {
    const token = await this.getTenantAccessToken();
    const response = await this.call<SendMessageResponse>(
      `/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      },
    );

    const messageId = response.data?.message_id;
    if (!messageId) throw new Error("Feishu send message response did not include data.message_id");
    return messageId;
  }

  async replyText(messageId: string, text: string): Promise<string> {
    const token = await this.getTenantAccessToken();
    const response = await this.call<SendMessageResponse>(
      `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      },
    );

    const replyMessageId = response.data?.message_id;
    if (!replyMessageId) throw new Error("Feishu reply response did not include data.message_id");
    return replyMessageId;
  }

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 60_000) return this.token.value;

    const response = await this.call<TenantTokenResponse>("/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.options.appId, app_secret: this.options.appSecret }),
    });
    const token = response.tenant_access_token;
    if (!token) throw new Error("Feishu tenant token response did not include tenant_access_token");
    this.token = { value: token, expiresAt: now + ((response.expire ?? 7200) * 1000) };
    return token;
  }

  private async call<T extends { code?: number; msg?: string }>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`https://open.feishu.cn${path}`, init);
    const payload = await response.json() as T;
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      throw new Error(`Feishu API request failed ${response.status}: ${payload.msg ?? response.statusText}`);
    }
    return payload;
  }
}
