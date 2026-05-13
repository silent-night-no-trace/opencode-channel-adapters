# @opencode-channel/telegram

Telegram Bot API adapter for driving opencode sessions from Telegram chats.

## Run without installing

```bash
npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --help
npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram --check-config
npx -y -p @opencode-channel/telegram@latest opencode-channel-telegram
```

`-p @opencode-channel/telegram@latest` tells npm which scoped package to download before running the `opencode-channel-telegram` binary.

## Install permanently

```bash
npm install -g @opencode-channel/telegram@latest
opencode-channel-telegram --help
```

Or install into a project and run from that project:

```bash
npm install @opencode-channel/telegram@latest
npx --no-install opencode-channel-telegram --help
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
