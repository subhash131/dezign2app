const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const desktopDir = path.join(__dirname, "..");
const args = process.argv.slice(2);
const hostPlatform = process.platform; // 'win32', 'darwin', 'linux'

const isDev =
  args.includes("--dev") ||
  args.includes("--development") ||
  process.env.BUILD_ENV === "development" ||
  process.env.APP_ENV === "development";

const targetEnv = isDev ? "development" : "production";

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {}
}

if (targetEnv === "development") {
  loadEnvFile(path.join(desktopDir, "../web/.env"));

  process.env.NEXT_PUBLIC_CONVEX_URL =
    process.env.NEXT_PUBLIC_CONVEX_URL || "https://neighborly-setter-541.convex.cloud";
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://neighborly-setter-541.convex.site";
  process.env.CONVEX_URL =
    process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  process.env.CONVEX_SITE_URL =
    process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  process.env.BETTER_AUTH_URL =
    process.env.BETTER_AUTH_URL || "http://localhost:46500";
  process.env.NEXT_PUBLIC_APP_URL =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:46500";
  process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL =
    process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL || "http://localhost:46500";
  process.env.BETTER_AUTH_TRUSTED_ORIGINS =
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ||
    "http://localhost:46500,http://localhost:3000,dezign2app://";
} else {
  loadEnvFile(path.join(desktopDir, "../web/.env.production"));
  loadEnvFile(path.join(desktopDir, "../web/.env"));

  process.env.NEXT_PUBLIC_CONVEX_URL =
    process.env.NEXT_PUBLIC_CONVEX_URL || "https://gregarious-quail-82.convex.cloud";
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://gregarious-quail-82.convex.site";
  process.env.CONVEX_URL =
    process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  process.env.CONVEX_SITE_URL =
    process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  process.env.BETTER_AUTH_URL =
    process.env.BETTER_AUTH_URL || "https://www.dezign2app.com";
  process.env.NEXT_PUBLIC_APP_URL =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.dezign2app.com";
  process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL =
    process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL || "https://www.dezign2app.com";
  process.env.BETTER_AUTH_TRUSTED_ORIGINS =
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ||
    "https://dezign2app.com,https://www.dezign2app.com,dezign2app://";
}

process.env.BUILD_ENV = targetEnv;
process.env.APP_ENV = targetEnv;

function copyDirPlain(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.lstatSync(srcPath);
    if (stat.isSymbolicLink()) {
      continue;
    } else if (stat.isDirectory()) {
      copyDirPlain(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function stageWebResources() {
  const webDir = path.join(desktopDir, "../web");
  const buildWebDir = path.join(desktopDir, "build-web");
  const standaloneDir = path.join(webDir, ".next", "standalone");
  const standaloneServer = path.join(standaloneDir, "apps", "web", "server.js");

  const buildEnvStampPath = path.join(webDir, ".next-build-env.json");
  const fallbackStampPath = path.join(webDir, ".next", "build-env.json");
  let currentBuildEnv = null;
  const stampFile = fs.existsSync(buildEnvStampPath) ? buildEnvStampPath : fallbackStampPath;
  if (fs.existsSync(stampFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(stampFile, "utf8"));
      currentBuildEnv = data.env;
    } catch (e) {}
  }

  const standaloneServerExists =
    fs.existsSync(standaloneServer) || fs.existsSync(path.join(standaloneDir, "server.js"));
  const needsRebuild =
    !standaloneServerExists || !currentBuildEnv || currentBuildEnv !== targetEnv;

  if (needsRebuild) {
    console.log(
      `\n==> [Auto-Build] Next.js standalone bundle requires build for ${targetEnv.toUpperCase()} (current: ${
        currentBuildEnv || "none"
      })...`
    );
    const buildCmd =
      targetEnv === "development"
        ? "pnpm --filter web run build:dev"
        : "pnpm --filter web run build:prod";
    execSync(buildCmd, {
      stdio: "inherit",
      cwd: path.join(desktopDir, "../.."),
      env: { ...process.env, BUILD_ENV: targetEnv },
    });
  }

  console.log(`\n==> Staging Next.js standalone Web runtime [${targetEnv.toUpperCase()}] (~50MB)...`);

  // Clean old build-web folder
  if (fs.existsSync(buildWebDir)) {
    fs.rmSync(buildWebDir, { recursive: true, force: true });
  }
  fs.mkdirSync(buildWebDir, { recursive: true });

  if (fs.existsSync(standaloneDir)) {
    console.log("   ✓ Staging Next.js standalone bundle (clean flat node_modules)...");

    // 1. Copy standalone apps/web (skip node_modules inside it which are pnpm symlinks)
    const standaloneWeb = path.join(standaloneDir, "apps", "web");
    if (fs.existsSync(standaloneWeb)) {
      for (const item of fs.readdirSync(standaloneWeb)) {
        if (item === "node_modules") continue;
        const sPath = path.join(standaloneWeb, item);
        const dPath = path.join(buildWebDir, "apps", "web", item);
        const stat = fs.lstatSync(sPath);
        if (stat.isDirectory()) {
          copyDirPlain(sPath, dPath);
        } else {
          fs.mkdirSync(path.dirname(dPath), { recursive: true });
          fs.copyFileSync(sPath, dPath);
        }
      }
    } else {
      copyDirPlain(standaloneDir, buildWebDir);
    }

    // 2. Copy static files & public assets, and generate public-only safe .env
    const nextStaticSrc = path.join(webDir, ".next", "static");
    const publicSrc = path.join(webDir, "public");

    const candidateTargets = [
      buildWebDir,
      path.join(buildWebDir, "apps", "web"),
    ].filter((dir) => fs.existsSync(dir));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || "";
    const convexSiteUrl =
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
      process.env.CONVEX_SITE_URL ||
      (convexUrl ? convexUrl.replace(".convex.cloud", ".convex.site") : "");
    const desktopAuthUrl = process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL || "";
    const betterAuthUrl = process.env.BETTER_AUTH_URL || appUrl || "";
    const betterAuthTrustedOrigins =
      process.env.BETTER_AUTH_TRUSTED_ORIGINS || "dezign2app://";
    const betterAuthSecret = process.env.BETTER_AUTH_SECRET || "";

    const publicSafeEnv = [
      convexUrl ? `NEXT_PUBLIC_CONVEX_URL=${convexUrl}` : null,
      convexSiteUrl ? `NEXT_PUBLIC_CONVEX_SITE_URL=${convexSiteUrl}` : null,
      convexUrl ? `CONVEX_URL=${convexUrl}` : null,
      convexSiteUrl ? `CONVEX_SITE_URL=${convexSiteUrl}` : null,
      appUrl ? `NEXT_PUBLIC_APP_URL=${appUrl}` : null,
      desktopAuthUrl ? `NEXT_PUBLIC_DESKTOP_AUTH_URL=${desktopAuthUrl}` : null,
      betterAuthUrl ? `BETTER_AUTH_URL=${betterAuthUrl}` : null,
      betterAuthTrustedOrigins ? `BETTER_AUTH_TRUSTED_ORIGINS=${betterAuthTrustedOrigins}` : null,
      betterAuthSecret ? `BETTER_AUTH_SECRET=${betterAuthSecret}` : null,
      "NODE_ENV=production",
      `APP_ENV=${targetEnv}`,
    ].filter(Boolean).join("\n") + "\n";

    for (const target of candidateTargets) {
      if (fs.existsSync(nextStaticSrc)) {
        copyDirPlain(nextStaticSrc, path.join(target, ".next", "static"));
      }
      if (fs.existsSync(publicSrc)) {
        copyDirPlain(publicSrc, path.join(target, "public"));
      }
      fs.writeFileSync(path.join(target, ".env"), publicSafeEnv, "utf8");
    }

    // 3. Copy clean flat packages from .pnpm virtual store
    const pnpmDir = path.join(standaloneDir, "node_modules", ".pnpm");
    const targetNm = path.join(buildWebDir, "node_modules");
    fs.mkdirSync(targetNm, { recursive: true });

    if (fs.existsSync(pnpmDir)) {
      for (const pnpmEntry of fs.readdirSync(pnpmDir)) {
        if (pnpmEntry === "node_modules") continue;
        const innerNm = path.join(pnpmDir, pnpmEntry, "node_modules");
        if (fs.existsSync(innerNm)) {
          for (const pkg of fs.readdirSync(innerNm)) {
            const pkgPath = path.join(innerNm, pkg);
            const stat = fs.lstatSync(pkgPath);
            if (stat.isSymbolicLink()) continue;

            if (pkg.startsWith("@") && stat.isDirectory()) {
              for (const sPkg of fs.readdirSync(pkgPath)) {
                const sPath = path.join(pkgPath, sPkg);
                const sStat = fs.lstatSync(sPath);
                if (sStat.isSymbolicLink()) continue;
                if (sStat.isDirectory()) {
                  copyDirPlain(sPath, path.join(targetNm, pkg, sPkg));
                }
              }
            } else if (stat.isDirectory()) {
              copyDirPlain(pkgPath, path.join(targetNm, pkg));
            }
          }
        }
      }
    }
  } else {
    console.warn("   ⚠️  .next/standalone not found. Staging standard .next build...");
    const nextSrc = path.join(webDir, ".next");
    const publicSrc = path.join(webDir, "public");
    const envSrc = path.join(webDir, ".env");
    if (fs.existsSync(nextSrc)) copyDirPlain(nextSrc, path.join(buildWebDir, ".next"));
    if (fs.existsSync(publicSrc)) copyDirPlain(publicSrc, path.join(buildWebDir, "public"));
    fs.writeFileSync(path.join(buildWebDir, ".env"), publicSafeEnv, "utf8");
    if (fs.existsSync(pkgSrc)) fs.copyFileSync(pkgSrc, path.join(buildWebDir, "package.json"));
  }

  console.log("   ✓ Web runtime staged successfully (~50MB, 100% self-contained)");
}

function runElectronBuilder(builderArgs, cwd) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "npx.cmd" : "npx";
    const flags = Array.isArray(builderArgs) ? builderArgs : [builderArgs];
    const child = spawn(cmd, ["electron-builder", ...flags], {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      shell: true,
    });

    let compressionTimer = null;
    let startTime = null;
    let frameIdx = 0;
    let isCompressing = false;
    const hourglassFrames = ["⏳", "⌛"];
    const dotsFrames = ["...", "   ", ".  ", ".. "];

    function renderSpinner() {
      if (!isCompressing) return;
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsedSeconds / 60);
      const secs = elapsedSeconds % 60;
      const formattedTime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const hourglass = hourglassFrames[Math.floor(frameIdx / 2) % hourglassFrames.length];
      const dots = dotsFrames[frameIdx % dotsFrames.length];
      frameIdx++;

      process.stdout.write(`\r\x1b[K   ${hourglass} Compressing installer archive${dots} (elapsed: ${formattedTime})`);
    }

    function startCompressionTimer() {
      if (isCompressing) return;
      isCompressing = true;
      startTime = Date.now();
      frameIdx = 0;

      console.log("\n📦 [Packaging in Progress]");
      console.log("   Compressing and packaging application files and Next.js runtime into the installer package...\n");

      renderSpinner();
      compressionTimer = setInterval(renderSpinner, 500);
    }

    function stopCompressionTimer() {
      if (isCompressing) {
        clearInterval(compressionTimer);
        compressionTimer = null;
        isCompressing = false;
        const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const formattedTime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        process.stdout.write(`\r\x1b[K   ✓ Compression step finished! (${formattedTime})\n\n`);
      }
    }

    function handleData(chunk, isStderr = false) {
      const text = chunk.toString();
      if (
        text.includes("building        target=nsis") ||
        text.includes("building        target=portable") ||
        text.includes("building        target=AppImage") ||
        text.includes("7za.exe")
      ) {
        startCompressionTimer();
      }
      if (
        text.includes("building block map") ||
        text.includes("signing with signtool.exe  path=release\\D2A Setup") ||
        text.includes("building        target=tar.gz") ||
        text.includes("packaging complete")
      ) {
        stopCompressionTimer();
      }

      if (isStderr) {
        if (isCompressing) process.stdout.write("\r\x1b[K");
        process.stderr.write(chunk);
        if (isCompressing) renderSpinner();
      } else {
        if (isCompressing) process.stdout.write("\r\x1b[K");
        process.stdout.write(chunk);
        if (isCompressing) renderSpinner();
      }
    }

    child.stdout.on("data", (data) => handleData(data, false));
    child.stderr.on("data", (data) => handleData(data, true));

    child.on("close", (code) => {
      stopCompressionTimer();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`electron-builder exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      stopCompressionTimer();
      reject(err);
    });
  });
}

async function run() {
  console.log("\n================================================================");
  console.log(`==> Dezign2App Desktop Packaging: [${targetEnv.toUpperCase()}]`);
  console.log(`    Convex Cloud:      ${process.env.NEXT_PUBLIC_CONVEX_URL}`);
  console.log(`    Convex Actions:    ${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}`);
  console.log(`    Auth / Portal URL: ${process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL}`);
  console.log("================================================================\n");

  // 1. Generate multi-resolution icons
  console.log("==> [1/3] Generating application icons...");
  execSync("node scripts/generate-icons.js", {
    stdio: "inherit",
    cwd: desktopDir,
  });

  // 2. Compile Electron TypeScript
  console.log("\n==> [2/3] Compiling Electron TypeScript...");
  execSync("npx tsc -p tsconfig.electron.json", {
    stdio: "inherit",
    cwd: desktopDir,
  });

  // 3. Determine target platforms
  let targets = [];

  if (args.includes("--win")) targets.push("win");
  if (args.includes("--mac")) targets.push("mac");
  if (args.includes("--linux")) targets.push("linux");
  if (args.includes("--dir")) targets.push("dir");

  // Determine specific architecture filters if provided
  const archFlags = [];
  if (args.includes("--x64")) archFlags.push("--x64");
  if (args.includes("--ia32") || args.includes("--x32") || args.includes("--win32")) archFlags.push("--ia32");
  if (args.includes("--arm64")) archFlags.push("--arm64");

  // If no explicit targets passed or --all requested
  if (targets.length === 0 || args.includes("--all")) {
    if (args.includes("--all")) {
      if (hostPlatform === "win32") {
        targets = ["win", "linux"];
      } else if (hostPlatform === "darwin") {
        targets = ["mac", "win", "linux"];
      } else {
        targets = ["linux", "win"];
      }
    } else {
      // Default to the host platform
      if (hostPlatform === "win32") {
        targets = ["win"];
      } else if (hostPlatform === "darwin") {
        targets = ["mac"];
      } else {
        targets = ["linux"];
      }
    }
  }

  // 4. On Windows, ensure any previous running instance of D2A or D2A Dev is terminated
  if (hostPlatform === "win32") {
    try {
      execSync('powershell -Command "Stop-Process -Name D2A, \'D2A Dev\' -Force -ErrorAction SilentlyContinue"', {
        stdio: "ignore",
      });
    } catch (e) {}
  }

  // 5. Stage Web Runtime
  stageWebResources();

  // 6. Package for each requested target
  console.log("\n==> [3/3] Packaging desktop executables...");
  for (const target of targets) {
    const flag = target === "dir" ? "--dir" : `--${target}`;
    const builderArgs = [flag, ...archFlags];

    if (targetEnv === "development") {
      builderArgs.push(
        '--config.productName="D2A Dev"',
        '--config.appId="com.dezign2app.desktop.dev"',
        '--config.nsis.shortcutName="D2A Dev"',
        '--config.nsis.artifactName=${productName}-Setup-${version}-${arch}.${ext}',
        '--config.artifactName=${productName}-${version}-${arch}.${ext}'
      );
    }

    console.log(`\n── Building target: ${target.toUpperCase()} (${builderArgs.join(" ")}) ──`);

    if (target === "mac" && hostPlatform !== "darwin") {
      console.warn(`\n⚠️  Cannot package macOS target directly on ${hostPlatform}.`);
      console.warn("   Apple requires a macOS environment to compile and sign macOS binaries.");
      console.warn("   Trigger the GitHub Actions release workflow (or run on macOS) to generate macOS .dmg.\n");
      continue;
    }

    try {
      await runElectronBuilder(builderArgs, desktopDir);
    } catch (err) {
      if (target === "linux" && hostPlatform === "win32") {
        console.warn("\n⚠️  Linux AppImage packaging on Windows encountered a symlink restriction.");
        console.warn("   (Enable Windows Developer Mode or build Linux via Docker/CI for full AppImage binaries.)\n");
      } else {
        throw err;
      }
    }
  }

  console.log("\n✓ Desktop packaging completed successfully!");
}

run().catch((err) => {
  console.error("\n❌ Desktop build failed:", err.message);
  process.exit(1);
});
