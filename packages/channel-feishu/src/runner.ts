import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  ChannelRuntime,
  JsonFileSessionStore,
  OpencodeHttpBridge,
} from "@opencode-channel/core";
import { FeishuAdapter, isFeishuChallenge } from "./feishu-adapter.js";
import type { FeishuEventEnvelope, FeishuWebhookConfig } from "./types.js";

export type FeishuRunnerOptions = {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  opencodeBaseUrl: string;
  opencodeAuthToken?: string;
  opencodeAuthHeader?: string;
  opencodePassword?: string;
  sessionStorePath: string;
  allowedChatIds?: readonly string[];
  webhookHostname: string;
  webhookPort: number;
  webhookPath: string;
};

export function createFeishuRuntime(options: FeishuRunnerOptions): {
  adapter: FeishuAdapter;
  runtime: ChannelRuntime;
  handleEvent: (event: FeishuEventEnvelope) => Promise<unknown>;
  start: () => Promise<void>;
} {
  const adapter = new FeishuAdapter({
    appId: options.appId,
    appSecret: options.appSecret,
    ...(options.verificationToken ? { verificationToken: options.verificationToken } : {}),
    ...(options.encryptKey ? { encryptKey: options.encryptKey } : {}),
    ...(options.allowedChatIds ? { allowedChatIds: options.allowedChatIds } : {}),
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
    handleEvent: async (event) => {
      if (isFeishuChallenge(event)) return { challenge: event.challenge };
      await runtime.handleInbound(event);
      return { code: 0 };
    },
    start: async () => {
      await runtime.bindEvents();
      await startFeishuWebhookServer({
        hostname: options.webhookHostname,
        port: options.webhookPort,
        path: options.webhookPath,
      }, async (event) => {
        if (isFeishuChallenge(event)) return { challenge: event.challenge };
        await runtime.handleInbound(event);
        return { code: 0 };
      });
    },
  };
}

export async function startFeishuWebhookServer(
  config: FeishuWebhookConfig,
  handler: (event: FeishuEventEnvelope) => Promise<unknown>,
): Promise<void> {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url?.split("?")[0] !== config.path) {
      writeJson(response, 404, { error: "not found" });
      return;
    }

    try {
      const event = JSON.parse(await readRequestBody(request)) as FeishuEventEnvelope;
      const result = await handler(event);
      writeJson(response, 200, result ?? { code: 0 });
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : "unknown error" });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.hostname, resolve);
  });
  console.log(`Feishu webhook listening on http://${config.hostname}:${config.port}${config.path}`);
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
