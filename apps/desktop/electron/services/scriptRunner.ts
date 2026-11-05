import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export interface RunScriptResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number | null;
  durationMs: number;
}

/**
 * Executes a local TypeScript or JavaScript file on the developer's machine using `npx tsx`.
 * Captures stdout and stderr, returning the trimmed output to the Electron renderer.
 */
export async function runScriptFile(
  filePath: string,
  args: string[] = [],
  cwd?: string,
): Promise<RunScriptResult> {
  const start = performance.now();
  const resolvedPath = path.resolve(filePath);
  const workingDir = cwd || path.dirname(resolvedPath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      success: false,
      error: `File not found on local machine: ${resolvedPath}`,
      durationMs: 0,
    };
  }

  return new Promise((resolve) => {
    const isTs = resolvedPath.endsWith(".ts") || resolvedPath.endsWith(".tsx") || resolvedPath.endsWith(".mts");
    const cmd = isTs ? "npx" : "node";
    const cmdArgs = isTs ? ["tsx", resolvedPath, ...args] : [resolvedPath, ...args];

    const proc = spawn(cmd, cmdArgs, {
      cwd: workingDir,
      shell: true,
      env: {
        ...process.env,
      },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("close", (code) => {
      const durationMs = Math.round(performance.now() - start);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();

      if (code === 0) {
        resolve({
          success: true,
          output: stdout,
          exitCode: code,
          durationMs,
        });
      } else {
        resolve({
          success: false,
          output: stdout || undefined,
          error: stderr || `Script process exited with code ${code}`,
          exitCode: code,
          durationMs,
        });
      }
    });

    proc.on("error", (err: Error) => {
      const durationMs = Math.round(performance.now() - start);
      resolve({
        success: false,
        error: err.message,
        durationMs,
      });
    });
  });
}

