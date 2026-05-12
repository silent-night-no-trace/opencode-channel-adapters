# opencode Channel Adapters

[![CI](https://github.com/silent-night-no-trace/opencode-channel-adapters/actions/workflows/ci.yml/badge.svg)](https://github.com/silent-night-no-trace/opencode-channel-adapters/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/@opencode-channel/core?label=%40opencode-channel%2Fcore)](https://www.npmjs.com/package/@opencode-channel/core)
[![npm telegram](https://img.shields.io/npm/v/@opencode-channel/telegram?label=%40opencode-channel%2Ftelegram)](https://www.npmjs.com/package/@opencode-channel/telegram)
[![license](https://img.shields.io/npm/l/@opencode-channel/core)](./LICENSE)
[![node](https://img.shields.io/node/v/@opencode-channel/core)](https://www.npmjs.com/package/@opencode-channel/core)

Run opencode from chat platforms. This repository contains channel adapters for Telegram, Discord, and Feishu/Lark, plus a shared core runtime.

The quickest way to try it is to run a published npm package with `npx -y -p`. If you want to change code or test local builds, clone the repository and build from source.

## Choose your path

| Goal | Start here |
|---|---|
| Run an adapter without cloning this repo | [Use published npm packages](#use-published-npm-packages) |
| Install CLI commands permanently | [Install CLI packages](#install-cli-packages) |
| Build, test, or modify the adapters | [Build from source](#build-from-source) |
| Use the adapters as libraries | [Use as a library](#use-as-a-library) |
| Configure every field | [`CONFIG.md`](./CONFIG.md) |
| Debug Telegram locally | [`DEBUG.md`](./DEBUG.md) |

## Requirements

- Node.js 20 or newer
- npm
- A running opencode HTTP server for live adapter use
- Credentials for the chat platform you want to connect

Start opencode in another terminal:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Use an explicit port. `opencode serve` can otherwise choose a random port, which makes adapter configuration harder.

## Use published npm packages

Packages are published under the `@opencode-channel` npm scope:

| Package | CLI binary | Purpose |
|---|---|---|
| `@opencode-channel/telegram` | `opencode-channel-telegram` | Telegram polling adapter |
| `@opencode-channel/discord` | `opencode-channel-discord` | Discord gateway adapter |
| `@opencode-channel/feishu` | `opencode-channel-feishu` | Feishu/Lark webhook adapter |
| `@opencode-channel/core` | none | Shared runtime and library APIs |

Because the packages are scoped but the CLI binaries are unscoped, the clearest one-off command form is:

```bash
npx -y -p @opencode-channel/telegram opencode-channel-telegram --help
npx -y -p @opencode-channel/discord opencode-channel-discord --help
npx -y -p @opencode-channel/feishu opencode-channel-feishu --help
```

### Run Telegram from npm

1. Start opencode:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

2. Set credentials in the same shell that will run the adapter:

```bash
export TELEGRAM_BOT_TOKEN="123456:bot-token"
export OPENCODE_BASE_URL="http://127.0.0.1:4096"
```

PowerShell:

```powershell
$env:TELEGRAM_BOT_TOKEN = "123456:bot-token"
$env:OPENCODE_BASE_URL = "http://127.0.0.1:4096"
```

3. Validate config without connecting to Telegram:

```bash
npx -y -p @opencode-channel/telegram opencode-channel-telegram --check-config
```

4. If this Telegram bot previously used a webhook, clear it before polling:

```bash
npx -y -p @opencode-channel/telegram opencode-channel-telegram --delete-webhook
```

5. Start polling:

```bash
npx -y -p @opencode-channel/telegram opencode-channel-telegram
```

For Telegram bot setup, chat IDs, webhook checks, debug logging, and polling conflicts, see [`DEBUG.md`](./DEBUG.md).

### Run Discord from npm

```bash
opencode serve --hostname 127.0.0.1 --port 4096

export DISCORD_BOT_TOKEN="discord-bot-token"
export OPENCODE_BASE_URL="http://127.0.0.1:4096"

npx -y -p @opencode-channel/discord opencode-channel-discord --check-config
npx -y -p @opencode-channel/discord opencode-channel-discord
```

PowerShell users can set `$env:DISCORD_BOT_TOKEN` and `$env:OPENCODE_BASE_URL` instead.

### Run Feishu/Lark from npm

```bash
opencode serve --hostname 127.0.0.1 --port 4096

export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="app-secret"
export OPENCODE_BASE_URL="http://127.0.0.1:4096"

npx -y -p @opencode-channel/feishu opencode-channel-feishu --check-config
npx -y -p @opencode-channel/feishu opencode-channel-feishu
```

PowerShell users can set `$env:FEISHU_APP_ID`, `$env:FEISHU_APP_SECRET`, and `$env:OPENCODE_BASE_URL` instead.

The built-in Feishu webhook defaults to `http://127.0.0.1:3001/feishu/events`; expose it with a tunnel when configuring Feishu Event Callback in the developer console.

## Install CLI packages

For repeated use, install the adapter CLI package globally:

```bash
npm install -g @opencode-channel/telegram
opencode-channel-telegram --help
opencode-channel-telegram --check-config
opencode-channel-telegram
```

Or install an adapter in your own project and run it through that project's `node_modules/.bin`:

```bash
npm install @opencode-channel/telegram
npx opencode-channel-telegram --help
```

Install the package for the channel you need:

```bash
npm install -g @opencode-channel/telegram
npm install -g @opencode-channel/discord
npm install -g @opencode-channel/feishu
```

## Configure with a JSONC file

Shell environment variables are the fastest way to try the adapters. For repeatable local use, copy the example config into opencode's config directory:

```bash
mkdir -p ~/.config/opencode
cp opencode-channel.example.jsonc ~/.config/opencode/opencode-channel.jsonc
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.config\opencode"
Copy-Item .\opencode-channel.example.jsonc "$HOME\.config\opencode\opencode-channel.jsonc"
```

Then fill in the channel credentials in that JSONC file.

You can also point at any config file explicitly:

```bash
npx -y -p @opencode-channel/telegram opencode-channel-telegram --config ./opencode-channel.example.jsonc --check-config
```

The loader checks config sources in this order:

1. `--config <path>` / `-c <path>`
2. `OPENCODE_CHANNEL_CONFIG`
3. `~/.config/opencode/opencode-channel.json`
4. `~/.config/opencode/opencode-channel.jsonc`
5. `opencode-channel.jsonc`
6. `opencode-channel.json`
7. `.opencode-channel.jsonc`
8. `.opencode-channel.json`

Environment variables still override file values, which is useful for deployment secrets.

Important: the CLI does not automatically load `.env`. `.env.example` is a template for your own shell, process manager, or deployment platform.

For every field, see [`CONFIG.md`](./CONFIG.md).

## Build from source

Use this path if you want to develop the adapters, inspect the source, run tests, or use local package builds instead of the published npm packages.

```bash
git clone https://github.com/silent-night-no-trace/opencode-channel-adapters.git
cd opencode-channel-adapters
npm install
npm run build
npm test
```

Run local CLIs from the repository root after building:

```bash
node packages/channel-telegram/dist/cli.js --help
node packages/channel-telegram/dist/cli.js --check-config
node packages/channel-telegram/dist/cli.js
```

Discord and Feishu/Lark use the same pattern:

```bash
node packages/channel-discord/dist/cli.js --check-config
node packages/channel-discord/dist/cli.js

node packages/channel-feishu/dist/cli.js --check-config
node packages/channel-feishu/dist/cli.js
```

To make the local binaries available as commands during development, use npm workspace links:

```bash
npm link --workspace @opencode-channel/telegram
npm link --workspace @opencode-channel/discord
npm link --workspace @opencode-channel/feishu
```

Then run:

```bash
opencode-channel-telegram --help
```

Generated artifacts such as `dist/`, `*.tsbuildinfo`, `node_modules/`, local session stores, and local channel config files are intentionally ignored.

## Use as a library

Install the package for the adapter you want to embed:

```bash
npm install @opencode-channel/telegram
```

Run Telegram polling from code:

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

Use `@opencode-channel/core` when implementing a new adapter or composing the runtime yourself.

## Architecture

```txt
Telegram / Feishu / Discord / ...
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

Channel packages own platform semantics. opencode owns agent sessions, prompts, tools, events, and permissions. The shared abstraction stays intentionally thin so new channels can be added without turning opencode into a channel-first gateway.

`OpencodeHttpBridge` currently uses the REST shape needed by external adapters:

- `POST /session`
- `POST /session/{sessionID}/prompt_async`
- `GET /event`
- `POST /permission/{requestID}/reply` with `{ "reply": "once" | "always" | "reject" }`

For a production adapter, the official `@opencode-ai/sdk/v2/client` can replace the HTTP bridge without changing channel adapters.

## Repository layout

```txt
packages/channel-core       Shared adapter contracts, runtime, stores, and opencode HTTP bridge
packages/channel-telegram   Telegram Bot API adapter and polling CLI
packages/channel-discord    Discord gateway adapter and CLI
packages/channel-feishu     Feishu/Lark Event Callback webhook adapter and CLI
tests                       Runtime regression tests
```

## Telegram session commands

Telegram supports session commands inside chat:

```txt
/session
/session current
/session list        # returns recent sessions + inline selection buttons
/session use <session_id>
/session new [title]
/session clear
```

This lets you inspect the currently bound opencode session for a chat/thread and switch later messages onto another existing session.

## Session mapping

The default session key is:

```txt
channel:chatId:threadId
```

For Telegram forum topics, `message_thread_id` becomes `threadId`. For normal chats, `threadId` is `default`.

## Extension guide

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

Feishu maps `chat_id + thread/root_message_id` to the core `chatId + threadId` model. Other channels should preserve the same channel/chat/thread/session boundary.

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

## Publishing npm packages

Before publishing, verify the package contents and tests:

```bash
npm test
npm pack --dry-run --workspaces
```

Publish `@opencode-channel/core` first, then the adapter packages because they depend on the matching core version:

```bash
npm publish --workspace @opencode-channel/core
npm publish --workspace @opencode-channel/telegram
npm publish --workspace @opencode-channel/discord
npm publish --workspace @opencode-channel/feishu
```

The packages are scoped public packages, so each workspace package sets `publishConfig.access` to `public`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development workflow, documentation expectations, and pull request checklist.

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE) for details.
