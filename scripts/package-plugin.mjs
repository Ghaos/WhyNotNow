import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageTemplate = resolve(projectRoot, "packaging", "why-not-now");
const skillsSource = resolve(projectRoot, ".agents", "skills");
const outputRoot = resolve(projectRoot, "plugins", "why-not-now");
const outputSkills = resolve(outputRoot, "skills");
const outputBundle = resolve(outputRoot, "why-not-now-mcp.mjs");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await cp(packageTemplate, outputRoot, { recursive: true });
await mkdir(dirname(outputSkills), { recursive: true });
await cp(skillsSource, outputSkills, { recursive: true });

await build({
  entryPoints: [resolve(projectRoot, "server", "index.mjs")],
  bundle: true,
  format: "esm",
  outfile: outputBundle,
  platform: "node",
  target: "node20",
});

console.log(`Created plugin package: ${outputRoot}`);
