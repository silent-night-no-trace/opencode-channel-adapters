# opencode Channel Adapters

[![CI](https://github.com/silent-night-no-trace/opencode-channel-adapters/actions/workflows/ci.yml/badge.svg)](https://github.com/silent-night-no-trace/opencode-channel-adapters/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/@opencode-channel/core?label=%40opencode-channel%2Fcore)](https://www.npmjs.com/package/@opencode-channel/core)
[![npm telegram](https://img.shields.io/npm/v/@opencode-channel/telegram?label=%40opencode-channel%2Ftelegram)](https://www.npmjs.com/package/@opencode-channel/telegram)
[![license](https://img.shields.io/npm/l/@opencode-channel/core)](./LICENSE)
[![node](https://img.shields.io/node/v/@opencode-channel/core)](https://www.npmjs.com/package/@opencode-channel/core)

Run [opencode](https://opencode.ai/) from Telegram, Discord, or Feishu/Lark.

The fastest path is to run the published npm packages directly. You do **not** need to clone this repository or run `npm install` unless you want to develop the adapters.

## Before you start

You need:

- Node.js 20 or newer.
- npm.
- `opencode` available in your shell.
- A bot/app credential for the chat platform you want to connect.

Check the local tools first:

```bash
node --version
npm --version
opencode --version
```

## Install an adapter CLI

Install the adapter for the chat platform you want to use:

| Channel | Install | CLI command |
|---|---|---|
| Telegram | `npm install -g @opencode-channel/telegram@latest` | `opencode-channel-telegram` |
| Discord | `npm install -g @opencode-channel/discord@latest` | `opencode-channel-discord` |
| Feishu/Lark | `npm install -g @opencode-channel/feishu@latest` | `opencode-channel-feishu` |

For example, install and check Telegram:

```bash
npm install -g @opencode-channel/telegram@latest
opencode-channel-telegram --help
```

## Telegram quick start

This is the shortest complete path for a new Telegram bot.

### 1. Start opencode

Run this in terminal 1:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Use an explicit port. `opencode serve` can otherwise choose a random port, which makes adapter configuration harder.

### 2. Create a Telegram bot

In Telegram:

1. Open `@BotFather`.
2. Send `/newbot`.
3. Copy the bot token. It looks like `123456:bot-token`.
4. Send one message to the new bot so Telegram creates an update for it.

### 3. Set environment variables

Run this in terminal 2.

macOS/Linux:

```bash
export TELEGRAM_BOT_TOKEN="123456:bot-token"
export OPENCODE_BASE_URL="http://127.0.0.1:4096"
```

PowerShell:

```powershell
$env:TELEGRAM_BOT_TOKEN = "123456:bot-token"
$env:OPENCODE_BASE_URL = "http://127.0.0.1:4096"
```

If your opencode server requires Basic auth, also set `OPENCODE_PASSWORD` in the same shell.

### 4. Validate config

```bash
opencode-channel-telegram --check-config
```

### 5. Clear Telegram webhook mode

Telegram bots cannot use webhook delivery and polling at the same time. This command is safe for a new bot too.

```bash
opencode-channel-telegram --delete-webhook
```

### 6. Start polling

```bash
opencode-channel-telegram
```

Keep terminal 1 and terminal 2 open. Send a message to your Telegram bot. The adapter forwards that message to opencode and sends the opencode response back to Telegram.

## Discord quick start

```bash
npm install -g @opencode-channel/discord@latest
opencode serve --hostname 127.0.0.1 --port 4096

export DISCORD_BOT_TOKEN="discord-bot-token"
export OPENCODE_BASE_URL="http://127.0.0.1:4096"

opencode-channel-discord --check-config
opencode-channel-discord
```

PowerShell users can set `$env:DISCORD_BOT_TOKEN` and `$env:OPENCODE_BASE_URL` instead.

## Feishu/Lark quick start

```bash
npm install -g @opencode-channel/feishu@latest
opencode serve --hostname 127.0.0.1 --port 4096

export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="app-secret"
export OPENCODE_BASE_URL="http://127.0.0.1:4096"

opencode-channel-feishu --check-config
opencode-channel-feishu
```

PowerShell users can set `$env:FEISHU_APP_ID`, `$env:FEISHU_APP_SECRET`, and `$env:OPENCODE_BASE_URL` instead.

The built-in Feishu webhook defaults to `http://127.0.0.1:3001/feishu/events`; expose it with a tunnel when configuring Feishu Event Callback in the developer console.

## Other install options

Install all adapter CLIs globally:

```bash
npm install -g @opencode-channel/telegram@latest
npm install -g @opencode-channel/discord@latest
npm install -g @opencode-channel/feishu@latest
```

If you install a package into a project instead of globally, run the local binary with `npx` from that project:

```bash
npm install @opencode-channel/telegram@latest
npx --no-install opencode-channel-telegram --help
```

## Configuration

Environment variables are the fastest way to try the adapters.

Common fields:

| Field | Purpose |
|---|---|
| `OPENCODE_BASE_URL` | HTTP URL for `opencode serve`, default `http://127.0.0.1:4096` |
| `OPENCODE_PASSWORD` | Optional opencode Basic auth password |
| `OPENCODE_AUTH_HEADER` | Optional full Authorization header override |
| `CHANNEL_SESSION_STORE` | Local session mapping file, default `./sessions.json` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Optional comma-separated chat allowlist |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | Feishu/Lark app credentials |

For repeatable local use, you can also use a JSONC config file:

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

Load order:

1. `--config <path>` / `-c <path>`
2. `OPENCODE_CHANNEL_CONFIG`
3. `~/.config/opencode/opencode-channel.json`
4. `~/.config/opencode/opencode-channel.jsonc`
5. `opencode-channel.jsonc` in the current directory
6. `opencode-channel.json` in the current directory
7. `.opencode-channel.jsonc` in the current directory
8. `.opencode-channel.json` in the current directory

Environment variables override file values, which is useful for secrets in deployments.

Important: the CLI does **not** automatically load `.env`. `.env.example` is only a template for your shell, process manager, or deployment platform.

For every field, see [`CONFIG.md`](./CONFIG.md).

## Build from source

Use this path only if you want to develop the adapters, inspect the source, or test local builds.

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

To make local workspace binaries available as commands during development:

```bash
npm link --workspace @opencode-channel/telegram
npm link --workspace @opencode-channel/discord
npm link --workspace @opencode-channel/feishu
```

Generated artifacts such as `dist/`, `*.tsbuildinfo`, `node_modules/`, local session stores, and local channel config files are intentionally ignored.

## Use as a library

Install the package for the adapter you want to embed:

```bash
npm install @opencode-channel/telegram@latest
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

Use `@opencode-channel/core` when implementing a new adapter or composing the runtime yourself.

## Telegram session commands

Telegram supports session commands inside chat:

```txt
/session
/session current
/session list
/session use <session_id>
/session new [title]
/session clear
```

This lets you inspect the currently bound opencode session for a chat/thread and switch later messages onto another existing session.

## Repository layout

```txt
packages/channel-core       Shared adapter contracts, runtime, stores, and opencode HTTP bridge
packages/channel-telegram   Telegram Bot API adapter and polling CLI
packages/channel-discord    Discord gateway adapter and CLI
packages/channel-feishu     Feishu/Lark Event Callback webhook adapter and CLI
tests                       Runtime regression tests
```

## Troubleshooting

- Telegram setup, chat IDs, webhook checks, debug logging, and polling conflicts: [`DEBUG.md`](./DEBUG.md)
- Full configuration reference: [`CONFIG.md`](./CONFIG.md)
- Security policy: [`SECURITY.md`](./SECURITY.md)
- Contributing guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## License

MIT
