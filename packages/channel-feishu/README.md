# @silent-night-no-trace/feishu

Feishu/Lark Event Callback webhook adapter for driving opencode sessions from Feishu or Lark chats.

## Install

```bash
npm install @silent-night-no-trace/feishu
```

## CLI

```bash
npx opencode-channel-feishu --help
npx opencode-channel-feishu --check-config
npx opencode-channel-feishu
```

Required configuration:

- `FEISHU_APP_ID` or `channels.feishu.appId`
- `FEISHU_APP_SECRET` or `channels.feishu.appSecret`
- `OPENCODE_BASE_URL` or `opencode.baseUrl`

Useful flags:

- `--config <path>`: use a specific JSON/JSONC config file.
- `--check-config`: validate merged config without starting the webhook server.
- `--print-config`: print merged config with known secrets redacted.

For full setup and configuration, see the repository `README.md` and `CONFIG.md`.

## License

MIT
