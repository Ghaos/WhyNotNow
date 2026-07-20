import { access, readdir, readFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = resolve(projectRoot, "out", "why-not-now");
const expectedFiles = new Set([
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "why-not-now-mcp.mjs",
  "skills/wnn/SKILL.md",
  "skills/wnn/agents/openai.yaml",
  "skills/wnn/references/schema.md",
  "skills/wnn/scripts/store.mjs",
  "skills/wnn/scripts/whynotnow.mjs",
]);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    if (entry.isFile()) return [relative(packageRoot, entryPath).replaceAll("\\", "/")];
    return [];
  }));
  return files.flat();
}

function fail(message) {
  throw new Error(`Invalid plugin package: ${message}`);
}

try {
  await access(packageRoot);
} catch {
  fail("package was not generated; run npm.cmd run package-plugin first");
}

const actualFiles = new Set(await listFiles(packageRoot));
const missingFiles = [...expectedFiles].filter((file) => !actualFiles.has(file));
const unexpectedFiles = [...actualFiles].filter((file) => !expectedFiles.has(file));
if (missingFiles.length > 0) fail(`missing ${missingFiles.join(", ")}`);
if (unexpectedFiles.length > 0) fail(`contains unexpected ${unexpectedFiles.join(", ")}`);

const manifest = JSON.parse(await readFile(resolve(packageRoot, ".codex-plugin", "plugin.json"), "utf8"));
if (manifest.name !== "why-not-now") fail("manifest name must be why-not-now");
if (manifest.skills !== "./skills/") fail("manifest must reference ./skills/");
if (manifest.mcpServers !== "./.mcp.json") fail("manifest must reference ./.mcp.json");

const mcpConfig = JSON.parse(await readFile(resolve(packageRoot, ".mcp.json"), "utf8"));
const server = mcpConfig.mcpServers?.["why-not-now"];
if (server?.command !== "node") fail("MCP server command must be node");
if (JSON.stringify(server?.args) !== JSON.stringify(["why-not-now-mcp.mjs"])) {
  fail("MCP server must start why-not-now-mcp.mjs from the package root");
}
if (server?.cwd !== ".") fail("MCP server cwd must be the package root");

const bundle = await stat(resolve(packageRoot, "why-not-now-mcp.mjs"));
if (bundle.size === 0) fail("MCP bundle must not be empty");

const nodeCheck = spawn(process.execPath, ["--check", resolve(packageRoot, "why-not-now-mcp.mjs")], {
  stdio: "inherit",
});
await new Promise((resolveCheck, rejectCheck) => {
  nodeCheck.once("error", rejectCheck);
  nodeCheck.once("exit", (code) => {
    if (code === 0) resolveCheck();
    else rejectCheck(new Error(`MCP bundle syntax check failed with exit code ${code}`));
  });
});

console.log(`Validated plugin package: ${packageRoot}`);
