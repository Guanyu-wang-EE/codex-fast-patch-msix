# Codex Fast Patch for Windows Store/MSIX

[English](README.md) | 简体中文

> 面向 Windows 11 Microsoft Store/MSIX 版本 Codex 客户端的用户态补丁工具。  
> 目标是在不使用管理员权限、不修改 Store 原包、不写入 API Key 的前提下，创建一个可回滚的 `Codex-patched` 副本，并在该副本中解除 API Key 模式下的 Fast/Speed 等前端门控。

## 重要声明

- 本项目只适用于 **Windows Store/MSIX 安装形态** 的 Codex 客户端。
- 本项目不包含、不保存、也不需要任何 API Key。
- 请使用普通 PowerShell 运行，**不要使用管理员 PowerShell**。
- 脚本不会修改 `C:\Program Files\WindowsApps\...` 中的 Store 原包。
- 脚本会在当前用户目录创建补丁版副本：

```text
%LOCALAPPDATA%\Programs\Codex-patched
```

- 开始菜单启动的仍然是 Store 原版；补丁版需要从 `Codex-patched\Codex.exe` 启动。
- Codex 客户端更新后，前端文件名或代码结构可能变化。每次重新应用前都必须先执行 `--dry-run`。

## 已验证环境

- Windows 11
- Codex Microsoft Store/MSIX 版本
- Node.js + npm/npx 可用
- 普通用户权限

检查 Node.js / npx：

```powershell
node --version
npm.cmd --version
npx.cmd --version
```

如果 `npx.cmd` 不可用，请先安装 Node.js LTS，然后重新打开普通 PowerShell：

```powershell
winget install OpenJS.NodeJS.LTS
```

## 文件说明

```text
codex-fast-patch-universal.js
```

这是唯一需要运行的脚本，提供三个模式：

```powershell
node .\codex-fast-patch-universal.js --dry-run
node .\codex-fast-patch-universal.js --apply
node .\codex-fast-patch-universal.js --launch
```

## 快速使用

1. 下载或复制本仓库文件到任意目录，例如：

```text
%USERPROFILE%\Desktop\codex-fast-patch
```

2. 打开普通 PowerShell，进入脚本目录：

```powershell
cd "$env:USERPROFILE\Desktop\codex-fast-patch"
```

3. 先执行只读检查：

```powershell
node .\codex-fast-patch-universal.js --dry-run
```

优先看 `REQUIRED` 结果。Fast/Speed 的核心补丁是 3 个 required 项，只有它们全部命中时才继续：

```text
REQUIRED: hits=3 misses=0
```

如果 `OPTIONAL` 有少量 misses，通常表示当前 Codex 版本的插件、语音或侧边栏相关代码结构变了；只要 `REQUIRED: hits=3 misses=0`，Fast/Speed 相关补丁仍可继续应用。

4. 执行真实补丁：

```powershell
node .\codex-fast-patch-universal.js --apply
```

成功后会生成：

```text
%LOCALAPPDATA%\Programs\Codex-patched\Codex.exe
```

5. 启动补丁版：

```powershell
node .\codex-fast-patch-universal.js --launch
```

或手动启动：

```powershell
& "$env:LOCALAPPDATA\Programs\Codex-patched\Codex.exe"
```

## 运行逻辑

脚本执行 `--apply` 时会按以下顺序工作：

1. 自动定位 Store/MSIX 版 Codex：

```powershell
Get-AppxPackage -Name OpenAI.Codex
```

2. 读取原包中的：

```text
app\resources\app.asar
```

3. 对原包执行只读 dry-run，确认 8 个补丁点全部命中。
4. 将 Store 原包的 `app` 目录复制到：

```text
%LOCALAPPDATA%\Programs\Codex-patched
```

5. 备份副本内的：

```text
resources\app.asar -> resources\app.asar.bak
```

6. 解包副本内的 `app.asar`：

```text
resources\app
```

7. 对解包后的前端 JS 文件写入补丁。
8. 将副本内的 `app.asar` 重命名为：

```text
resources\app.asar1
```

9. 优先对副本 `Codex.exe` 写入 Electron fuses，使其加载解包目录：

```text
OnlyLoadAppFromAsar=off
EnableEmbeddedAsarIntegrityValidation=off
GrantFileProtocolExtraPrivileges=off
EnableCookieEncryption=off
```

如果新版 Codex 的 `Codex.exe` 不支持 `@electron/fuses` 写入，脚本会自动改用 fallback：把已补丁的 `resources\app` 重新打包成 `resources\app.asar`，让 Codex 按默认 asar 路径加载补丁版前端。

## 补丁范围

当前脚本会尝试处理以下前端门控：

- Fast/Speed 主授权门控
- Fast/Speed 早期禁用分支
- 模型可用性检查
- 插件侧边栏门控
- 插件连接器可用性
- 语音输入门控
- 用量设置门控
- i18n 多语言门控

脚本会自动根据文件名前缀和内容特征定位当前版本的目标文件。  
如果 Codex 更新导致结构变化，`--dry-run` 可能出现 `misses > 0`，此时脚本会拒绝应用真实补丁。

## API Key 与配置

本脚本不处理 API Key。  
Codex 的 API provider、模型、token 等配置通常在：

```text
%USERPROFILE%\.codex\config.toml
%USERPROFILE%\.codex\auth.json
```

换 API Key 时，不需要重新 patch。只需修改实际保存 key 的配置文件，然后完全退出 Codex 并重新启动补丁版。

如果 key 位于 `config.toml`，修改 `config.toml`。  
如果 key 位于 `auth.json`，修改 `auth.json`。  
如果更换 API 服务商、`base_url` 或模型名，则需要同步修改 `config.toml`。

不要把真实 API Key 写入本仓库或提交到 GitHub。

## 回滚

补丁版是用户态副本，回滚非常简单：

```powershell
$dst = Join-Path $env:LOCALAPPDATA "Programs\Codex-patched"
if (Test-Path $dst) {
  Remove-Item -LiteralPath $dst -Recurse -Force
}
```

Store 原版不受影响，可继续从开始菜单启动。

## 常见问题

### 1. 为什么窗口标题或图标显示 Codex (Dev)？

这是因为补丁版是从用户目录中的复制版 Electron 应用启动，不是 Store 注册入口启动。  
`Dev` 只表示运行形态，不表示模型、账号或 API 是开发版。

### 2. 执行 `--apply` 后仍看不到 Speed/Fast 选项？

先确认是否从补丁版启动：

```powershell
& "$env:LOCALAPPDATA\Programs\Codex-patched\Codex.exe"
```

再确认补丁是否写入：

```powershell
$dst = Join-Path $env:LOCALAPPDATA "Programs\Codex-patched"
Select-String -Path "$dst\resources\app\webview\assets\use-is-fast-mode-enabled-*.js" -Pattern "return true","false&&.*authMethod","b=true"
```

如果补丁存在但选项仍不可见，应检查：

- `%USERPROFILE%\.codex\config.toml`
- `%USERPROFILE%\.codex\auth.json`
- 当前 provider、base_url、model 是否正确
- 是否已完全退出旧 Codex 进程

完全退出并重启：

```powershell
Get-Process Codex -ErrorAction SilentlyContinue | Stop-Process -Force
& "$env:LOCALAPPDATA\Programs\Codex-patched\Codex.exe"
```

### 3. `npx` 报错或找不到

先检查：

```powershell
node --version
npm.cmd --version
npx.cmd --version
```

如果 `npx.cmd` 不存在，安装 Node.js LTS 后重新打开普通 PowerShell。

如果 PowerShell 提示 `npm.ps1` / `npx.ps1` 被执行策略阻止，优先使用 `.cmd` 入口：

```powershell
npm.cmd --version
npx.cmd --version
```

本脚本内部也会显式调用 `npx.cmd`，避免触发 PowerShell 的 `.ps1` 执行策略限制。

### 4. 目标目录已存在

脚本不会覆盖已有副本。重新 patch 前先删除旧副本：

```powershell
$dst = Join-Path $env:LOCALAPPDATA "Programs\Codex-patched"
if (Test-Path $dst) {
  Remove-Item -LiteralPath $dst -Recurse -Force
}
```

### 5. `@electron/fuses` 提示找不到 sentinel

新版 Codex 可能出现：

```text
Could not find sentinel in the provided Electron binary
```

新版脚本会自动 fallback 到重新打包 `app.asar`。如果你使用旧脚本后停在这个错误，目录里可能只有 `app.asar1`，没有 `app.asar`。可以在补丁目录执行手动修复：

```powershell
$dst = Join-Path $env:LOCALAPPDATA "Programs\Codex-patched"
cd "$dst\resources"
npx.cmd --yes @electron/asar pack .\app .\app.asar
& "$dst\Codex.exe"
```

如果启动失败，可恢复原始副本：

```powershell
$dst = Join-Path $env:LOCALAPPDATA "Programs\Codex-patched"
Copy-Item "$dst\resources\app.asar.bak" "$dst\resources\app.asar" -Force
& "$dst\Codex.exe"
```

## GitHub 上传教程

下面假设你要创建一个新的 GitHub 仓库，例如：

```text
codex-fast-patch-msix
```

### 方法一：网页上传

1. 打开 GitHub。
2. 点击右上角 `+` -> `New repository`。
3. Repository name 填：

```text
codex-fast-patch-msix
```

4. 选择 `Public` 或 `Private`。
5. 不要勾选自动生成 README，因为本项目已经有 `README.md`。
6. 创建仓库。
7. 在仓库页面点击 `uploading an existing file`。
8. 上传以下两个文件：

```text
README.md
codex-fast-patch-universal.js
```

9. Commit message 可填写：

```text
Initial release
```

10. 点击 `Commit changes`。

### 方法二：Git 命令行上传

进入本项目目录：

```powershell
cd "本仓库文件所在目录"
```

初始化 Git：

```powershell
git init
git add README.md codex-fast-patch-universal.js
git commit -m "Initial release"
```

在 GitHub 网页创建一个空仓库后，复制仓库地址，例如：

```text
https://github.com/YOUR_NAME/codex-fast-patch-msix.git
```

然后执行：

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_NAME/codex-fast-patch-msix.git
git push -u origin main
```

### 方法三：GitHub CLI 上传

如果已安装并登录 GitHub CLI：

```powershell
gh auth login
```

然后在项目目录执行：

```powershell
git init
git add README.md codex-fast-patch-universal.js
git commit -m "Initial release"
gh repo create codex-fast-patch-msix --private --source . --remote origin --push
```

如果希望公开仓库，把 `--private` 改为：

```powershell
--public
```

## 维护建议

- 每次 Codex 更新后，先运行 `--dry-run`。
- 只有 `REQUIRED: hits=3 misses=0` 时才运行 `--apply`。
- 如果 required 出现 miss，说明 Fast/Speed 核心代码结构可能变化，需要重新定位补丁点。
- 如果 optional 出现 miss，通常不影响 Fast/Speed，但对应的插件、语音、i18n 或用量设置补丁可能未应用。
- 不要提交 `.codex` 目录、`auth.json`、`config.toml`、API Key、日志或任何个人配置。
