# Configuration Reference

The channel adapter reads one unified config file for opencode plus all channel adapters.

Default user-level locations:

```txt
~/.config/opencode/opencode-channel.json
~/.config/opencode/opencode-channel.jsonc
```

Both JSON and JSONC are supported. JSONC allows `//` and `/* ... */` comments.

## Load order

The first existing config file wins:

| Priority | Source |
|---:|---|
| 1 | CLI flag: `--config <path>` or `-c <path>` |
| 2 | Environment variable: `OPENCODE_CHANNEL_CONFIG` |
| 3 | `~/.config/opencode/opencode-channel.json` |
| 4 | `~/.config/opencode/opencode-channel.jsonc` |
| 5 | `./opencode-channel.jsonc` |
| 6 | `./opencode-channel.json` |
| 7 | `./.opencode-channel.jsonc` |
| 8 | `./.opencode-channel.json` |

After the file is loaded, environment variables override matching fields.

## Complete example

See [`opencode-channel.example.jsonc`](./opencode-channel.example.jsonc).

```jsonc
{
  "opencode": {
    "baseUrl": "http://127.0.0.1:4096",
    "password": "",
    "authHeader": "",
    "authToken": ""
  },
  "storage": {
    "sessionStore": "./sessions.json"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "",
      "allowedChatIds": [],
      "polling": {
        "timeoutSeconds": 30,
        "limit": 25
      }
    },
    "feishu": {
      "enabled": false,
      "appId": "",
      "appSecret": "",
      "encryptKey": "",
      "verificationToken": "",
      "allowedChatIds": [],
      "webhook": {
        "hostname": "127.0.0.1",
        "port": 3001,
        "path": "/feishu/events"
      }
    },
    "discord": {
      "enabled": false,
      "botToken": "",
      "applicationId": "",
      "allowedGuildIds": [],
      "allowedChannelIds": [],
      "ignoreBots": true
    }
  }
}
```

## Root fields

| Field | Type | Required | Default | Description |
|---|---|---:|---|---|
| `opencode` | object | No | `{}` | opencode server connection settings. |
| `storage` | object | No | `{}` | Local adapter persistence settings. |
| `channels` | object | No | `{}` | Per-channel settings. Known keys are `telegram`, `feishu`, and `discord`; extra keys are preserved for future adapters. |

## `opencode`

| Field | Type | Required | Default | Env override | Description |
|---|---|---:|---|---|---|
| `baseUrl` | string | No | `http://127.0.0.1:4096` | `OPENCODE_BASE_URL` | HTTP base URL for `opencode serve`. |
| `password` | string | No | unset | `OPENCODE_PASSWORD` | Preferred local Basic auth password. Sends `Authorization: Basic base64("opencode:<password>")`. |
| `authHeader` | string | No | unset | `OPENCODE_AUTH_HEADER` | Full custom Authorization header. Use for non-standard deployments. |
| `authToken` | string | No | unset | `OPENCODE_AUTH_TOKEN` | Legacy Bearer-token fallback. Prefer `password` or `authHeader`. |

Auth precedence at runtime:

1. `authHeader`
2. `password`
3. `authToken`

## `storage`

| Field | Type | Required | Default | Env override | Description |
|---|---|---:|---|---|---|
| `sessionStore` | string | No | `./sessions.json` | `CHANNEL_SESSION_STORE` | JSON file that stores channel thread → opencode session mappings and session → reply target mappings. |

## `channels.telegram`

| Field | Type | Required | Default | Env override | Description |
|---|---|---:|---|---|---|
| `enabled` | boolean | No | `true` in example | none | Reserved for future multi-channel runner selection. Current Telegram CLI assumes Telegram is the active channel. |
| `botToken` | string | Yes for Telegram CLI | unset | `TELEGRAM_BOT_TOKEN` | Telegram Bot API token from `@BotFather`. |
| `allowedChatIds` | string[] | No | `[]` | `TELEGRAM_ALLOWED_CHAT_IDS` as CSV | Optional allowlist. If set, updates from other chats are ignored. |
| `polling.timeoutSeconds` | number | No | Telegram API default via adapter | none | Long-poll timeout passed to Telegram `getUpdates`. Example uses `30`. |
| `polling.limit` | number | No | Telegram API default via adapter | none | Max updates per `getUpdates` call. Example uses `25`. |

Telegram session key format:

```txt
telegram:<chatId>:<threadId-or-default>
```

For Telegram forum topics, `message_thread_id` becomes `threadId`.

## `channels.feishu`

These fields configure the Feishu/Lark adapter.

| Field | Type | Required | Default | Description |
|---|---|---:|---|---|
| `enabled` | boolean | No | `false` in example | Reserved for multi-channel runner selection. |
| `appId` | string | Yes for Feishu CLI | unset | Feishu/Lark app ID. |
| `appSecret` | string | Yes for Feishu CLI | unset | Feishu/Lark app secret. Treat as secret. |
| `encryptKey` | string | No | unset | Event encryption key. Current adapter detects encrypted payloads but does not decrypt them yet. |
| `verificationToken` | string | No | unset | Webhook verification token. Treat as secret. |
| `allowedChatIds` | string[] | No | `[]` | Optional allowlist for Feishu chat IDs. |
| `webhook.hostname` | string | No | `127.0.0.1` | Hostname for the built-in webhook server. |
| `webhook.port` | number | No | `3001` | Port for the built-in webhook server. |
| `webhook.path` | string | No | `/feishu/events` | HTTP path for Feishu Event Callback POST requests. |

Recommended Feishu session key shape for the future adapter:

```txt
feishu:<chat_id>:<thread_id-or-root_message_id-or-default>
```

## `channels.discord`

These fields configure the Discord adapter.

| Field | Type | Required | Default | Description |
|---|---|---:|---|---|
| `enabled` | boolean | No | `false` in example | Reserved for multi-channel runner selection. |
| `botToken` | string | Yes for Discord CLI | unset | Discord bot token. Treat as secret. |
| `applicationId` | string | No | unset | Discord application/client ID. Reserved for future slash command registration. |
| `allowedGuildIds` | string[] | No | `[]` | Optional guild allowlist. |
| `allowedChannelIds` | string[] | No | `[]` | Optional channel allowlist. |
| `ignoreBots` | boolean | No | `true` | `DISCORD_IGNORE_BOTS` | Ignore messages from bot users. Set `false` only for controlled tests. |

Discord requires Gateway intents:

- `Guilds`
- `GuildMessages`
- `DirectMessages`
- `MessageContent`

Enable the Message Content intent in the Discord Developer Portal for the bot, otherwise message text will be empty.

Discord session key format:

```txt
discord:<channelId>:<threadId-or-default>
```

## Environment overrides

| Env var | Overrides |
|---|---|
| `OPENCODE_CHANNEL_CONFIG` | Config file path. |
| `OPENCODE_BASE_URL` | `opencode.baseUrl` |
| `OPENCODE_PASSWORD` | `opencode.password` |
| `OPENCODE_AUTH_HEADER` | `opencode.authHeader` |
| `OPENCODE_AUTH_TOKEN` | `opencode.authToken` |
| `CHANNEL_SESSION_STORE` | `storage.sessionStore` |
| `TELEGRAM_BOT_TOKEN` | `channels.telegram.botToken` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | `channels.telegram.allowedChatIds` as comma-separated values |
| `FEISHU_APP_ID` | `channels.feishu.appId` |
| `FEISHU_APP_SECRET` | `channels.feishu.appSecret` |
| `FEISHU_ENCRYPT_KEY` | `channels.feishu.encryptKey` |
| `FEISHU_VERIFICATION_TOKEN` | `channels.feishu.verificationToken` |
| `FEISHU_ALLOWED_CHAT_IDS` | `channels.feishu.allowedChatIds` as comma-separated values |
| `FEISHU_WEBHOOK_HOSTNAME` | `channels.feishu.webhook.hostname` |
| `FEISHU_WEBHOOK_PORT` | `channels.feishu.webhook.port` |
| `FEISHU_WEBHOOK_PATH` | `channels.feishu.webhook.path` |
| `DISCORD_BOT_TOKEN` | `channels.discord.botToken` |
| `DISCORD_APPLICATION_ID` | `channels.discord.applicationId` |
| `DISCORD_ALLOWED_GUILD_IDS` | `channels.discord.allowedGuildIds` as comma-separated values |
| `DISCORD_ALLOWED_CHANNEL_IDS` | `channels.discord.allowedChannelIds` as comma-separated values |
| `DISCORD_IGNORE_BOTS` | `channels.discord.ignoreBots`; truthy values are `1`, `true`, `yes`, `on` |

## Debug commands

These commands assume you installed the matching CLI globally, for example `npm install -g @opencode-channel/telegram@latest`.

Check config without connecting to Telegram:

```powershell
opencode-channel-telegram --check-config
```

Check Discord config without connecting to Discord:

```powershell
opencode-channel-discord --check-config
```

Check Feishu config without starting the webhook server:

```powershell
opencode-channel-feishu --check-config
```

Print the merged config with secrets redacted:

```powershell
opencode-channel-telegram --print-config
```

Use a non-default config file:

```powershell
opencode-channel-telegram --config .\path\to\opencode-channel.jsonc --check-config
```

## Secret handling

- Do not commit real `opencode-channel.json` or `opencode-channel.jsonc` files.
- Commit only `opencode-channel.example.jsonc`.
- Prefer environment variables for secrets in deployment.
- `--print-config` redacts known secret fields before printing.
