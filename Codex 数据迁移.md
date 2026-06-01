严谨版：这台机器上 Codex 数据主要有三块。

1. 核心数据：`C:\Users\Administrator\.codex`
   包含 skills、plugins、sessions、archived_sessions、聊天索引、SQLite 历史库、配置、automations、memories 等。

2. 项目/草稿工作区：`C:\Users\Administrator\Documents\Codex`
   包含 projectless chats 生成的文件、草稿、工作目录。

3. 桌面 App 状态：`C:\Users\Administrator\AppData\Roaming\Codex` 和 `C:\Users\Administrator\AppData\Local\Codex`
   多数是 Electron 缓存/UI 状态，不一定必须，但若追求“尽量原样”，也备份。

**最稳妥迁移原则**

先在旧电脑完全退出 Codex，再复制。不要在 Codex 运行时复制，因为本机聊天记录有 SQLite/WAL 文件，例如 `logs_2.sqlite`、`logs_2.sqlite-wal`、`state_5.sqlite-wal`，运行中复制可能不一致。

在旧电脑 PowerShell 执行：

```powershell
Get-Process | Where-Object { $_.ProcessName -like "*Codex*" }
```

如果有 Codex 进程，先从界面退出，或确认你不在对话中写入。

**旧电脑备份命令**

把 `E:` 换成你的移动硬盘盘符。

```powershell
$BackupRoot = "E:\CodexMigration-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

robocopy "$env:USERPROFILE\.codex" "$BackupRoot\.codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ

robocopy "$env:USERPROFILE\Documents\Codex" "$BackupRoot\Documents\Codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ

robocopy "$env:APPDATA\Codex" "$BackupRoot\AppData\Roaming\Codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ

robocopy "$env:LOCALAPPDATA\Codex" "$BackupRoot\AppData\Local\Codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ
```

`robocopy` 返回码 `0-7` 通常表示成功或有可接受差异，`8` 及以上才应视为失败。

**新电脑恢复步骤**

1. 在新电脑安装 Codex。
2. 打开一次，确认能运行，然后完全退出 Codex。
3. 把移动硬盘插到新电脑。
4. 执行恢复。

```powershell
$BackupRoot = "E:\CodexMigration-你的备份目录名"
$Stamp = Get-Date -Format yyyyMMdd-HHmmss

if (Test-Path "$env:USERPROFILE\.codex") {
    Rename-Item -LiteralPath "$env:USERPROFILE\.codex" -NewName ".codex.new-install-$Stamp"
}

robocopy "$BackupRoot\.codex" "$env:USERPROFILE\.codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ

New-Item -ItemType Directory -Path "$env:USERPROFILE\Documents\Codex" -Force | Out-Null
robocopy "$BackupRoot\Documents\Codex" "$env:USERPROFILE\Documents\Codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ

robocopy "$BackupRoot\AppData\Roaming\Codex" "$env:APPDATA\Codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ

robocopy "$BackupRoot\AppData\Local\Codex" "$env:LOCALAPPDATA\Codex" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ
```

**必须迁移的关键项**

如果你不想全量复制，最低限度要保留这些：

```text
%USERPROFILE%\.codex\skills
%USERPROFILE%\.codex\superpowers
%USERPROFILE%\.codex\plugins
%USERPROFILE%\.codex\vendor_imports
%USERPROFILE%\.codex\sessions
%USERPROFILE%\.codex\archived_sessions
%USERPROFILE%\.codex\session_index.jsonl
%USERPROFILE%\.codex\logs_*.sqlite*
%USERPROFILE%\.codex\state_*.sqlite*
%USERPROFILE%\.codex\goals_*.sqlite*
%USERPROFILE%\.codex\config.toml
%USERPROFILE%\.codex\automations
%USERPROFILE%\.codex\memories
%USERPROFILE%\.codex\rules
%USERPROFILE%\Documents\Codex
```

**安全注意**

`auth.json`、`.sandbox-secrets`、AppData 的 Local Storage 可能含登录状态或敏感信息。若备份盘不加密，我建议不要随便放云盘。更保守的做法是：迁移聊天、skills、配置后，在新电脑重新登录 Codex，而不是长期保存未加密的完整 `.codex` 备份。

还要注意：聊天记录会迁移，但聊天里引用的外部项目文件不会自动迁移。例如你之前提到的 `F:\Project 1\...` 不在 `Documents\Codex` 里，必须单独复制对应项目盘、Git 仓库、虚拟环境、Gurobi/license、Node/Python 依赖等。

**验收清单**

迁移后打开 Codex，检查：

1. 旧聊天是否能看到。
2. 自定义 skills 是否还在，例如 `.codex\skills` 下的个人技能。
3. Brooks Lint 等 plugin 技能是否还在 `.codex\plugins`。
4. 打开一条旧对话，确认内容能加载。
5. 若对话里的文件链接失效，复制对应外部项目目录或修正路径。
6. 