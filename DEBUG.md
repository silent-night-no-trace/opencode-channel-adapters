# Local Debug Guide

This guide connects the current Telegram adapter to a running opencode server and a Telegram bot.

For every config field, see [`CONFIG.md`](./CONFIG.md).

## 1. Verify the adapter locally

```powershell
npm install
npm test
```

Expected result:

```txt
channel runtime tests passed
```

## 2. Start or identify an opencode server

Run opencode in server mode in a separate terminal, or point the adapter at an existing server.

`OPENCODE_BASE_URL` is the HTTP address of that opencode server. It is not a Telegram URL. The Telegram adapter talks to Telegram through `TELEGRAM_BOT_TOKEN`, then talks to opencode through this base URL.

The value `http://127.0.0.1:4096` means: "connect to an opencode server running on this same machine, listening on port 4096." If your opencode server runs on another port or another machine, use that address instead.

For local debugging, start opencode as a headless HTTP server in a separate PowerShell window:

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
```

Important: `opencode serve` defaults to `--port 0`, which means a random free port. Use `--port 4096` so `OPENCODE_BASE_URL=http://127.0.0.1:4096` stays stable.

The adapter defaults to:

```txt
OPENCODE_BASE_URL=http://127.0.0.1:4096
```

Smoke-test the server from PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:4096/session" `
  -ContentType "application/json" `
  -Body '{"title":"telegram debug"}'
```

If the server uses opencode Basic auth, prefer:

```powershell
$env:OPENCODE_PASSWORD = "your-opencode-password"
```

The bridge sends:

```txt
Authorization: Basic base64("opencode:<password>")
```

For custom deployments, set the full header directly:

```powershell
$env:OPENCODE_AUTH_HEADER = "Basic <base64-value>"
```

## 3. Create and prepare a Telegram bot

1. Open Telegram and talk to `@BotFather`.
2. Run `/newbot` and copy the token.
3. If this bot previously used webhooks, clear the webhook before polling:

```powershell
$token = "123456:bot-token"
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/deleteWebhook"
```

4. Send a message to the bot once. For group testing, add the bot to the group and send a message mentioning it if privacy mode is enabled.

To discover chat IDs, use:

```powershell
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/getUpdates"
```

Look for:

```txt
result[].message.chat.id
```

Then optionally restrict the adapter:

```powershell
$env:TELEGRAM_ALLOWED_CHAT_IDS = "123456789,-1001234567890"
```

Run the built-in Telegram doctor before polling:

```powershell
npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --doctor
```

If `url` is not empty, Telegram is still configured for webhook delivery and long polling will not receive messages. Clear it with:

```powershell
npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --delete-webhook
```

If you want to drop old pending updates as well:

```powershell
npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --delete-webhook --drop-pending-updates
```

## 4. Run the Telegram adapter in polling mode

Build first:

```powershell
npm run build
```

You can configure the adapter with a file instead of only environment variables:

```powershell
New-Item -ItemType Directory -Force "$HOME\.config\opencode"
Copy-Item .\opencode-channel.example.jsonc "$HOME\.config\opencode\opencode-channel.jsonc"
notepad "$HOME\.config\opencode\opencode-channel.jsonc"
node packages/channel-telegram/dist/cli.js --check-config
node packages/channel-telegram/dist/cli.js --print-config
node packages/channel-telegram/dist/cli.js
```

The same config file can hold future `channels.feishu` and `channels.discord` settings. The default location is `~/.config/opencode/opencode-channel.json` or `~/.config/opencode/opencode-channel.jsonc`; commit only `opencode-channel.example.jsonc`.

For Discord, fill `channels.discord.botToken`, enable the Message Content intent in the Discord Developer Portal, then run:

```powershell
node packages/channel-discord/dist/cli.js --check-config
node packages/channel-discord/dist/cli.js
```

For Feishu/Lark, fill `channels.feishu.appId`, `channels.feishu.appSecret`, and optionally `channels.feishu.verificationToken`, then run:

```powershell
node packages/channel-feishu/dist/cli.js --check-config
node packages/channel-feishu/dist/cli.js
```

The Feishu webhook server defaults to `http://127.0.0.1:3001/feishu/events`. Use a tunnel such as ngrok/cloudflared for local Event Callback debugging.

Set env vars:

```powershell
$env:TELEGRAM_BOT_TOKEN = "123456:bot-token"
$env:OPENCODE_BASE_URL = "http://127.0.0.1:4096"
$env:CHANNEL_SESSION_STORE = ".\sessions.json"
```

If auth is enabled:

```powershell
$env:OPENCODE_PASSWORD = "your-opencode-password"
```

Start:

```powershell
node packages/channel-telegram/dist/cli.js --debug
```

Expected output:

```txt
Starting opencode Telegram channel adapter...
Debug logging enabled
```

Now send a plain text message to the bot. The adapter should:

1. receive the Telegram update through `getUpdates`,
2. normalize it to `NormalizedMessage`,
3. create or reuse an opencode session,
4. call `POST /session/{sessionID}/prompt_async`,
5. listen to `/event`,
6. route simple message events back to the original Telegram chat/thread.

The session mapping is persisted in `sessions.json`.

Telegram session commands:

```txt
/session              # show current bound session
/session current      # same as above
/session list         # show recent opencode sessions + inline buttons
/session use <id>     # bind this chat/thread to an existing session
/session new [title]  # create and bind a fresh session
/session clear        # clear binding; next normal message creates a new session
```

`/session list` now sends inline buttons. Tapping a button binds the current Telegram chat/thread to that session without manually copying the session ID.

In your current example, the active session is the one printed by the debug log:

```txt
ses_1edab567dffenPacdnmvdY57u9
```

Because this is a private chat, the binding key is effectively:

```txt
telegram:8297539765:default
```

and that key is currently mapped to the session above.

With `--debug`, every Telegram update and handler result is printed. If you send a message and no `[telegram] update ...` line appears, the problem is before opencode: webhook is still set, token is wrong, BotFather privacy/group routing is blocking messages, or `allowedChatIds` filtered the chat.

## 5. Debug with fixtures before live Telegram

If live Telegram does not work, first isolate local logic:

```powershell
npm test
```

The fixture tests cover:

- Telegram update normalization
- JSON session and target persistence
- opencode event-to-Telegram-send routing
- Telegram permission callback parsing
- opencode REST payloads and SSE parsing
- Basic auth header generation

## 6. Common failures

### `TELEGRAM_BOT_TOKEN is required`

Set the token in the same shell before running `node packages/channel-telegram/dist/cli.js` or the published npm command from the main README.

### Telegram polling returns no messages

- Run `npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --doctor`; `url` must be empty for polling.
- Run `npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --delete-webhook` before polling.
- Make sure the bot received at least one new message after startup.
- Clear webhooks with `deleteWebhook`; polling and webhook delivery are mutually exclusive.
- In groups, mention the bot or disable BotFather privacy mode for broader group messages.
- Check `TELEGRAM_ALLOWED_CHAT_IDS`; an incorrect allowlist silently ignores updates.

### `Conflict: terminated by other getUpdates request`

Telegram only allows one long-polling `getUpdates` consumer per bot token. This means another `opencode-channel-telegram` process, old terminal, or other bot program is still running with the same token.

Observed local case:

```powershell
Remove-Item .\sessions.json -ErrorAction SilentlyContinue
node packages/channel-telegram/dist/cli.js --debug
```

The adapter started normally and connected to opencode events:

```txt
Starting opencode Telegram channel adapter...
Loaded config: C:\Users\leon\.config\opencode\opencode-channel.jsonc
Debug logging enabled
[telegram] connected to opencode event stream
```

Then Telegram rejected `getUpdates`:

```txt
Telegram getUpdates failed: Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```

Diagnosis: `--doctor` had already shown `url: ""`, so webhook was not the cause. The conflict was a second active polling consumer using the same bot token.

Find likely Node processes on Windows:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'opencode-channel-telegram|channel-telegram' } |
  Select-Object ProcessId, CommandLine
```

Stop the stale process:

```powershell
Stop-Process -Id <ProcessId>
```

Then start only one adapter instance:

```powershell
node packages/channel-telegram/dist/cli.js --debug
```

`--delete-webhook` does not fix this specific error when `--doctor` already shows `url: ""`; the conflict is another polling process.

### Adapter prints updates but opencode does not react

- Check the adapter console for `[telegram] failed to handle update`.
- Confirm `OPENCODE_BASE_URL` matches the terminal running `opencode serve --hostname 127.0.0.1 --port 4096`.
- If opencode uses a password, set `OPENCODE_PASSWORD` or `OPENCODE_AUTH_HEADER`.
- Delete `sessions.json` once if it contains stale session IDs from an old opencode server.

### opencode returns 401/403

- Set `OPENCODE_PASSWORD` for opencode Basic auth.
- Or set `OPENCODE_AUTH_HEADER` to the exact Authorization header required by your deployment.

### opencode prompt is sent but Telegram gets no reply

Current event parsing handles simple `message`/`text` style events and `permission.asked`. The next hardening step is to parse opencode streaming events such as `message.part.delta` and `session.next.text.delta` and aggregate them before sending/editing Telegram messages.

### Permission buttons do nothing

Callback data must match:

```txt
opencode:permission:<requestID>:approve
opencode:permission:<requestID>:deny
```

Approve maps to opencode reply `once`; deny maps to `reject`.

## 7. Webhook mode

Webhook support is framework-agnostic. Use `createTelegramRuntime`, bind events once, and pass parsed Telegram updates to `handleUpdate` from your HTTP route.

```ts
const { runtime, handleUpdate } = createTelegramRuntime({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
  sessionStorePath: process.env.CHANNEL_SESSION_STORE ?? "./sessions.json",
});

await runtime.bindEvents();
await handleUpdate(parsedTelegramUpdate);
```

For local webhook debugging, expose your local server with a tunnel and register Telegram `setWebhook` to the public URL. Use polling first unless webhook behavior is specifically required.
