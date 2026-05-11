# opencode Channel Adapters

Lightweight channel adapter experiments for driving opencode from chat platforms.

The first target is Telegram. The design intentionally keeps the shared abstraction thin so Feishu/Lark, Discord, Slack, or other channels can be added later without turning opencode into a channel-first gateway.

## Architecture

```txt
Telegram / Feishu / ...
        │
        ▼
ChannelAdapter
  - normalize inbound events
  - resolve chat/thread target
  - send outbound messages
  - bridge permission requests
        │
        ▼
ChannelRuntime
  - resolve or create opencode session
  - store channel thread -> session mapping
  - call opencode prompt API
  - route opencode events back to channel targets
        │
        ▼
opencode server / SDK
```

This borrows OpenClaw's useful boundaries: channel owns platform semantics, while opencode owns agent sessions, prompts, tools, events, and permissions. It does not copy OpenClaw's full durable channel runtime.

`OpencodeHttpBridge` currently uses the official REST shape needed by external adapters:

- `POST /session`
- `POST /session/{sessionID}/prompt_async`
- `GET /event`
- `POST /permission/{requestID}/reply` with `{ "reply": "once" | "always" | "reject" }`

For a production adapter, the official `@opencode-ai/sdk/v2/client` can replace the HTTP bridge without changing channel adapters.

## Packages

- `packages/channel-core`
  - `ChannelAdapter` interface
  - normalized message/target/receipt types
  - `ChannelRuntime`
  - memory and JSON session stores
  - `OpencodeHttpBridge`
- `packages/channel-telegram`
  - Telegram Bot API wrapper
  - Telegram update normalization
  - Telegram `sendMessage`
  - Telegram inline permission buttons
  - Telegram approval/denial callback parsing
  - polling runner helper
- `packages/channel-discord`
  - Discord Gateway client using `discord.js`
  - Discord message normalization
  - Discord `channel.send` outbound replies
  - Discord permission approve/deny buttons
  - Discord CLI runner
- `packages/channel-feishu`
  - Feishu/Lark Event Callback webhook server
  - Feishu message event normalization
  - Feishu tenant access token client
  - Feishu text send/reply helpers
  - Feishu CLI runner

## Setup

Requirements:

- Node.js 20 or newer
- npm
- A running `opencode serve` process for live adapter use

```bash
npm install
npm run build
npm test
```

Copy `.env.example` to `.env` and configure:

```txt
TELEGRAM_BOT_TOKEN=123456:bot-token
OPENCODE_CHANNEL_CONFIG=
OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_PASSWORD=
OPENCODE_AUTH_HEADER=
OPENCODE_AUTH_TOKEN=
CHANNEL_SESSION_STORE=./sessions.json
TELEGRAM_ALLOWED_CHAT_IDS=12345,67890
```

See [`DEBUG.md`](./DEBUG.md) for PowerShell commands, Telegram bot setup, opencode auth, smoke tests, and troubleshooting.
See [`CONFIG.md`](./CONFIG.md) for the full config file reference.

## Repository layout

```txt
packages/channel-core       Shared adapter contracts, runtime, stores, and opencode HTTP bridge
packages/channel-telegram   Telegram Bot API adapter and polling CLI
packages/channel-discord    Discord gateway adapter and CLI
packages/channel-feishu     Feishu/Lark Event Callback webhook adapter and CLI
tests                       Runtime regression tests
```

Generated artifacts such as `dist/`, `*.tsbuildinfo`, `node_modules/`, local session stores, and local channel config files are intentionally ignored.

## Config file

The CLI can read a unified channel config file from the same user config area as opencode. The default user config paths are:

```txt
~/.config/opencode/opencode-channel.json
~/.config/opencode/opencode-channel.jsonc
```

JSON and JSONC are both supported. Copy the example first:

```powershell
New-Item -ItemType Directory -Force "$HOME\.config\opencode"
Copy-Item .\opencode-channel.example.jsonc "$HOME\.config\opencode\opencode-channel.jsonc"
```

Then fill in `channels.telegram.botToken` and any future channel settings. The loader checks these paths in order:

1. `--config <path>` / `-c <path>`
2. `OPENCODE_CHANNEL_CONFIG`
3. `~/.config/opencode/opencode-channel.json`
4. `~/.config/opencode/opencode-channel.jsonc`
5. `opencode-channel.jsonc`
6. `opencode-channel.json`
7. `.opencode-channel.jsonc`
8. `.opencode-channel.json`

Environment variables still override file values, which is useful for secrets in CI/deployment.

Example:

```powershell
npx opencode-channel-telegram
```

Validate or inspect the merged config without connecting to Telegram:

```powershell
npx opencode-channel-telegram --check-config
npx opencode-channel-telegram --print-config
```

For Discord, use the same config file and CLI pattern:

```powershell
npx opencode-channel-discord --check-config
npx opencode-channel-discord --print-config
npx opencode-channel-discord
```

For Feishu/Lark, configure `channels.feishu` and run:

```powershell
npx opencode-channel-feishu --check-config
npx opencode-channel-feishu --print-config
npx opencode-channel-feishu
```

The built-in Feishu webhook defaults to `http://127.0.0.1:3001/feishu/events`; expose it with a tunnel when configuring Feishu Event Callback in the developer console.

Telegram also supports session commands inside chat:

```txt
/session
/session current
/session list        # returns recent sessions + inline selection buttons
/session use <session_id>
/session new [title]
/session clear
```

This lets you inspect the currently bound opencode session for a chat/thread and switch later messages onto another existing session.

## Minimal Telegram usage

After building, run polling mode directly:

```bash
TELEGRAM_BOT_TOKEN=123456:bot-token \
OPENCODE_BASE_URL=http://127.0.0.1:4096 \
npx opencode-channel-telegram
```

Or use it as a library:

```ts
import { createTelegramPollingRuntime } from "@opencode-channel/telegram";

const runner = createTelegramPollingRuntime({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
  opencodeAuthToken: process.env.OPENCODE_AUTH_TOKEN,
  sessionStorePath: process.env.CHANNEL_SESSION_STORE ?? "./sessions.json",
  allowedChatIds: process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",").filter(Boolean),
});

await runner.start();
```

For webhook mode, keep the HTTP framework outside the adapter and call the runtime with the parsed Telegram update:

```ts
import { createTelegramRuntime } from "@opencode-channel/telegram";

const { runtime, handleUpdate } = createTelegramRuntime({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
  sessionStorePath: process.env.CHANNEL_SESSION_STORE ?? "./sessions.json",
});

await runtime.bindEvents();

// Express/Fastify/Hono/etc. handler body:
await handleUpdate(parsedTelegramUpdate);
```

## Session mapping

The default session key is:

```txt
channel:chatId:threadId
```

For Telegram forum topics, `message_thread_id` becomes `threadId`. For normal chats, `threadId` is `default`.

## Extension guide for Feishu/Lark

To add a new channel, implement the same small interface from `@opencode-channel/core`:

```ts
type ChannelAdapter = {
  id: string;
  normalizeInbound(event: unknown): Promise<NormalizedMessage | null>;
  resolveThreadTarget(message: NormalizedMessage): ChannelTarget;
  sendMessage(target: ChannelTarget, message: OutboundMessage): Promise<MessageReceipt>;
  sendPermissionRequest?(target: ChannelTarget, request: PermissionRequest): Promise<MessageReceipt>;
};
```

Feishu should map `chat_id + thread/root_message_id` to the core `chatId + threadId` model.

## Roadmap

1. Add concrete webhook examples for Express/Fastify/Hono using `createTelegramRuntime`.
2. Optionally switch Telegram transport internals to `grammy` for richer webhook/polling adapters while preserving the `ChannelAdapter` boundary.
3. Harden opencode event parsing for concrete message delta events (`message.part.delta`, `session.next.text.delta`) so Telegram receives streamed output instead of only simple message fields.
4. Add interactive Feishu card support for permission approval.
5. Expand tests for full SDK-v2-backed bridge behavior and webhook fixtures.

## Publishing to GitHub

Do this only after local verification passes:

```bash
git status
npm test
gh repo create opencode-channel-adapters --public --source=. --remote=origin --push
```

If publishing to an existing repository instead, add the remote and push normally:

```bash
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

No secrets should be committed. Keep `.env` untracked.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development workflow, documentation expectations, and pull request checklist.

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE) for details.
