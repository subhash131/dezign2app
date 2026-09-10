import { getElectronAPI } from "@/lib/electron";

/**
 * Normalizes an environment variable name.
 * Strips leading 'process.env.' and non-alphanumeric/underscore chars.
 * E.g. 'process.env.STRIPE_SECRET_KEY' -> 'STRIPE_SECRET_KEY'
 */
export function cleanEnvVarName(name: string): string {
  if (!name) return "";
  let clean = name.trim();
  if (clean.startsWith("process.env.")) {
    clean = clean.replace(/^process\.env\./, "");
  }
  return clean.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
}

/**
 * Formats a clean variable name into a code reference.
 * E.g. 'STRIPE_SECRET_KEY' -> 'process.env.STRIPE_SECRET_KEY'
 */
export function formatEnvVarRef(name: string): string {
  const clean = cleanEnvVarName(name);
  return clean ? `process.env.${clean}` : "";
}

/**
 * Updates or appends a key=value pair inside a .env file content string.
 */
export function updateEnvString(
  existingContent: string,
  key: string,
  value: string,
): string {
  const cleanKey = cleanEnvVarName(key);
  if (!cleanKey) return existingContent;

  const lines = existingContent ? existingContent.split(/\r?\n/) : [];
  let found = false;

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }
    const lineKey = trimmed.substring(0, trimmed.indexOf("=")).trim();
    if (lineKey === cleanKey) {
      found = true;
      return `${cleanKey}=${value}`;
    }
    return line;
  });

  if (!found) {
    const lastLine = newLines[newLines.length - 1];
    if (lastLine !== undefined && lastLine.trim() === "") {
      newLines.splice(newLines.length - 1, 0, `${cleanKey}=${value}`);
    } else {
      newLines.push(`${cleanKey}=${value}`);
    }
  }

  return newLines.join("\n");
}

/**
 * Retrieves the currently active project output directory from localStorage.
 */
export function getActiveProjectOutputDir(projectId?: string): string {
  if (typeof window === "undefined") return "";
  try {
    if (projectId) {
      const saved =
        localStorage.getItem(`workspace_dir_${projectId}`) ||
        localStorage.getItem(`docker_dir_${projectId}`);
      if (saved) return saved;
    }
    return localStorage.getItem("dezign2app_workspace_dir") || "";
  } catch {
    return "";
  }
}

/**
 * Saves a secret environment variable to the local .env file on disk.
 * This value is intentionally NOT saved to the database.
 */
export async function saveLocalEnvVariable(
  key: string,
  value: string,
  projectId?: string,
): Promise<{ success: boolean; path?: string }> {
  const cleanKey = cleanEnvVarName(key);
  if (!cleanKey) return { success: false };

  // 1. Cache in browser localStorage so the user can see their local secret across page refreshes
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`dezign2app_env_${cleanKey}`, value);
    } catch {}
  }

  const outputDir = getActiveProjectOutputDir(projectId);

  // 2. If running inside Electron desktop app, write directly to disk via IPC
  const api = getElectronAPI();
  if (api?.fs?.readFile && api?.fs?.writeProject && outputDir) {
    try {
      let existingContent = "";
      try {
        const fileRes = await api.fs.readFile(outputDir, ".env");
        existingContent = fileRes?.content || "";
      } catch {
        // File may not exist yet
      }
      const updatedContent = updateEnvString(existingContent, cleanKey, value);
      await api.fs.writeProject(outputDir, [
        { filename: ".env", content: updatedContent },
      ]);
    } catch (err) {
      console.warn("Could not save to .env via Electron FS:", err);
    }
  }

  // 3. Call local Next.js API route to write to local .env on developer machine
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: cleanKey,
          value,
          outputDir,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, path: data.path };
      }
    } catch (err) {
      // API call may be silent in offline or restricted environments
    }
  }

  return { success: true };
}

/**
 * Synchronously retrieves cached local env value from localStorage.
 */
export function getLocalEnvVariable(key: string): string {
  const cleanKey = cleanEnvVarName(key);
  if (!cleanKey || typeof window === "undefined") return "";
  try {
    return localStorage.getItem(`dezign2app_env_${cleanKey}`) || "";
  } catch {
    return "";
  }
}

/**
 * Asynchronously fetches the value from the local .env file or local storage.
 */
export async function fetchLocalEnvVariable(
  key: string,
  projectId?: string,
): Promise<string> {
  const cleanKey = cleanEnvVarName(key);
  if (!cleanKey) return "";

  const outputDir = getActiveProjectOutputDir(projectId);

  // 1. Prioritize reading live from local .env file on disk (Electron FS)
  const api = getElectronAPI();
  if (api?.fs?.readFile && outputDir) {
    try {
      const fileRes = await api.fs.readFile(outputDir, ".env");
      const content = fileRes?.content || "";
      const match = content.match(new RegExp(`^${cleanKey}=(.*)$`, "m"));
      if (match && match[1] !== undefined) {
        const val = match[1].trim();
        if (typeof window !== "undefined") {
          localStorage.setItem(`dezign2app_env_${cleanKey}`, val);
        }
        return val;
      }
    } catch {}
  }

  // 2. Prioritize reading live from local .env file on disk (Next.js /api/env)
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams({ key: cleanKey });
      if (outputDir) params.set("outputDir", outputDir);
      const res = await fetch(`/api/env?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.value !== undefined && data.value !== null && data.value !== "") {
          localStorage.setItem(`dezign2app_env_${cleanKey}`, data.value);
          return data.value;
        }
      }
    } catch {}
  }

  // 3. Fallback to localStorage cache only if live disk read could not find the key
  const cached = getLocalEnvVariable(cleanKey);
  if (cached) return cached;

  return "";
}

/**
 * Removes a key from .env file content string.
 */
export function removeEnvString(existingContent: string, key: string): string {
  const cleanKey = cleanEnvVarName(key);
  if (!cleanKey || !existingContent) return existingContent;

  const lines = existingContent.split(/\r?\n/);
  const newLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) {
      return true;
    }
    const lineKey = trimmed.substring(0, trimmed.indexOf("=")).trim();
    return lineKey !== cleanKey;
  });

  return newLines.join("\n");
}

/**
 * Removes an environment variable from the local .env file on disk and localStorage.
 */
export async function deleteLocalEnvVariable(
  key: string,
  projectId?: string,
): Promise<{ success: boolean }> {
  const cleanKey = cleanEnvVarName(key);
  if (!cleanKey) return { success: false };

  // 1. Remove from localStorage
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(`dezign2app_env_${cleanKey}`);
    } catch {}
  }

  const outputDir = getActiveProjectOutputDir(projectId);

  // 2. If running inside Electron desktop app, remove line from .env
  const api = getElectronAPI();
  if (api?.fs?.readFile && api?.fs?.writeProject && outputDir) {
    try {
      let existingContent = "";
      try {
        const fileRes = await api.fs.readFile(outputDir, ".env");
        existingContent = fileRes?.content || "";
      } catch {}
      if (existingContent) {
        const updatedContent = removeEnvString(existingContent, cleanKey);
        await api.fs.writeProject(outputDir, [
          { filename: ".env", content: updatedContent },
        ]);
      }
    } catch (err) {
      console.warn("Could not delete from .env via Electron FS:", err);
    }
  }

  // 3. Call local Next.js API route to delete from .env
  if (typeof window !== "undefined") {
    try {
      await fetch("/api/env", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: cleanKey,
          outputDir,
        }),
      });
    } catch {}
  }

  return { success: true };
}
