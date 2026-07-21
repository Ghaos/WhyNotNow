import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageTemplate = resolve(projectRoot, "packaging", "why-not-now");
const skillSource = resolve(projectRoot, ".agents", "skills", "wnn");
const outputRoot = resolve(projectRoot, "plugins", "why-not-now");
const outputSkill = resolve(outputRoot, "skills", "wnn");
const outputBundle = resolve(outputRoot, "why-not-now-mcp.mjs");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await cp(packageTemplate, outputRoot, { recursive: true });
await mkdir(dirname(outputSkill), { recursive: true });
await cp(skillSource, outputSkill, { recursive: true });

await build({
  entryPoints: [resolve(projectRoot, "server", "index.mjs")],
  bundle: true,
  format: "esm",
  outfile: outputBundle,
  platform: "node",
  target: "node20",
});

console.log(`Created plugin package: ${outputRoot}`);
