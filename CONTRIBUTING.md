# Contributing

Thanks for helping improve the opencode channel adapters.

## Development setup

Requirements:

- Node.js 20 or newer
- npm
- A local `opencode serve` process when manually testing live channel behavior

Install dependencies and verify the workspace:

```bash
npm install
npm test
```

`npm test` builds all workspace packages and runs the channel runtime regression test.

## Local configuration

Never commit real bot tokens, opencode passwords, session stores, or local channel config files.

Use the checked-in examples instead:

- `.env.example`
- `opencode-channel.example.jsonc`

For the full configuration reference, see [`CONFIG.md`](./CONFIG.md). For manual Telegram debugging, see [`DEBUG.md`](./DEBUG.md).

## Change guidelines

- Keep channel-specific platform behavior inside that channel package.
- Keep shared session, permission, storage, and opencode bridge behavior in `packages/channel-core`.
- Preserve the thin `ChannelAdapter` boundary so new channels can be added without changing existing adapters.
- Update `README.md` or `CONFIG.md` when behavior, CLI flags, or configuration fields change.
- Add or update tests when changing shared runtime behavior.

## Pull request checklist

- [ ] `npm test` passes locally.
- [ ] New or changed configuration is documented.
- [ ] Example files contain placeholders only, never real secrets.
- [ ] Generated files such as `dist/`, `*.tsbuildinfo`, and `node_modules/` are not committed.
