import net from "net";
import fs from "fs";
import path from "path";

/**
 * Resolves an environment variable value from process.env or local .env file.
 */
export function resolveEnvValue(envKey: string, projectDir?: string): string | undefined {
  if (process.env[envKey]) return process.env[envKey];
  const targetDir = projectDir || process.cwd();
  const envPath = path.join(targetDir, ".env");
  if (!fs.existsSync(envPath)) return undefined;

  try {
    const content = fs.readFileSync(envPath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const key = trimmed.substring(0, trimmed.indexOf("=")).trim();
      if (key === envKey) {
        let val = trimmed.substring(trimmed.indexOf("=") + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        return val;
      }
    }
  } catch {}
  return undefined;
}

/**
 * Checks TCP socket connectivity with a configurable timeout.
 */
export function checkTcpSocket(
  host: string,
  port: number,
  timeoutMs = 2500,
): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      socket.destroy();
      resolve({ reachable: true, latencyMs });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        reachable: false,
        latencyMs: timeoutMs,
        error: `Connection timed out after ${timeoutMs}ms`,
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: 0, error: err.message });
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      resolve({
        reachable: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
