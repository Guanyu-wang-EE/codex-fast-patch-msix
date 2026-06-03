# Codex Data Migration Guide

English | [Simplified Chinese](Codex%20Data%20Migration.zh.md)

This guide summarizes the main Codex Desktop data locations on Windows and provides a conservative migration workflow.

## Main Data Locations

Codex data usually falls into three groups:

1. Core Codex data: `%USERPROFILE%\.codex`
2. Project and draft workspace: `%USERPROFILE%\Documents\Codex`
3. Desktop app state: `%APPDATA%\Codex` and `%LOCALAPPDATA%\Codex`

The core folder may include skills, plugins, sessions, archived sessions, chat indexes, SQLite history databases, configuration, automations, memories, and rules.

## Migration Principle

Fully quit Codex on the old computer before copying data. Do not copy while Codex is running, because local chat history may include SQLite WAL files such as `logs_2.sqlite-wal` or `state_5.sqlite-wal`.

Check running Codex processes:

```powershell
Get-Process | Where-Object { $_.ProcessName -like *Codex* }
```

## Backup On The Old Computer

Replace `E:` with your external drive letter. Robocopy return codes `0-7` usually indicate success or acceptable differences. Treat return code `8` or higher as failure.

Back up `%USERPROFILE%\.codex`, `%USERPROFILE%\Documents\Codex`, `%APPDATA%\Codex`, and `%LOCALAPPDATA%\Codex` with `robocopy /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ`.

## Restore On The New Computer

Install Codex, launch it once, then fully quit it before restoring data. If a new `%USERPROFILE%\.codex` folder already exists, rename it with a timestamp before copying the backup into place.

Restore the same four locations: `.codex`, `Documents\Codex`, `AppData\Roaming\Codex`, and `AppData\Local\Codex`.

## Minimum Useful Backup Set

If you do not want a full backup, preserve at least skills, plugins, sessions, archived sessions, `session_index.jsonl`, `logs_*.sqlite*`, `state_*.sqlite*`, `goals_*.sqlite*`, `config.toml`, automations, memories, rules, and `%USERPROFILE%\Documents\Codex`.

## Security Notes

`auth.json`, `.sandbox-secrets`, and Electron Local Storage may contain login state or sensitive material. Avoid storing full unencrypted backups in cloud drives. A safer approach is to migrate chats, skills, and configuration, then sign in again on the new computer.

External project files referenced by chats are not migrated automatically. Repositories, virtual environments, licenses, Python/Node dependencies, and data folders outside `Documents\Codex` must be copied separately.

## Acceptance Checklist

After migration, verify that old chats are visible, custom skills are present, plugin skills are present, existing conversations open correctly, and broken file links are fixed by copying external project folders or updating paths.

After Codex starts successfully on the new computer, ask Codex to audit and repair stale path references from the old Windows user profile. The Chinese companion document includes a detailed cleanup prompt.
