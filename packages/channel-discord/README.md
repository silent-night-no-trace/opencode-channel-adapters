# @opencode-channel/discord

Discord adapter for driving opencode sessions from Discord channels.

## Install

```bash
npm install -g @opencode-channel/discord@latest
opencode-channel-discord --help
opencode-channel-discord --check-config
opencode-channel-discord
```

Or install into a project and run from that project:

```bash
npm install @opencode-channel/discord@latest
npx --no-install opencode-channel-discord --help
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
