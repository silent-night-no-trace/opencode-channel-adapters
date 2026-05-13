import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChannelRuntime,
  JsonFileSessionStore,
  loadChannelConfig,
  mergeConfigWithEnv,
  MemorySessionStore,
  OpencodeHttpBridge,
  redactConfig,
  findConfigPath,
  resolveTelegramRuntimeConfig,
  resolveDiscordRuntimeConfig,
  resolveFeishuRuntimeConfig,
} from "../packages/channel-core/dist/index.js";
import { TelegramAdapter } from "../packages/channel-telegram/dist/index.js";
import { TelegramApi, isTelegramGetUpdatesConflict } from "../packages/channel-telegram/dist/index.js";
import { DiscordAdapter } from "../packages/channel-discord/dist/index.js";
import { FeishuAdapter, FeishuApi } from "../packages/channel-feishu/dist/index.js";

await testTelegramNormalization();
await testDiscordNormalization();
await testFeishuNormalization();
await testSessionStorePersistsTargets();
await testRuntimeRoutesEventsToAdapter();
await testPermissionCallback();
await testTelegramSessionSelectionCallback();
await testTelegramPollingConflictDetection();
await testOpencodeHttpBridgeShapes();
await testOpencodeHttpBridgeUsesLongPromptDispatcher();
await testOpencodeHttpBridgeWaitsForSlowPromptHeaders();
await testFeishuApiShapes();
await testConfigFileAndEnvMerge();
await testDefaultConfigHomePrecedence();

console.log("channel runtime tests passed");

async function testTelegramNormalization() {
  const adapter = new TelegramAdapter({ botToken: "token", allowedChatIds: ["100"] });
  const message = await adapter.normalizeInbound({
    update_id: 1,
    message: {
      message_id: 10,
      message_thread_id: 20,
      from: { id: 30, first_name: "Dev" },
      chat: { id: 100, type: "supergroup" },
      text: "hello opencode",
    },
  });

  assert.ok(message);
  assert.equal(message.channel, "telegram");
  assert.equal(message.chatId, "100");
  assert.equal(message.threadId, "20");
  assert.equal(message.userId, "30");
  assert.equal(message.text, "hello opencode");
  assert.equal(message.dedupeId, "telegram:1");
}

async function testDiscordNormalization() {
  const adapter = new DiscordAdapter({ botToken: "token", allowedChannelIds: ["channel-1"] });
  const message = await adapter.normalizeInbound({
    id: "message-1",
    channelId: "channel-1",
    guildId: "guild-1",
    content: "hello discord",
    author: { id: "user-1", bot: false },
    channel: { type: 0 },
  });

  assert.ok(message);
  assert.equal(message.channel, "discord");
  assert.equal(message.chatId, "channel-1");
  assert.equal(message.userId, "user-1");
  assert.equal(message.messageId, "message-1");
  assert.equal(message.text, "hello discord");
  assert.equal(message.dedupeId, "discord:message-1");
}

async function testFeishuNormalization() {
  const adapter = new FeishuAdapter({
    appId: "app-id",
    appSecret: "secret",
    verificationToken: "token",
    allowedChatIds: ["chat-1"],
  });
  const message = await adapter.normalizeInbound({
    schema: "2.0",
    header: { event_id: "event-1", event_type: "im.message.receive_v1", token: "token" },
    event: {
      sender: { sender_id: { open_id: "open-user-1" } },
      message: {
        message_id: "message-1",
        chat_id: "chat-1",
        message_type: "text",
        content: JSON.stringify({ text: "hello feishu" }),
      },
    },
  });

  assert.ok(message);
  assert.equal(message.channel, "feishu");
  assert.equal(message.chatId, "chat-1");
  assert.equal(message.userId, "open-user-1");
  assert.equal(message.messageId, "message-1");
  assert.equal(message.text, "hello feishu");
  assert.equal(message.dedupeId, "feishu:event-1");
}

async function testSessionStorePersistsTargets() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-channel-"));
  const path = join(dir, "sessions.json");
  try {
    const store = new JsonFileSessionStore(path);
    await store.set("telegram:100:20", "session-1");
    await store.setTarget("session-1", {
      channel: "telegram",
      chatId: "100",
      threadId: "20",
      replyToMessageId: "10",
    });

    const reloaded = new JsonFileSessionStore(path);
    assert.equal(await reloaded.get("telegram:100:20"), "session-1");
    assert.deepEqual(await reloaded.getTarget("session-1"), {
      channel: "telegram",
      chatId: "100",
      threadId: "20",
      replyToMessageId: "10",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function testRuntimeRoutesEventsToAdapter() {
  const sent = [];
  const adapter = {
    id: "test",
    async normalizeInbound() {
      return {
        channel: "test",
        chatId: "chat-1",
        userId: "user-1",
        messageId: "msg-1",
        text: "run",
        target: { channel: "test", chatId: "chat-1", replyToMessageId: "msg-1" },
        raw: {},
      };
    },
    resolveThreadTarget(message) {
      return message.target;
    },
    async sendMessage(target, message) {
      sent.push({ target, message });
      return {
        channel: target.channel,
        chatId: target.chatId,
        messageId: "sent-1",
        sentAt: new Date(),
      };
    },
  };
  const bridge = {
    async createSession() {
      return "session-1";
    },
    async prompt() {
      return { text: "sync reply", raw: {} };
    },
    async getSession(sessionId) {
      return { id: sessionId, title: "existing", raw: {} };
    },
    async listSessions() {
      return [{ id: "session-1", title: "existing", raw: {} }];
    },
  };
  const runtime = new ChannelRuntime({
    adapter,
    opencode: bridge,
    sessionStore: new MemorySessionStore(),
  });

  await runtime.handleInbound({});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.text, "sync reply");
  await runtime.handleOpencodeEvent({
    type: "message",
    sessionId: "session-1",
    message: "done",
    raw: {},
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].target.chatId, "chat-1");
  assert.equal(sent[0].message.text, "sync reply");

  const controlMessage = {
    channel: "test",
    chatId: "chat-1",
    userId: "user-1",
    messageId: "msg-2",
    text: "switch",
    target: { channel: "test", chatId: "chat-1", replyToMessageId: "msg-2" },
    raw: {},
  };
  await runtime.bindSession(controlMessage, "session-2");
  assert.equal(await runtime.getCurrentSession(controlMessage), "session-2");
  assert.equal((await runtime.getSession("session-2")).title, "existing");
  assert.equal((await runtime.listSessions(10))[0].id, "session-1");
  await runtime.clearSession(controlMessage);
  assert.equal(await runtime.getCurrentSession(controlMessage), undefined);
}

async function testPermissionCallback() {
  const calls = [];
  const adapter = new TelegramAdapter({
    botToken: "token",
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const response = await adapter.normalizePermissionResponse({
    update_id: 2,
    callback_query: {
      id: "callback-1",
      from: { id: 30, first_name: "Dev" },
      data: "opencode:permission:perm-1:approve",
      message: {
        message_id: 10,
        chat: { id: 100, type: "supergroup" },
        text: "Permission?",
      },
    },
  });

  assert.ok(response);
  assert.equal(response.permissionId, "perm-1");
  assert.equal(response.choice, "once");
  assert.equal(calls[0].callback_query_id, "callback-1");
}

async function testTelegramSessionSelectionCallback() {
  const calls = [];
  const adapter = new TelegramAdapter({
    botToken: "token",
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 99, chat: { id: 100, type: "private" } } }), { status: 200 });
    },
  });

  const selection = await adapter.handleSessionSelectionCallback({
    update_id: 3,
    callback_query: {
      id: "callback-2",
      from: { id: 30, first_name: "Dev" },
      data: "opencode:session:use:ses_test123",
      message: {
        message_id: 11,
        chat: { id: 100, type: "private" },
        text: "Choose session",
      },
    },
  });

  assert.ok(selection);
  assert.equal(selection.sessionId, "ses_test123");
  assert.equal(selection.target.chatId, "100");
  assert.equal(calls[0].callback_query_id, "callback-2");
}

async function testTelegramPollingConflictDetection() {
  const api = new TelegramApi("token", async () => new Response(JSON.stringify({
    ok: false,
    description: "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running",
  }), { status: 409 }));

  await assert.rejects(
    () => api.getUpdates(),
    (error) => isTelegramGetUpdatesConflict(error),
  );
}

async function testOpencodeHttpBridgeShapes() {
  const calls = [];
  const encoder = new TextEncoder();
  const bridge = new OpencodeHttpBridge({
    baseUrl: "http://opencode.local",
    authToken: "secret",
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      if (String(url).endsWith("/session?limit=5")) {
        return jsonResponse([{ id: "session-1", title: "chat" }]);
      }
      if (String(url).endsWith("/session/session-1")) {
        return jsonResponse({ id: "session-1", title: "chat" });
      }
      if (String(url).endsWith("/session")) {
        return jsonResponse({ id: "session-1" });
      }
      if (String(url).endsWith("/session/session-1/message")) {
        return jsonResponse({
          info: { content: "sync response" },
          parts: [{ type: "text", text: "sync response" }],
        });
      }
      if (String(url).endsWith("/event")) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"type":"message","sessionId":"session-1","message":"ok"}\n\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      return jsonResponse({ ok: true });
    },
  });

  assert.equal(await bridge.createSession({ title: "chat" }), "session-1");
  const promptResult = await bridge.prompt({ sessionId: "session-1", text: "hello" });
  await bridge.replyPermission("permission-1", "once");

  const events = [];
  await bridge.subscribe((event) => {
    events.push(event);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls[0].url, "http://opencode.local/session");
  assert.equal(calls[0].headers.authorization, "Bearer secret");
  assert.equal(calls[1].url, "http://opencode.local/session/session-1/message");
  assert.deepEqual(calls[1].body, { parts: [{ type: "text", text: "hello" }] });
  assert.equal(promptResult.text, "sync response");
  assert.equal(calls[2].url, "http://opencode.local/permission/permission-1/reply");
  assert.deepEqual(calls[2].body, { reply: "once" });
  assert.equal((await bridge.getSession("session-1")).title, "chat");
  assert.equal((await bridge.listSessions(5))[0].id, "session-1");
  assert.equal(events[0].message, "ok");

  const partEvents = [];
  const partBridge = new OpencodeHttpBridge({
    baseUrl: "http://opencode.local",
    fetchImpl: async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"message.part.updated","properties":{"part":{"type":"text","sessionID":"session-1","text":"hello from part"}}}\n\n'));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  });
  await partBridge.subscribe((event) => {
    partEvents.push(event);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(partEvents[0].message, "hello from part");

  const permissionEvents = [];
  const permissionBridge = new OpencodeHttpBridge({
    baseUrl: "http://opencode.local",
    fetchImpl: async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"permission.asked","properties":{"id":"perm-2","sessionID":"session-1","permission":"file_edit","patterns":["src/**/*.ts"]}}\n\n'));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  });
  await permissionBridge.subscribe((event) => {
    permissionEvents.push(event);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(permissionEvents[0].permissionRequest.id, "perm-2");
  assert.equal(permissionEvents[0].permissionRequest.sessionId, "session-1");
  assert.equal(permissionEvents[0].permissionRequest.permission, "file_edit");

  const basicCalls = [];
  const basicBridge = new OpencodeHttpBridge({
    baseUrl: "http://opencode.local",
    password: "pw",
    fetchImpl: async (url, init) => {
      basicCalls.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      return jsonResponse({ id: "session-basic" });
    },
  });
  assert.equal(await basicBridge.createSession({ title: "basic" }), "session-basic");
  assert.equal(basicCalls[0].headers.authorization, `Basic ${Buffer.from("opencode:pw").toString("base64")}`);
}

async function testOpencodeHttpBridgeUsesLongPromptDispatcher() {
  const calls = [];
  const bridge = new OpencodeHttpBridge({
    baseUrl: "http://opencode.local",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), dispatcher: init?.dispatcher });
      return jsonResponse({
        info: { content: "slow response" },
        parts: [{ type: "text", text: "slow response" }],
      });
    },
  });

  const result = await bridge.prompt({ sessionId: "session-1", text: "slow prompt" });

  assert.equal(result.text, "slow response");
  assert.equal(calls[0].url, "http://opencode.local/session/session-1/message");
  assert.equal(typeof calls[0].dispatcher?.dispatch, "function");
}

async function testOpencodeHttpBridgeWaitsForSlowPromptHeaders() {
  const server = http.createServer((request, response) => {
    if (request.url === "/session/session-1/message") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ parts: [{ type: "text", text: "slow response" }] }));
      }, 1100);
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const bridge = new OpencodeHttpBridge({ baseUrl: `http://127.0.0.1:${address.port}` });

    const result = await bridge.prompt({ sessionId: "session-1", text: "slow prompt" });

    assert.equal(result.text, "slow response");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function testFeishuApiShapes() {
  const calls = [];
  const api = new FeishuApi({
    appId: "app-id",
    appSecret: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).includes("tenant_access_token")) {
        return jsonResponse({ code: 0, tenant_access_token: "tenant-token", expire: 7200 });
      }
      return jsonResponse({ code: 0, data: { message_id: "sent-message" } });
    },
  });

  assert.equal(await api.sendText("chat-1", "hello"), "sent-message");
  assert.equal(await api.replyText("message-1", "reply"), "sent-message");
  assert.equal(calls[0].url, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal");
  assert.deepEqual(calls[0].body, { app_id: "app-id", app_secret: "secret" });
  assert.equal(calls[1].url, "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id");
  assert.deepEqual(calls[1].body, {
    receive_id: "chat-1",
    msg_type: "text",
    content: JSON.stringify({ text: "hello" }),
  });
  assert.equal(calls[2].url, "https://open.feishu.cn/open-apis/im/v1/messages/message-1/reply");
  assert.deepEqual(calls[2].body, {
    msg_type: "text",
    content: JSON.stringify({ text: "reply" }),
  });
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function testConfigFileAndEnvMerge() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-channel-config-"));
  const path = join(dir, "opencode-channel.jsonc");
  try {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path, `{
      // JSONC comments are allowed
      "opencode": { "baseUrl": "http://file:4096", "password": "file-password" },
      "storage": { "sessionStore": "./file-sessions.json" },
      "channels": {
        "telegram": { "botToken": "file-token", "allowedChatIds": ["1"] },
        "feishu": { "enabled": false, "appId": "future" },
        "discord": { "enabled": false, "applicationId": "future" }
      }
    }`, "utf8"));

    const loaded = await loadChannelConfig({ configPath: path, cwd: dir });
    const merged = mergeConfigWithEnv(loaded.config, {
      OPENCODE_BASE_URL: "http://env:4096",
      TELEGRAM_BOT_TOKEN: "env-token",
      TELEGRAM_ALLOWED_CHAT_IDS: "2,3",
    });
    const runtime = resolveTelegramRuntimeConfig(merged);
    const discordRuntime = resolveDiscordRuntimeConfig(mergeConfigWithEnv(loaded.config, {
      DISCORD_BOT_TOKEN: "discord-env-token",
      DISCORD_APPLICATION_ID: "discord-app",
      DISCORD_ALLOWED_GUILD_IDS: "guild-1,guild-2",
      DISCORD_ALLOWED_CHANNEL_IDS: "channel-1",
      DISCORD_IGNORE_BOTS: "false",
    }));
    const feishuRuntime = resolveFeishuRuntimeConfig(mergeConfigWithEnv(loaded.config, {
      FEISHU_APP_ID: "feishu-app",
      FEISHU_APP_SECRET: "feishu-secret",
      FEISHU_VERIFICATION_TOKEN: "feishu-token",
      FEISHU_ALLOWED_CHAT_IDS: "chat-1,chat-2",
      FEISHU_WEBHOOK_HOSTNAME: "0.0.0.0",
      FEISHU_WEBHOOK_PORT: "3002",
      FEISHU_WEBHOOK_PATH: "/events/feishu",
    }));

    assert.equal(loaded.path, path);
    assert.equal(runtime.botToken, "env-token");
    assert.equal(runtime.opencodeBaseUrl, "http://env:4096");
    assert.deepEqual(runtime.allowedChatIds, ["2", "3"]);
    assert.equal(runtime.sessionStorePath, "./file-sessions.json");
    assert.equal(discordRuntime.botToken, "discord-env-token");
    assert.equal(discordRuntime.applicationId, "discord-app");
    assert.deepEqual(discordRuntime.allowedGuildIds, ["guild-1", "guild-2"]);
    assert.deepEqual(discordRuntime.allowedChannelIds, ["channel-1"]);
    assert.equal(discordRuntime.ignoreBots, false);
    assert.equal(feishuRuntime.appId, "feishu-app");
    assert.equal(feishuRuntime.appSecret, "feishu-secret");
    assert.equal(feishuRuntime.verificationToken, "feishu-token");
    assert.deepEqual(feishuRuntime.allowedChatIds, ["chat-1", "chat-2"]);
    assert.equal(feishuRuntime.webhookHostname, "0.0.0.0");
    assert.equal(feishuRuntime.webhookPort, 3002);
    assert.equal(feishuRuntime.webhookPath, "/events/feishu");
    const redacted = redactConfig(merged);
    assert.equal(redacted.channels.telegram.botToken, "env-***oken");
    assert.equal(redacted.opencode.password, "file***word");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function testDefaultConfigHomePrecedence() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-channel-home-"));
  const cwd = join(dir, "project");
  const configHome = join(dir, ".config", "opencode");
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(cwd, { recursive: true });
    await mkdir(configHome, { recursive: true });
    const userJson = join(configHome, "opencode-channel.json");
    const userJsonc = join(configHome, "opencode-channel.jsonc");
    const projectJsonc = join(cwd, "opencode-channel.jsonc");
    await writeFile(userJson, '{"channels":{"telegram":{"botToken":"user-json"}}}', "utf8");
    await writeFile(userJsonc, '{"channels":{"telegram":{"botToken":"user-jsonc"}}}', "utf8");
    await writeFile(projectJsonc, '{"channels":{"telegram":{"botToken":"project-jsonc"}}}', "utf8");

    assert.equal(await findConfigPath(cwd, configHome), userJson);
    const loaded = await loadChannelConfig({ cwd, configHome });
    assert.equal(loaded.path, userJson);
    assert.equal(resolveTelegramRuntimeConfig(loaded.config).botToken, "user-json");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
