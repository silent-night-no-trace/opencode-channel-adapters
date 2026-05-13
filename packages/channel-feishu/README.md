# @opencode-channel/feishu

Feishu/Lark Event Callback webhook adapter for driving opencode sessions from Feishu or Lark chats.

## Install

```bash
npm install -g @opencode-channel/feishu@latest
opencode-channel-feishu --help
opencode-channel-feishu --check-config
opencode-channel-feishu
```

Or install into a project and run from that project:

```bash
npm install @opencode-channel/feishu@latest
npx --no-install opencode-channel-feishu --help
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
