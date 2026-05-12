#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  loadChannelConfig,
  mergeConfigWithEnv,
  redactConfig,
  resolveTelegramRuntimeConfig,
} from "@opencode-channel/core";
import { createTelegramPollingRuntime } from "./polling-runner.js";

const args = process.argv.slice(2);

if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
  printHelp();
  process.exit(0);
}

if (hasFlag(args, "--version") || hasFlag(args, "-v")) {
  console.log(readPackageVersion());
  process.exit(0);
}

const configPath = readConfigArg(args);
const loaded = await loadChannelConfig(configPath ? { configPath } : {});
const config = mergeConfigWithEnv(loaded.config);

if (hasFlag(args, "--print-config")) {
  if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
  console.log(JSON.stringify(redactConfig(config), null, 2));
  process.exit(0);
}

const runtimeConfig = resolveTelegramRuntimeConfig(config);
const debug = hasFlag(args, "--debug") || process.env.OPENCODE_CHANNEL_DEBUG === "1" || process.env.OPENCODE_CHANNEL_DEBUG === "true";

if (hasFlag(args, "--check-config")) {
  if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
  console.log("Config OK");
  process.exit(0);
}

if (hasFlag(args, "--doctor")) {
  const runner = createTelegramPollingRuntime({ ...runtimeConfig, debug });
  const webhook = await runner.adapter.getWebhookInfo();
  console.log("Telegram webhook info:");
  console.log(JSON.stringify(webhook, null, 2));
  if (webhook.url) {
    console.log("Polling will not receive updates while a webhook URL is configured. Run with --delete-webhook or clear it manually.");
  }
  process.exit(0);
}

if (hasFlag(args, "--delete-webhook")) {
  const runner = createTelegramPollingRuntime({ ...runtimeConfig, debug });
  await runner.adapter.deleteWebhook(hasFlag(args, "--drop-pending-updates"));
  console.log("Telegram webhook deleted");
  process.exit(0);
}

const runner = createTelegramPollingRuntime({ ...runtimeConfig, debug });

process.once("SIGINT", () => {
  void runner.adapter.stop();
});
process.once("SIGTERM", () => {
  void runner.adapter.stop();
});

console.log("Starting opencode Telegram channel adapter...");
if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
if (debug) console.log("Debug logging enabled");
try {
  await runner.start();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

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

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

function printHelp(): void {
  console.log(`opencode-channel-telegram ${readPackageVersion()}

Run the Telegram adapter for opencode channel sessions.

Usage:
  opencode-channel-telegram [options]

Options:
  -c, --config <path>        Use a specific JSON/JSONC config file
      --check-config         Validate merged config and exit
      --print-config         Print merged config with known secrets redacted
      --doctor               Inspect Telegram webhook state before polling
      --delete-webhook       Clear Telegram webhook state before polling
      --drop-pending-updates Drop pending Telegram updates when deleting webhook
      --debug                Enable adapter debug logging
  -v, --version              Print package version
  -h, --help                 Show this help

Environment:
  TELEGRAM_BOT_TOKEN         Telegram Bot API token
  OPENCODE_BASE_URL          opencode server URL, default http://127.0.0.1:4096
  OPENCODE_PASSWORD          Preferred opencode Basic auth password
  OPENCODE_AUTH_HEADER       Full Authorization header override
`);
}
