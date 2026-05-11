#!/usr/bin/env node
import {
  loadChannelConfig,
  mergeConfigWithEnv,
  redactConfig,
  resolveDiscordRuntimeConfig,
} from "@opencode-channel/core";
import { createDiscordRuntime } from "./runner.js";

const args = process.argv.slice(2);
const configPath = readConfigArg(args);
const loaded = await loadChannelConfig(configPath ? { configPath } : {});
const config = mergeConfigWithEnv(loaded.config);

if (hasFlag(args, "--print-config")) {
  if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
  console.log(JSON.stringify(redactConfig(config), null, 2));
  process.exit(0);
}

const runtimeConfig = resolveDiscordRuntimeConfig(config);

if (hasFlag(args, "--check-config")) {
  if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
  console.log("Config OK");
  process.exit(0);
}

const runner = createDiscordRuntime(runtimeConfig);

process.once("SIGINT", () => {
  void runner.adapter.stop();
});
process.once("SIGTERM", () => {
  void runner.adapter.stop();
});

console.log("Starting opencode Discord channel adapter...");
if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
await runner.start();

function readConfigArg(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--config" || arg === "-c") return args[index + 1];
    if (arg?.startsWith("--config=")) return arg.slice("--config=".length);
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}
