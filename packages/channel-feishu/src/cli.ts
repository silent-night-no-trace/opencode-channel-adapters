#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  loadChannelConfig,
  mergeConfigWithEnv,
  redactConfig,
  resolveFeishuRuntimeConfig,
} from "@silent-night-no-trace/core";
import { createFeishuRuntime } from "./runner.js";

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

const runtimeConfig = resolveFeishuRuntimeConfig(config);

if (hasFlag(args, "--check-config")) {
  if (loaded.path) console.log(`Loaded config: ${loaded.path}`);
  console.log("Config OK");
  process.exit(0);
}

const runner = createFeishuRuntime(runtimeConfig);
console.log("Starting opencode Feishu channel adapter...");
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

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

function printHelp(): void {
  console.log(`opencode-channel-feishu ${readPackageVersion()}

Run the Feishu/Lark adapter for opencode channel sessions.

Usage:
  opencode-channel-feishu [options]

Options:
  -c, --config <path>        Use a specific JSON/JSONC config file
      --check-config         Validate merged config and exit
      --print-config         Print merged config with known secrets redacted
  -v, --version              Print package version
  -h, --help                 Show this help

Environment:
  FEISHU_APP_ID              Feishu/Lark app ID
  FEISHU_APP_SECRET          Feishu/Lark app secret
  OPENCODE_BASE_URL          opencode server URL, default http://127.0.0.1:4096
  OPENCODE_PASSWORD          Preferred opencode Basic auth password
  OPENCODE_AUTH_HEADER       Full Authorization header override
`);
}
