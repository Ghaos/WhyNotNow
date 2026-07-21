# Plugin development and updates

The WhyNotNow development source lives in this repository, and the distributed plugin is generated each time under `plugins/why-not-now/`. This generated package is tracked for Git-based distribution.

## Build the distributable package

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:plugin-server
npm.cmd run validate-plugin-package
```

The generated `plugins/why-not-now/` contains the plugin manifest, MCP configuration, one MCP bundle, and only the skills required at runtime.

## Update the personal plugin

On Windows, run:

```powershell
.\scripts\update-and-reinstall-plugin.ps1
```

This script applies the validated distributable package to the personal plugin installation, updates the Codex cache buster, and reinstalls it from the personal marketplace.

After updating, always verify the skill and MCP tools in a new Codex task.

## CI

For every pull request and push to `master`, GitHub Actions installs dependencies cleanly, then runs syntax checks, tests, distributable-package generation, and distributable validation.
