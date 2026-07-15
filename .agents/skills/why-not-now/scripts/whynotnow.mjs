#!/usr/bin/env node
import { promises as fs } from "node:fs";
import {
  archiveConversation,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  resolveDataRoot,
  updateConversation,
} from "./store.mjs";

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readInput(args) {
  const file = flagValue(args, "--input");
  if (file) return JSON.parse(await fs.readFile(file, "utf8"));
  if (!process.stdin.isTTY) {
    let text = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) text += chunk;
    if (text.trim()) return JSON.parse(text);
  }
  return {};
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return `Usage:
  whynotnow.mjs root
  whynotnow.mjs create [--input payload.json]
  whynotnow.mjs get <conversation-id>
  whynotnow.mjs update <conversation-id> [--expected-revision n] [--input payload.json]
  whynotnow.mjs list [--query text] [--include-archived]
  whynotnow.mjs archive <conversation-id>
  whynotnow.mjs delete <conversation-id> --yes`;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === "root") return output({ data_root: resolveDataRoot() });
  if (command === "create") return output(await createConversation(await readInput(args)));
  if (command === "get") {
    if (!args[0]) throw new Error("get requires a conversation id");
    return output(await getConversation(args[0]));
  }
  if (command === "update") {
    if (!args[0]) throw new Error("update requires a conversation id");
    const expected = flagValue(args, "--expected-revision");
    return output(await updateConversation(args[0], await readInput(args), {
      expectedRevision: expected === undefined ? undefined : Number.parseInt(expected, 10),
    }));
  }
  if (command === "list") {
    return output(await listConversations({
      includeArchived: args.includes("--include-archived"),
      query: flagValue(args, "--query") ?? "",
    }));
  }
  if (command === "archive") {
    if (!args[0]) throw new Error("archive requires a conversation id");
    return output(await archiveConversation(args[0]));
  }
  if (command === "delete") {
    if (!args[0]) throw new Error("delete requires a conversation id");
    if (!args.includes("--yes")) throw new Error("delete is destructive; pass --yes after explicit user confirmation");
    return output(await deleteConversation(args[0]));
  }
  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    code: error?.code ?? "ERROR",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
});
