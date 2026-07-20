[CmdletBinding()]
param(
    [string]$PluginPath = (Join-Path $env:USERPROFILE "plugins\why-not-now"),
    [string]$MarketplaceName
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
$PackageSource = Join-Path $RepositoryRoot "out\why-not-now"
$PluginManifest = Join-Path $PluginPath ".codex-plugin\plugin.json"
$CachebusterScript = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py"
$MarketplaceNameScript = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\read_marketplace_name.py"
$CodexCommand = if ($IsWindows -or $env:OS -eq "Windows_NT") { "codex.cmd" } else { "codex" }

foreach ($RequiredPath in @($CachebusterScript, $MarketplaceNameScript)) {
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

    Write-Host "Validating plugin package..." -ForegroundColor Cyan
    Invoke-NativeCommand "npm.cmd" "run" "validate-plugin-package"

    if (-not (Test-Path -LiteralPath $PackageSource)) {
        throw "Package was not generated: $PackageSource"
    }

    Write-Host "Installing generated package into local plugin source..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $PluginPath | Out-Null
    foreach ($StalePath in @(
        (Join-Path $PluginPath ".codex-plugin"),
        (Join-Path $PluginPath ".mcp.json"),
        (Join-Path $PluginPath "why-not-now-mcp.mjs"),
        (Join-Path $PluginPath "skills"),
        (Join-Path $PluginPath "dist")
    )) {
        if (Test-Path -LiteralPath $StalePath) {
            Remove-Item -LiteralPath $StalePath -Recurse -Force
        }
    }
    Copy-Item -Path (Join-Path $PackageSource "*") -Destination $PluginPath -Recurse -Force

    if (-not (Test-Path -LiteralPath $PluginManifest)) {
        throw "Package install did not create manifest: $PluginManifest"
    }

    Write-Host "Updating plugin cachebuster..." -ForegroundColor Cyan
    Invoke-NativeCommand "python" $CachebusterScript $PluginPath

    if ([string]::IsNullOrWhiteSpace($MarketplaceName)) {
        $MarketplaceName = (& python $MarketplaceNameScript).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($MarketplaceName)) {
            throw "Could not determine the personal marketplace name."
        }
    }

    Write-Host "Reinstalling plugin from $MarketplaceName marketplace..." -ForegroundColor Cyan
    Invoke-NativeCommand $CodexCommand "plugin" "add" "why-not-now@$MarketplaceName"
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Plugin update complete. Create a new Codex task to test the updated skill and MCP tools." -ForegroundColor Green
