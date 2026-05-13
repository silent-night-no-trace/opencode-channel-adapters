# @opencode-channel/feishu

Feishu/Lark Event Callback webhook adapter for driving opencode sessions from Feishu or Lark chats.

## Run without installing

```bash
npx -y -p @opencode-channel/feishu@latest opencode-channel-feishu --help
npx -y -p @opencode-channel/feishu@latest opencode-channel-feishu --check-config
npx -y -p @opencode-channel/feishu@latest opencode-channel-feishu
```

`-p @opencode-channel/feishu@latest` tells npm which scoped package to download before running the `opencode-channel-feishu` binary.

## Install permanently

```bash
npm install -g @opencode-channel/feishu@latest
opencode-channel-feishu --help
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
