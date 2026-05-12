# @opencode-channel/telegram

Telegram Bot API adapter for driving opencode sessions from Telegram chats.

## Install

```bash
npm install @opencode-channel/telegram
```

## CLI

```bash
npx opencode-channel-telegram --help
npx opencode-channel-telegram --check-config
npx opencode-channel-telegram
```

Required configuration:

- `TELEGRAM_BOT_TOKEN` or `channels.telegram.botToken`
- `OPENCODE_BASE_URL` or `opencode.baseUrl`

Useful flags:

- `--config <path>`: use a specific JSON/JSONC config file.
- `--check-config`: validate merged config without connecting to Telegram.
- `--print-config`: print merged config with known secrets redacted.
- `--doctor`: inspect Telegram webhook state before polling.
- `--delete-webhook`: clear Telegram webhook state so polling can receive updates.
- `--debug`: print adapter debug logs.

For full setup and troubleshooting, see the repository `README.md`, `CONFIG.md`, and `DEBUG.md`.

## License

MIT
