# Security Policy

## Supported versions

The project is pre-1.0. Security fixes target the latest `main` branch and the latest published npm versions when packages are available.

## Reporting a vulnerability

Please do not open a public issue for vulnerabilities or leaked credentials.

Report security concerns privately to the repository owner. Include:

- Affected package or adapter
- Impact and expected attacker capability
- Reproduction steps or proof of concept
- Relevant logs with bot tokens, passwords, auth headers, chat IDs, and session IDs removed

## Secret handling expectations

- Never commit real bot tokens, opencode passwords, auth headers, session stores, or local channel config files.
- Use `.env.example` and `opencode-channel.example.jsonc` for placeholders only.
- Prefer environment variables or a private config file for deployment secrets.
- `--print-config` redacts known secret fields, but logs and shell history can still expose manually pasted secrets.

## Security-sensitive areas

- Platform bot tokens and Feishu/Lark app credentials
- opencode server authentication
- Permission approval and rejection callbacks
- Channel thread to opencode session mapping
- Webhook or polling deployment logs
