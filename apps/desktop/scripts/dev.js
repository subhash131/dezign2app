const { spawn } = require("child_process");
const electron = require("electron");

// Ensure ELECTRON_RUN_AS_NODE is stripped so Electron runs as Electron, not pure Node.js
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env,
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("Failed to launch Electron:", err);
  process.exit(1);
});

