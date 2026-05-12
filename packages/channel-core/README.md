# @opencode-channel/core

Shared runtime, bridge, storage, and type contracts for opencode channel adapters.

## Install

```bash
npm install @opencode-channel/core
```

## What it provides

- `ChannelAdapter` contracts for normalizing inbound platform events and sending outbound messages.
- `ChannelRuntime` for binding channel threads to opencode sessions.
- `MemorySessionStore` and `JsonFileSessionStore` implementations.
- `OpencodeHttpBridge` for the REST/SSE surface exposed by `opencode serve`.
- Unified config loading, environment merging, and secret redaction helpers.

## Usage

```ts
import { ChannelRuntime, MemorySessionStore, OpencodeHttpBridge } from "@opencode-channel/core";
```

Most users should install a concrete adapter package instead:

- `@opencode-channel/telegram`
- `@opencode-channel/discord`
- `@opencode-channel/feishu`

## License

MIT
