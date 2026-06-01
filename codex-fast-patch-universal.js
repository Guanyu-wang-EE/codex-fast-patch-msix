#!/usr/bin/env node

/*
  Codex Fast patch helper for Windows Store/MSIX installs.

  Usage, ordinary PowerShell, not Administrator:
    node .\codex-fast-patch-universal.js --dry-run
    node .\codex-fast-patch-universal.js --apply

  Optional:
    node .\codex-fast-patch-universal.js --apply --dst "$env:LOCALAPPDATA\Programs\Codex-patched"
    node .\codex-fast-patch-universal.js --launch

  This script does not store or require an API key.
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const args = process.argv.slice(2);
const mode = args.includes("--apply")
  ? "apply"
  : args.includes("--launch")
    ? "launch"
    : "dry-run";

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function run(command, commandArgs, options = {}) {
  const result = cp.spawnSync(command, commandArgs, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: false,
    cwd: options.cwd || process.cwd(),
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowCodes?.includes(result.status)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}\n${output}`,
    );
  }
  return result;
}

function cmdQuote(value) {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function cmdArg(value) {
  const text = String(value);
  return /[\s&()^|<>"]/u.test(text) ? cmdQuote(text) : text;
}

function runNpx(npxArgs) {
  const commandLine = ["npx.cmd", ...npxArgs.map(cmdArg)].join(" ");
  return run(process.env.ComSpec || "cmd.exe", ["/d", "/c", commandLine]);
}

function checkNpx() {
  const result = cp.spawnSync(
    process.env.ComSpec || "cmd.exe",
    ["/d", "/c", "npx.cmd --version"],
    { encoding: "utf8", stdio: "pipe", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(
      [
        "npx.cmd was not found or could not run.",
        "Install Node.js LTS with npm, then open a new ordinary PowerShell and retry.",
        "Check with: node --version ; npm.cmd --version ; npx.cmd --version",
      ].join("\n"),
    );
  }
}

function powershell(script) {
  return run(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { capture: true },
  ).stdout.trim();
}

function findCodexInstall() {
  const explicit = argValue("--src");
  if (explicit) return path.resolve(explicit);

  const installLocation = powershell(
    "(Get-AppxPackage -Name OpenAI.Codex).InstallLocation",
  );
  if (!installLocation) {
    throw new Error("OpenAI.Codex MSIX package was not found.");
  }

  const appDir = path.join(installLocation, "app");
  if (!fs.existsSync(appDir)) {
    throw new Error(`Codex app directory was not found: ${appDir}`);
  }
  return appDir;
}

function defaultDst() {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "Programs", "Codex-patched");
}

function parseAsar(filePath) {
  const fd = fs.openSync(filePath, "r");
  const header = Buffer.alloc(16);
  fs.readSync(fd, header, 0, 16, 0);

  const headerSize = header.readUInt32LE(4);
  const jsonLength = header.readUInt32LE(12);
  const headerJson = Buffer.alloc(jsonLength);
  fs.readSync(fd, headerJson, 0, jsonLength, 16);

  const root = JSON.parse(headerJson.toString("utf8"));
  const dataStart = 8 + headerSize;
  const entries = [];

  function walk(node, prefix) {
    if (!node.files) return;
    for (const [name, child] of Object.entries(node.files)) {
      const full = prefix ? `${prefix}/${name}` : name;
      entries.push([full, child]);
      walk(child, full);
    }
  }
  walk(root, "");

  function getEntry(file) {
    let node = root;
    for (const part of file.split("/")) node = node.files[part];
    return node;
  }

  function readFile(file) {
    const entry = getEntry(file);
    const buffer = Buffer.alloc(entry.size);
    fs.readSync(fd, buffer, 0, entry.size, dataStart + Number(entry.offset));
    return buffer.toString("utf8");
  }

  return { fd, entries, readFile };
}

function filesByPrefixFromAsar(entries, prefix) {
  return entries
    .map(([file]) => file)
    .filter(
      (file) =>
        file.startsWith("webview/assets/") &&
        path.posix.basename(file).startsWith(prefix) &&
        file.endsWith(".js"),
    );
}

function filesByContentFromAsar(entries, readFile, predicate) {
  const hits = [];
  for (const [file, entry] of entries) {
    if (!file.startsWith("webview/assets/") || !file.endsWith(".js")) continue;
    if (!entry.size || entry.size > 2_500_000) continue;
    const text = readFile(file);
    if (predicate(text, file)) hits.push(file);
  }
  return hits;
}

function collectDryRunPatches(asar) {
  const fastFiles =
    filesByPrefixFromAsar(asar.entries, "use-is-fast-mode-enabled-").length > 0
      ? filesByPrefixFromAsar(asar.entries, "use-is-fast-mode-enabled-")
      : filesByContentFromAsar(
          asar.entries,
          asar.readFile,
          (text) =>
            text.includes("additionalSpeedTiers") &&
            text.includes("models.some") &&
            text.includes("authMethod!==`chatgpt`"),
        );

  const patches = [];

  for (const file of fastFiles) {
    const text = asar.readFile(file);
    patches.push({
      name: "Fast gate",
      required: true,
      file,
      text,
      regex:
        /return!\([A-Za-z_$][\w$]*\?\.authMethod!==`chatgpt`\|\|[A-Za-z_$][\w$]*\)/,
      replacement: "return true",
    });
    patches.push({
      name: "Fast disabled branch",
      required: true,
      file,
      text,
      regex:
        /if\(([A-Za-z_$][\w$]*)\?\.authMethod!==`chatgpt`\|\|([A-Za-z_$][\w$]*)\)\{/,
      replacement: (m) =>
        `if(false&&${m[1]}?.authMethod!==\`chatgpt\`||${m[2]}){`,
    });
    patches.push({
      name: "Fast model availability",
      required: true,
      file,
      text,
      regex: /[A-Za-z_$][\w$]*\?\.models\.some\([A-Za-z_$][\w$]*\)\?\?!1/,
      replacement: "true",
    });
  }

  for (const file of filesByPrefixFromAsar(asar.entries, "app-main-")) {
    const text = asar.readFile(file);
    patches.push({
      name: "Plugins sidebar gate",
      required: false,
      file,
      text,
      regex:
        /([A-Za-z_$][\w$]*)\?\(0,\$\.jsx\)\([A-Za-z_$][\w$]*,\{tooltipContent:\(0,\$\.jsx\)\([A-Za-z_$][\w$]*,\{id:`sidebarElectron\.pluginsDisabledTooltip`/,
      replacement: (m) => m[0].replace(`${m[1]}?`, "0?"),
    });
    patches.push({
      name: "i18n gate",
      required: false,
      file,
      text,
      regex:
        /([A-Za-z_$][\w$]*)=\(0,([A-Za-z_$][\w$]*)\.useMemo\)\(\(\)=>([A-Za-z_$][\w$]*)\?\.get\(`enable_i18n`,!1\),\[\3\]\)/,
      replacement: (m) => `${m[1]}=(0,${m[2]}.useMemo)(()=>!0,[${m[3]}])`,
    });
  }

  for (const file of filesByPrefixFromAsar(asar.entries, "check-plugin-availability-")) {
    const text = asar.readFile(file);
    patches.push({
      name: "Plugin connector availability",
      required: false,
      file,
      text,
      regex: /\(([A-Za-z_$][\w$]*)=`connector-unavailable`\)/,
      replacement: (m) => `false&&(${m[1]}=\`connector-unavailable\`)`,
    });
  }

  for (const file of filesByPrefixFromAsar(asar.entries, "annotation-comment-editor-card-")) {
    const text = asar.readFile(file);
    patches.push({
      name: "Dictation authMethod gate",
      required: false,
      file,
      text,
      regex: /([A-Za-z_$][\w$]*)&&([A-Za-z_$][\w$]*)\.authMethod===`chatgpt`/,
      replacement: (m) =>
        `${m[1]}&&(${m[2]}.authMethod===\`chatgpt\`||${m[2]}.authMethod===\`apikey\`)`,
    });
  }

  for (const file of filesByPrefixFromAsar(asar.entries, "use-usage-settings-access-")) {
    const text = asar.readFile(file);
    patches.push({
      name: "Usage settings authMethod gate",
      required: false,
      file,
      text,
      regex: /let\s+([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)===`chatgpt`/,
      replacement: (m) =>
        `let ${m[1]}=${m[2]}===\`chatgpt\`||${m[2]}===\`apikey\``,
    });
  }

  return patches;
}

function dryRun(asarPath) {
  if (!fs.existsSync(asarPath)) throw new Error(`app.asar not found: ${asarPath}`);

  const asar = parseAsar(asarPath);
  try {
    const jsCount = asar.entries.filter(
      ([file]) => file.startsWith("webview/assets/") && file.endsWith(".js"),
    ).length;
    const patches = collectDryRunPatches(asar);
    let hits = 0;
    let misses = 0;
    let requiredHits = 0;
    let requiredMisses = 0;
    let optionalHits = 0;
    let optionalMisses = 0;

    console.log(`ASAR: ${asarPath}`);
    console.log(`webview asset JS files: ${jsCount}`);
    console.log("mode: dry-run only; no files are written");
    console.log("");

    for (const patch of patches) {
      patch.regex.lastIndex = 0;
      const match = patch.regex.exec(patch.text);
      if (!match) {
        misses += 1;
        if (patch.required) requiredMisses += 1;
        else optionalMisses += 1;
        console.log(`[MISS] ${patch.required ? "required" : "optional"} ${patch.name}`);
        console.log(`       file: ${patch.file}`);
        continue;
      }
      hits += 1;
      if (patch.required) requiredHits += 1;
      else optionalHits += 1;
      const replacement =
        typeof patch.replacement === "function"
          ? patch.replacement(match)
          : patch.replacement;
      console.log(`[HIT]  ${patch.required ? "required" : "optional"} ${patch.name}`);
      console.log(`       file: ${patch.file}`);
      console.log(`       from: ${match[0]}`);
      console.log(`       to:   ${replacement}`);
    }

    const brandCandidates = filesByContentFromAsar(
      asar.entries,
      asar.readFile,
      (text) => text.includes("return e!==`chatgpt`"),
    );
    console.log("");
    console.log("Brand visual candidates not patched:");
    if (brandCandidates.length === 0) console.log("  none");
    for (const file of brandCandidates) console.log(`  ${file}`);
    console.log("");
    console.log(`SUMMARY: hits=${hits} misses=${misses}`);
    console.log(
      `REQUIRED: hits=${requiredHits} misses=${requiredMisses}; OPTIONAL: hits=${optionalHits} misses=${optionalMisses}`,
    );
    return { hits, misses, requiredHits, requiredMisses, optionalHits, optionalMisses };
  } finally {
    fs.closeSync(asar.fd);
  }
}

function filesByPrefixFromDir(baseDir, prefix) {
  return fs
    .readdirSync(baseDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".js"))
    .map((name) => path.join(baseDir, name));
}

function filesByContentFromDir(baseDir, predicate) {
  const hits = [];
  for (const name of fs.readdirSync(baseDir)) {
    if (!name.endsWith(".js")) continue;
    const file = path.join(baseDir, name);
    const stat = fs.statSync(file);
    if (stat.size > 2_500_000) continue;
    const text = fs.readFileSync(file, "utf8");
    if (predicate(text, name)) hits.push(file);
  }
  return hits;
}

function applyPatch(file, name, regex, replacement, alreadyRegex, results, required = false) {
  const before = fs.readFileSync(file, "utf8");
  const basename = path.basename(file);

  if (alreadyRegex && alreadyRegex.test(before)) {
    results.skipped += 1;
    console.log(`[SKIP] ${required ? "required" : "optional"} ${name} already applied in ${basename}`);
    return;
  }

  regex.lastIndex = 0;
  const match = regex.exec(before);
  if (!match) {
    if (required) results.failedRequired += 1;
    else results.failedOptional += 1;
    console.log(`[FAIL] ${required ? "required" : "optional"} ${name} no match in ${basename}`);
    return;
  }

  const afterText =
    typeof replacement === "function" ? replacement(match) : replacement;
  const after =
    before.slice(0, match.index) +
    afterText +
    before.slice(match.index + match[0].length);
  fs.writeFileSync(file, after, "utf8");
  results.applied += 1;
  console.log(`[OK]   ${required ? "required" : "optional"} ${name} in ${basename}`);
}

function applyExtracted(baseDir) {
  if (!fs.existsSync(baseDir)) throw new Error(`assets directory not found: ${baseDir}`);

  const results = { applied: 0, skipped: 0, failedRequired: 0, failedOptional: 0 };
  const fastFiles =
    filesByPrefixFromDir(baseDir, "use-is-fast-mode-enabled-").length > 0
      ? filesByPrefixFromDir(baseDir, "use-is-fast-mode-enabled-")
      : filesByContentFromDir(
          baseDir,
          (text) =>
            text.includes("additionalSpeedTiers") &&
            text.includes("models.some") &&
            text.includes("authMethod!==`chatgpt`"),
        );

  for (const file of fastFiles) {
    applyPatch(
      file,
      "Fast gate",
      /return!\([A-Za-z_$][\w$]*\?\.authMethod!==`chatgpt`\|\|[A-Za-z_$][\w$]*\)/,
      "return true",
      /return true\}function _\(e\)\{return v\(e\)\.canUseFastMode\}/,
      results,
      true,
    );
    applyPatch(
      file,
      "Fast disabled branch",
      /if\(([A-Za-z_$][\w$]*)\?\.authMethod!==`chatgpt`\|\|([A-Za-z_$][\w$]*)\)\{/,
      (m) => `if(false&&${m[1]}?.authMethod!==\`chatgpt\`||${m[2]}){`,
      /if\(false&&[A-Za-z_$][\w$]*\?\.authMethod!==`chatgpt`\|\|[A-Za-z_$][\w$]*\)\{/,
      results,
      true,
    );
    applyPatch(
      file,
      "Fast model availability",
      /[A-Za-z_$][\w$]*\?\.models\.some\([A-Za-z_$][\w$]*\)\?\?!1/,
      "true",
      /\?b=i\[5\]:\(b=true,i\[4\]=/,
      results,
      true,
    );
  }

  for (const file of filesByPrefixFromDir(baseDir, "app-main-")) {
    applyPatch(
      file,
      "Plugins sidebar gate",
      /([A-Za-z_$][\w$]*)\?\(0,\$\.jsx\)\([A-Za-z_$][\w$]*,\{tooltipContent:\(0,\$\.jsx\)\([A-Za-z_$][\w$]*,\{id:`sidebarElectron\.pluginsDisabledTooltip`/,
      (m) => m[0].replace(`${m[1]}?`, "0?"),
      /0\?\(0,\$\.jsx\)\([A-Za-z_$][\w$]*,\{tooltipContent:\(0,\$\.jsx\)\([A-Za-z_$][\w$]*,\{id:`sidebarElectron\.pluginsDisabledTooltip`/,
      results,
      false,
    );
    applyPatch(
      file,
      "i18n gate",
      /([A-Za-z_$][\w$]*)=\(0,([A-Za-z_$][\w$]*)\.useMemo\)\(\(\)=>([A-Za-z_$][\w$]*)\?\.get\(`enable_i18n`,!1\),\[\3\]\)/,
      (m) => `${m[1]}=(0,${m[2]}.useMemo)(()=>!0,[${m[3]}])`,
      /[A-Za-z_$][\w$]*=\(0,[A-Za-z_$][\w$]*\.useMemo\)\(\(\)=>!0,\[[A-Za-z_$][\w$]*\]\),[A-Za-z_$][\w$]*=\(0,[A-Za-z_$][\w$]*\.useMemo\)\(\(\)=>[A-Za-z_$][\w$]*\?\.get\(`locale_source`/,
      results,
      false,
    );
  }

  for (const file of filesByPrefixFromDir(baseDir, "check-plugin-availability-")) {
    applyPatch(
      file,
      "Plugin connector availability",
      /\(([A-Za-z_$][\w$]*)=`connector-unavailable`\)/,
      (m) => `false&&(${m[1]}=\`connector-unavailable\`)`,
      /false&&\([A-Za-z_$][\w$]*=`connector-unavailable`\)/,
      results,
      false,
    );
  }

  for (const file of filesByPrefixFromDir(baseDir, "annotation-comment-editor-card-")) {
    applyPatch(
      file,
      "Dictation authMethod gate",
      /([A-Za-z_$][\w$]*)&&([A-Za-z_$][\w$]*)\.authMethod===`chatgpt`/,
      (m) =>
        `${m[1]}&&(${m[2]}.authMethod===\`chatgpt\`||${m[2]}.authMethod===\`apikey\`)`,
      /[A-Za-z_$][\w$]*&&\([A-Za-z_$][\w$]*\.authMethod===`chatgpt`\|\|[A-Za-z_$][\w$]*\.authMethod===`apikey`\)/,
      results,
      false,
    );
  }

  for (const file of filesByPrefixFromDir(baseDir, "use-usage-settings-access-")) {
    applyPatch(
      file,
      "Usage settings authMethod gate",
      /let\s+([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)===`chatgpt`/,
      (m) => `let ${m[1]}=${m[2]}===\`chatgpt\`||${m[2]}===\`apikey\``,
      /let\s+[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*===`chatgpt`\|\|[A-Za-z_$][\w$]*===`apikey`/,
      results,
      false,
    );
  }

  console.log("");
  console.log(
    `SUMMARY: applied=${results.applied} skipped=${results.skipped} failedRequired=${results.failedRequired} failedOptional=${results.failedOptional}`,
  );
  if (results.failedRequired > 0) throw new Error("Some required patches failed.");
}

function copyApp(src, dst) {
  if (fs.existsSync(dst)) {
    throw new Error(
      `Destination already exists: ${dst}\nDelete it first if you want a fresh patch.`,
    );
  }
  fs.mkdirSync(dst, { recursive: true });
  const result = run("robocopy.exe", [src, dst, "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:1", "/W:1"], {
    allowCodes: [0, 1, 2, 3, 4, 5, 6, 7],
  });
  return result.status;
}

function applyAll(src, dst) {
  checkNpx();

  const sourceAsar = path.join(src, "resources", "app.asar");
  const dry = dryRun(sourceAsar);
  if (dry.requiredMisses !== 0 || dry.requiredHits < 3) {
    throw new Error("Required Fast patches did not fully match. Refusing to apply.");
  }

  console.log("");
  console.log(`Copying app to: ${dst}`);
  copyApp(src, dst);

  const resources = path.join(dst, "resources");
  const appAsar = path.join(resources, "app.asar");
  const appAsarBak = path.join(resources, "app.asar.bak");
  const appAsar1 = path.join(resources, "app.asar1");
  const appDir = path.join(resources, "app");

  fs.copyFileSync(appAsar, appAsarBak);

  console.log("Extracting app.asar...");
  runNpx(["--yes", "@electron/asar", "extract", appAsar, appDir]);

  console.log("Applying JS patches...");
  applyExtracted(path.join(appDir, "webview", "assets"));

  const exe = path.join(dst, "Codex.exe");
  let usedPackedFallback = false;

  try {
    fs.renameSync(appAsar, appAsar1);
    console.log("Writing Electron fuses...");
    for (const fuse of [
      "OnlyLoadAppFromAsar=off",
      "EnableEmbeddedAsarIntegrityValidation=off",
      "GrantFileProtocolExtraPrivileges=off",
      "EnableCookieEncryption=off",
    ]) {
      runNpx(["--yes", "@electron/fuses", "write", "--app", exe, fuse]);
    }
  } catch (error) {
    usedPackedFallback = true;
    console.log("");
    console.log("Electron fuses failed; falling back to repacking patched app.asar.");
    console.log(`Fuse error: ${error.message}`);

    if (!fs.existsSync(appAsar) && fs.existsSync(appAsar1)) {
      fs.renameSync(appAsar1, appAsar);
    }

    const patchedAsar = path.join(resources, "app.asar.patched");
    if (fs.existsSync(patchedAsar)) fs.rmSync(patchedAsar, { force: true });

    runNpx(["--yes", "@electron/asar", "pack", appDir, patchedAsar]);

    if (fs.existsSync(appAsar)) fs.renameSync(appAsar, appAsar1);
    fs.renameSync(patchedAsar, appAsar);
  }

  console.log("");
  console.log("Patch complete.");
  console.log(
    usedPackedFallback
      ? "Load mode: packed patched app.asar fallback"
      : "Load mode: unpacked app directory with Electron fuses",
  );
  console.log(`Patched Codex: ${exe}`);
  console.log("Launch with:");
  console.log(`  & "${exe}"`);
}

function launch(dst) {
  const exe = path.join(dst, "Codex.exe");
  if (!fs.existsSync(exe)) throw new Error(`Patched Codex.exe not found: ${exe}`);
  cp.spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  console.log(`Launched: ${exe}`);
}

try {
  const src = findCodexInstall();
  const dst = path.resolve(argValue("--dst", defaultDst()));
  const sourceAsar = path.join(src, "resources", "app.asar");

  console.log(`Source Codex app: ${src}`);
  console.log(`Patch destination: ${dst}`);
  console.log("");

  if (mode === "dry-run") {
    const dry = dryRun(sourceAsar);
    if (dry.misses !== 0) process.exitCode = 1;
  } else if (mode === "apply") {
    applyAll(src, dst);
  } else if (mode === "launch") {
    launch(dst);
  }
} catch (error) {
  console.error("");
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}
