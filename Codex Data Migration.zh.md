# Codex 数据迁移指南

[English](Codex%20Data%20Migration.md) | 简体中文

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

**最重要的一点**

打开新电脑的codex，如果能跑通的话，请运行下面这个命令给codex，让其自己收尾一下：

```text
请作为 Codex 配置迁移与修复专家，帮我审计并修复当前电脑上的 Codex 配置迁移残留。

背景：
我从另一台 Windows 电脑迁移了 Codex 数据，旧用户名可能是 <OLD_USER>，当前用户名是 <NEW_USER>。当前 Codex home 通常是 C:\Users\<NEW_USER>\.codex。请不要假设路径正确，先用 whoami、$env:USERPROFILE、$env:CODEX_HOME 或实际文件位置确认。

目标：
1. 找出并修复 Codex 配置、自动化、skills、plugins、marketplace、sandbox、capability、SQLite、global state、session 索引中的旧用户名或旧路径残留。
2. 保留聊天记录、skills、automations、plugins、个人配置，不要粗暴删除。
3. 修复后确保 Codex Desktop 能正常读取 projectless chats、pinned chats、project chats、automations 和 skills。

强制安全规则：
- 任何写操作前必须先备份，备份放到当前用户 Desktop 下，例如 C:\Users\<NEW_USER>\Desktop\codex-migration-backup-YYYYMMDD-HHMM。
- 不要对 sessions/*.jsonl 做盲目全局重写。
- 如必须修改 rollout JSONL，必须保持：
  - 文件首字节不能有 UTF-8 BOM；
  - 第一行必须是合法 JSON；
  - 第一条事件 type 必须是 session_meta；
  - payload.id 必须与文件名里的 thread id 一致；
  - 不得把其他线程的记录追加进去。
- 不要用 PowerShell 的默认 UTF-8 写回 JSONL；必须使用 UTF8Encoding(false) 或结构化 JSON 工具写无 BOM UTF-8。
- 对 .codex-global-state.json 必须用 JSON parser 结构化读取和写回，不要手工字符串裁剪。
- 修改 SQLite 前必须 .backup 或复制数据库文件；修改后执行 checkpoint/vacuum。

检查范围：
- C:\Users\<NEW_USER>\.codex\config.toml
- C:\Users\<NEW_USER>\.codex\cap_sid
- C:\Users\<NEW_USER>\.codex\.codex-global-state.json
- C:\Users\<NEW_USER>\.codex\automations
- C:\Users\<NEW_USER>\.codex\skills
- C:\Users\<NEW_USER>\.codex\plugins
- C:\Users\<NEW_USER>\.codex\.sandbox
- C:\Users\<NEW_USER>\.codex\.sandbox-bin
- C:\Users\<NEW_USER>\.codex\.sandbox-secrets
- C:\Users\<NEW_USER>\.codex\sessions
- C:\Users\<NEW_USER>\.codex\state_*.sqlite
- C:\Users\<NEW_USER>\.codex\logs_*.sqlite
- C:\Users\<NEW_USER>\.codex\sqlite\*.db
- C:\Users\<NEW_USER>\Documents\Codex

修复内容：
- 将旧路径 C:\Users\<OLD_USER>、\\?\C:\Users\<OLD_USER>、C:/Users/<OLD_USER>、大小写变体、JSON escaped 变体，全部修成当前用户路径。
- 修复 config.toml 的 marketplaces.*.source，不允许 personal marketplace 继续指向旧用户目录。
- 修复 automations 的 cwds/source_cwd。
- 修复 cap_sid 中旧 cwd 和 writable root 映射；如不确定，清空路径映射让 Codex 重新生成。
- 清理 sandbox secrets/runner/cache 中旧 DPAPI 或旧 capability 状态，但不要删除正常用户数据。
- 修复 .codex-global-state.json 中 projectless-thread-ids、pinned-thread-ids、thread-workspace-root-hints、electron-saved-workspace-roots、project-order。
- 移除不存在的旧 workspace root。
- 检查所有 rollout JSONL 是否无 BOM、首条 session_meta 正确、没有明显跨线程串写。
- 如果发现跨线程串写，只裁掉明确属于其他线程/其他日期任务的尾部，并保留备份。

最终验收：
请输出这些检查结果：
- 旧路径内容命中数
- 旧路径文件名/目录名命中数
- config.toml 是否仍有旧路径
- marketplace personal source 当前值
- automations cwd 当前值
- cap_sid 是否仍有旧路径
- global state 是否 JSON parse 成功
- projectless-thread-ids 数量
- pinned-thread-ids 数量
- rollout BOM 数量
- rollout 首事件异常数量
- SQLite 旧路径命中数量
- sandbox/capability 是否已重新生成或处于可重新生成状态

最后给出：
1. 已修复项；
2. 未修复但无行为影响的历史文本残留；
3. 需要我重启 Codex Desktop 的明确说明。
```

