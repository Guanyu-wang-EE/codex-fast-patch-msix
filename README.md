# Codex Fast Patch for Windows Store/MSIX

English | [Simplified Chinese](README.zh.md)

A user-space patch helper for the Windows 11 Microsoft Store/MSIX build of the Codex desktop client.

The goal is to create a reversible `Codex-patched` copy without administrator privileges, without modifying the original Store package, and without storing any API key in this repository. The patched copy relaxes selected frontend gates related to Fast/Speed mode when Codex is used with API-key based configuration.

## Important Notes

- This project is intended only for the Windows Store/MSIX installation of Codex.
- Run it from an ordinary PowerShell session, not an Administrator PowerShell session.
- The script does not read, write, store, or require any API key.
- The original Store package under `C:\Program Files\WindowsApps\...` is not modified.
- The patched copy is created under `%LOCALAPPDATA%\Programs\Codex-patched`.
- The Start Menu still launches the original Store app. Launch the patched copy from `Codex-patched\Codex.exe`.
- After every Codex update, run `--dry-run` before applying a patch again.

## Verified Environment

- Windows 11
- Codex installed from Microsoft Store/MSIX
- Node.js with `npm.cmd` and `npx.cmd` available
- Ordinary user permissions

Check the runtime tools:

```powershell
node --version
npm.cmd --version
npx.cmd --version
```

If `npx.cmd` is unavailable, install Node.js LTS and reopen PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
```

## Script

The only script you need to run is:

```text
codex-fast-patch-universal.js
```

Supported modes:

```powershell
node .\codex-fast-patch-universal.js --dry-run
node .\codex-fast-patch-universal.js --apply
node .\codex-fast-patch-universal.js --launch
```

## Quick Start

1. Clone or download this repository.
2. Open ordinary PowerShell in the repository directory.
3. Run the read-only check:

```powershell
node .\codex-fast-patch-universal.js --dry-run
```

Continue only when the required patch points are all found:

```text
REQUIRED: hits=3 misses=0
```

Optional misses usually mean a plugin, voice, sidebar, usage, or i18n gate changed in the current Codex build. Fast/Speed patching can still proceed when the required group is complete.

4. Apply the patch:

```powershell
node .\codex-fast-patch-universal.js --apply
```

5. Launch the patched copy:

```powershell
node .\codex-fast-patch-universal.js --launch
```

Or launch it manually:

```powershell
& $env:LOCALAPPDATA\Programs\Codex-patched\Codex.exe
```

## How It Works

During `--apply`, the script:

1. Locates the Store/MSIX Codex package with `Get-AppxPackage -Name OpenAI.Codex`.
2. Reads the original `app\resources\app.asar`.
3. Runs a read-only dry run against the original package.
4. Copies the Store app directory to `%LOCALAPPDATA%\Programs\Codex-patched`.
5. Backs up `resources\app.asar` as `resources\app.asar.bak`.
6. Unpacks the copied `app.asar` into `resources\app`.
7. Applies targeted frontend JavaScript patches.
8. Tries to update Electron fuses so the unpacked app directory is loaded.
9. Falls back to repacking `resources\app` into `resources\app.asar` if the current Electron binary does not support fuse writing.

## Patch Scope

The script attempts to handle frontend gates related to:

- Fast/Speed authorization
- Fast/Speed early-disable branches
- model availability checks
- plugin sidebar availability
- plugin connector availability
- voice input availability
- usage settings availability
- i18n/multilingual availability

If a Codex update changes frontend file names or code shape, `--dry-run` may report misses. Required misses should be treated as a stop condition.

## API Key And Configuration

This project does not manage API keys. Codex configuration is usually stored in:

```text
%USERPROFILE%\.codex\config.toml
%USERPROFILE%\.codex\auth.json
```

Changing an API key usually does not require patching again. Update the relevant Codex configuration file, fully quit Codex, and restart the patched copy.

Never commit API keys, `auth.json`, `config.toml`, logs, or personal Codex state to this repository.

## Rollback

The patched app is only a user-space copy. Remove it to roll back:

```powershell
$dst = Join-Path $env:LOCALAPPDATA Programs\Codex-patched
if (Test-Path $dst) {
  Remove-Item -LiteralPath $dst -Recurse -Force
}
```

The original Store app remains untouched.

## Troubleshooting

If Fast/Speed options do not appear after `--apply`, first confirm you launched the patched copy:

```powershell
& $env:LOCALAPPDATA\Programs\Codex-patched\Codex.exe
```

If `npx` is blocked by PowerShell execution policy, use the `.cmd` entry points:

```powershell
npm.cmd --version
npx.cmd --version
```

If the target directory already exists, remove the old patched copy before reapplying.

## Related Document

See [Codex Data Migration](Codex%20Data%20Migration.md) for the English migration guide and [Codex Data Migration.zh.md](Codex%20Data%20Migration.zh.md) for the Chinese version.

## Maintenance Notes

- Run `--dry-run` after every Codex update.
- Apply only when `REQUIRED: hits=3 misses=0`.
- Treat required misses as a sign that the Fast/Speed core code path has changed.
- Optional misses usually affect non-core gates only.
- Do not commit `.codex`, `auth.json`, `config.toml`, API keys, logs, or personal configuration.
