# @silent-night-no-trace/core

Shared runtime, bridge, storage, and type contracts for opencode channel adapters.

## Install

```bash
npm install @silent-night-no-trace/core
```

## What it provides

- `ChannelAdapter` contracts for normalizing inbound platform events and sending outbound messages.
- `ChannelRuntime` for binding channel threads to opencode sessions.
- `MemorySessionStore` and `JsonFileSessionStore` implementations.
- `OpencodeHttpBridge` for the REST/SSE surface exposed by `opencode serve`.
- Unified config loading, environment merging, and secret redaction helpers.

## Usage

```ts
import { ChannelRuntime, MemorySessionStore, OpencodeHttpBridge } from "@silent-night-no-trace/core";
```

Most users should install a concrete adapter package instead:

- `@silent-night-no-trace/telegram`
- `@silent-night-no-trace/discord`
- `@silent-night-no-trace/feishu`

## License

MIT
