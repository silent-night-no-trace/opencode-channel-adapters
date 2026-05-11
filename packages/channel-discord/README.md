# @opencode-channel/discord

Discord adapter for driving opencode sessions from Discord channels.

## Install

```bash
npm install @opencode-channel/discord
```

## CLI

```bash
npx opencode-channel-discord --help
npx opencode-channel-discord --check-config
npx opencode-channel-discord
```

Required configuration:

- `DISCORD_BOT_TOKEN` or `channels.discord.botToken`
- `OPENCODE_BASE_URL` or `opencode.baseUrl`

Useful flags:

- `--config <path>`: use a specific JSON/JSONC config file.
- `--check-config`: validate merged config without connecting to Discord.
- `--print-config`: print merged config with known secrets redacted.

For full setup and configuration, see the repository `README.md` and `CONFIG.md`.

## License

MIT
