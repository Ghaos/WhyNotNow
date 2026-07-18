[CmdletBinding()]
param(
    [string]$PluginPath = (Join-Path $env:USERPROFILE "plugins\why-not-now"),
    [string]$MarketplaceName = "personal"
)

$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)] [string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)] [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
    }
}

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$SkillSource = Join-Path $RepositoryRoot ".agents\skills\wnn"
$ListSkillSource = Join-Path $RepositoryRoot ".agents\skills\wnn-list"
$BundleSource = Join-Path $RepositoryRoot "dist\why-not-now-mcp.mjs"
$SkillDestination = Join-Path $PluginPath "skills\wnn"
$ListSkillDestination = Join-Path $PluginPath "skills\wnn-list"
$LegacySkillDestination = Join-Path $PluginPath "skills\why-not-now"
$BundleDestinationDirectory = Join-Path $PluginPath "dist"
$PluginManifest = Join-Path $PluginPath ".codex-plugin\plugin.json"
$CachebusterScript = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py"

foreach ($RequiredPath in @($SkillSource, $ListSkillSource, $PluginManifest, $CachebusterScript)) {
    if (-not (Test-Path -LiteralPath $RequiredPath)) {
        throw "Required path was not found: $RequiredPath"
    }
}

Push-Location $RepositoryRoot
try {
    Write-Host "Checking source..." -ForegroundColor Cyan
    Invoke-NativeCommand "npm.cmd" "run" "check"

    Write-Host "Running tests..." -ForegroundColor Cyan
    Invoke-NativeCommand "npm.cmd" "test"

    Write-Host "Building MCP server bundle..." -ForegroundColor Cyan
    Invoke-NativeCommand "npm.cmd" "run" "build:plugin-server"

    if (-not (Test-Path -LiteralPath $BundleSource)) {
        throw "Build did not create bundle: $BundleSource"
    }

    Write-Host "Copying skill and bundle into plugin source..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $SkillDestination, $ListSkillDestination, $BundleDestinationDirectory | Out-Null
    Copy-Item -Path (Join-Path $SkillSource "*") -Destination $SkillDestination -Recurse -Force
    Copy-Item -Path (Join-Path $ListSkillSource "*") -Destination $ListSkillDestination -Recurse -Force
    Copy-Item -LiteralPath $BundleSource -Destination (Join-Path $BundleDestinationDirectory "why-not-now-mcp.mjs") -Force

    if (Test-Path -LiteralPath $LegacySkillDestination) {
        Remove-Item -LiteralPath $LegacySkillDestination -Recurse -Force
    }

    $PluginJson = Get-Content -Raw -LiteralPath $PluginManifest | ConvertFrom-Json
    $PluginJson.description = "Capture deferred work in Codex and review it from a local inbox."
    $PluginJson.interface.shortDescription = "Discuss deferred work and review it in a local inbox."
    $PluginJson.interface.longDescription = "A deferred-work inbox with a Codex conversation workbench. Capture and explore why not now in Codex, then review, complete, restore, or revisit saved items from a local browser view."
    $PluginJson.interface.defaultPrompt = @(
        'Use $wnn to capture a task and decide what to do next.',
        'Open the WhyNotNow inbox at http://127.0.0.1:49321/.',
        "Revisit a saved WhyNotNow conversation."
    )
    [System.IO.File]::WriteAllText(
        $PluginManifest,
        ($PluginJson | ConvertTo-Json -Depth 10),
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "Updating plugin cachebuster..." -ForegroundColor Cyan
    Invoke-NativeCommand "python" $CachebusterScript $PluginPath

    Write-Host "Reinstalling plugin from $MarketplaceName marketplace..." -ForegroundColor Cyan
    Invoke-NativeCommand "codex" "plugin" "add" "why-not-now@$MarketplaceName"
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Plugin update complete. Create a new Codex task to test the updated skill and MCP tools." -ForegroundColor Green
