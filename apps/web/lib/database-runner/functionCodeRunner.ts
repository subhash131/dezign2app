import vm from "node:vm";
import type { DatabaseSync } from "node:sqlite";
import type * as tsType from "typescript";

declare const __non_webpack_require__: typeof require | undefined;

// Lazy-load typescript so execution never crashes if typescript is not bundled in runtime
let tsModule: typeof tsType | null = null;
let tsAttempted = false;

function getTs(): typeof tsType | null {
  if (tsAttempted) return tsModule;
  tsAttempted = true;
  try {
    const req =
      typeof __non_webpack_require__ !== "undefined"
        ? __non_webpack_require__
        : typeof require !== "undefined"
          ? require
          : null;
    if (req) {
      const modName = "typescript";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      tsModule = req(modName);
    }
  } catch {
    tsModule = null;
  }
  return tsModule;
}

/**
 * Lightweight fallback to strip TypeScript type annotations
 * and ES module export keywords when typescript module is not bundled in runtime.
 */
function transpileFallback(code: string, fnName?: string): string {
  let js = code;

  // 1. Remove interfaces: interface Foo { ... }
  js = js.replace(/(?:^|\n)\s*(?:export\s+)?interface\s+[A-Za-z0-9_$]+(?:\s*<[^>]*>)?(?:\s+extends\s+[^{]+)?\s*\{[\s\S]*?\}/g, "\n");

  // 2. Remove type aliases: type Foo = ...;
  js = js.replace(/(?:^|\n)\s*(?:export\s+)?type\s+[A-Za-z0-9_$]+(?:\s*<[^>]*>)?\s*=[\s\S]*?;/g, "\n");

  // 3. Remove inline type assertions: 'as const', 'as Type', 'as Type[]'
  js = js.replace(/\s+as\s+[A-Za-z0-9_$]+(?:\s*<[^>]*>)?(?:\[\])?/g, "");

  // 4. Remove function return type annotations: e.g. "): Promise<void> {" or "): string =>"
  js = js.replace(/\)\s*:\s*(?:Promise\s*<[^>]+>|[A-Za-z0-9_$]+(?:\s*<[^>]*>)?(?:\[\])?)\s*(=>|\{)/g, ") $1");

  // 5. Remove typed destructuring in parameters: e.g. "({ a, b }: { ... })" -> "({ a, b })"
  js = js.replace(/\(\s*(\{[\s\S]*?\})\s*:\s*\{[\s\S]*?\}\s*\)/g, "($1)");
  js = js.replace(/\(\s*(\{[\s\S]*?\})\s*:\s*[A-Za-z0-9_$]+(?:\s*<[^>]*>)?\s*\)/g, "($1)");

  // 6. Remove simple parameter type annotations: e.g. "(a: string, b?: number = 10)" -> "(a, b = 10)"
  js = js.replace(/\(([^()]*)\)\s*(=>|\{)/g, (fullMatch, paramList: string, trailer: string) => {
    if (!paramList.includes(":")) return fullMatch;
    const parts = paramList.split(",");
    const cleaned = parts.map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      const colonIdx = trimmed.indexOf(":");
      const eqIdx = trimmed.indexOf("=");
      if (colonIdx !== -1 && (eqIdx === -1 || colonIdx < eqIdx)) {
        const paramName = trimmed.slice(0, colonIdx).replace(/\?$/, "").trim();
        const defaultVal = eqIdx !== -1 ? " = " + trimmed.slice(eqIdx + 1).trim() : "";
        return `${paramName}${defaultVal}`;
      }
      return trimmed;
    });
    return `(${cleaned.join(", ")}) ${trailer}`;
  });

  // 7. Remove variable type annotations: const x: number = 10 -> var x = 10
  js = js.replace(
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*:\s*[^=;\n]+(=)/g,
    "\nvar $1 $2"
  );

  // 8. Convert top-level `export function` -> `function` and expose to exports
  js = js.replace(/(?:^|\n)\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)?/g, (match, name) => {
    const fn = name || "defaultFn";
    return `\nasync function ${fn}`;
  });
  js = js.replace(/(?:^|\n)\s*export\s+(?=(?:async\s+)?function\b)/g, "\n");

  // 9. Convert top-level `export const/let/var name =` -> `var name = exports.name =`
  js = js.replace(/(?:^|\n)\s*export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/g, "\nvar $1 = exports.$1 =");

  // 10. Convert any top-level `const name =` or `let name =` matching fnName to `var` so it's accessible in VM
  if (fnName) {
    js = js.replace(new RegExp(`(?:^|\\n)\\s*(?:const|let)\\s+(${fnName})\\s*=`, "g"), "\nvar $1 = exports.$1 =");
    js += `\nif (typeof ${fnName} === "function") { try { exports["${fnName}"] = ${fnName}; } catch (e) {} }\n`;
  }

  return js;
}

export interface ExecuteFunctionCodeOptions {
  code: string;
  name?: string;
  params?: { name: string; type?: string; required?: boolean }[];
  args?: Record<string, unknown>;
  db?: DatabaseSync;
  tableName?: string;
  safeTable?: string;
  timeoutMs?: number;
}

export interface FunctionCodeResult {
  success: boolean;
  output?: unknown;
  error?: string;
  rawCommand: string;
  durationMs: number;
  logs?: string[];
}

/**
 * Executes custom JavaScript or TypeScript database operation function code
 * inside a secure, sandboxed Node.js VM context with database helpers.
 */
export async function executeFunctionCode(
  options: ExecuteFunctionCodeOptions,
): Promise<FunctionCodeResult> {
  const start = performance.now();
  const {
    code,
    name = "operation",
    params = [],
    args = {},
    db,
    tableName = "table",
    safeTable = tableName,
    timeoutMs = 60_000, // 1 minutes
  } = options;

  const rawCode = (code || "").trim();

  // Invocation signature: e.g. `test({ key: "conversations:1001" })`
  const argEntries = Object.entries(args);
  const formattedArgs =
    argEntries.length > 0
      ? `{ ${argEntries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }`
      : "";
  const rawCommand = `${name}(${formattedArgs})`;

  if (!rawCode) {
    return {
      success: false,
      error: "No function implementation code provided to execute.",
      rawCommand,
      durationMs: 0,
    };
  }

  // 1. Prepare code for transpilation
  let codeToTranspile = rawCode;
  const paramNames = params.map((p) => p.name);

  // Check if code has function declaration or arrow function
  const hasFunctionDef =
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/.test(codeToTranspile) ||
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).test(codeToTranspile) ||
    new RegExp(`(?:const|let|var)\\s+${name}\\s*=`).test(codeToTranspile) ||
    /(?:const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/.test(codeToTranspile);

  // If the user only wrote function body statements with `return`, wrap into a function
  if (!hasFunctionDef && /^\s*return\b/m.test(codeToTranspile)) {
    codeToTranspile = `async function ${name}(${paramNames.join(", ")}) {\n${codeToTranspile}\n}`;
  }

  // 2. Transpile TypeScript to CommonJS JavaScript
  let jsCode: string;
  try {
    const ts = getTs();
    if (ts) {
      jsCode = ts.transpileModule(codeToTranspile, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          removeComments: false,
        },
      }).outputText;
    } else {
      jsCode = transpileFallback(codeToTranspile, name);
    }
  } catch (transpileErr) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      success: false,
      error: `Transpilation error: ${transpileErr instanceof Error ? transpileErr.message : String(transpileErr)}`,
      rawCommand,
      durationMs,
    };
  }

  // 3. Setup sandbox context
  const contextExports: Record<string, unknown> = {};
  const contextModule = { exports: contextExports };
  const logs: string[] = [];

  // Setup prepared statement helpers if SQLite db is available
  const preparedStmts: Record<string, unknown> = {};
  if (db && typeof db.prepare === "function") {
    try {
      preparedStmts.stmtFindAll = db.prepare(`SELECT * FROM ${safeTable} LIMIT ? OFFSET ?`);
    } catch {}
    try {
      preparedStmts.stmtFindById = db.prepare(`SELECT * FROM ${safeTable} WHERE id = ? LIMIT 1`);
    } catch {}
    try {
      preparedStmts.stmtDelete = db.prepare(`DELETE FROM ${safeTable} WHERE id = ?`);
    } catch {}
  }

  const sandboxContext: Record<string, unknown> = {
    exports: contextExports,
    module: contextModule,
    console: {
      log: (...m: unknown[]) => logs.push(m.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ")),
      warn: (...m: unknown[]) => logs.push(m.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ")),
      error: (...m: unknown[]) => logs.push(m.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ")),
      info: (...m: unknown[]) => logs.push(m.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ")),
    },
    db,
    tableName: safeTable,
    safeTable,
    args: { ...args },
    ...args,
    ...preparedStmts,
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    Buffer,
    setTimeout,
    clearTimeout,
    __result: undefined,
  };

  // 4. Run inside VM
  try {
    const vmContext = vm.createContext(sandboxContext);
    const script = new vm.Script(jsCode);
    script.runInContext(vmContext, { timeout: timeoutMs });

    // Locate the executable function in context
    type TargetFunction = (...a: unknown[]) => unknown;

    let targetFn: TargetFunction | null = null;

    if (typeof (vmContext.exports as Record<string, unknown>)?.[name] === "function") {
      targetFn = (vmContext.exports as Record<string, unknown>)[name] as TargetFunction;
    } else if (typeof vmContext[name] === "function") {
      targetFn = vmContext[name] as TargetFunction;
    } else if (typeof (vmContext.exports as Record<string, unknown>)?.default === "function") {
      targetFn = (vmContext.exports as Record<string, unknown>).default as TargetFunction;
    } else if (typeof (vmContext.module as { exports?: unknown })?.exports === "function") {
      targetFn = (vmContext.module as { exports: TargetFunction }).exports;
    } else {
      // Find the first exported or top-level function
      const expKeys = Object.keys(vmContext.exports as Record<string, unknown> || {});
      for (const k of expKeys) {
        if (typeof (vmContext.exports as Record<string, unknown>)[k] === "function") {
          targetFn = (vmContext.exports as Record<string, unknown>)[k] as TargetFunction;
          break;
        }
      }
      if (!targetFn) {
        const topKeys = Object.keys(vmContext);
        for (const k of topKeys) {
          if (
            k !== "console" &&
            k !== "setTimeout" &&
            k !== "clearTimeout" &&
            typeof vmContext[k] === "function" &&
            k[0] !== k[0]?.toUpperCase() // exclude classes/constructors like Date, Math
          ) {
            targetFn = vmContext[k] as TargetFunction;
            break;
          }
        }
      }
    }

function extractParamNames(code: string, fnName: string): { names: string[]; isDestructured: boolean } {
  const match =
    code.match(new RegExp(`(?:function\\s+${fnName}|function|const\\s+${fnName}\\s*=\\s*(?:async\\s*)?)\\s*\\(([^)]*)\\)`)) ||
    code.match(/(?:function|\(([^)]*)\)\s*=>)/);
  if (!match || !match[1]) return { names: [], isDestructured: false };
  const raw = match[1].trim();
  if (!raw) return { names: [], isDestructured: false };
  if (raw.startsWith("{")) return { names: [], isDestructured: true };
  const names = raw
    .split(",")
    .map((p) => {
      const withoutColon = p.trim().split(":")[0] ?? "";
      return withoutColon.split("=")[0]?.trim() ?? "";
    })
    .filter(Boolean);
  return { names, isDestructured: false };
}

    let output: unknown;
    if (targetFn) {
      const { names: codeParamNames, isDestructured } = extractParamNames(rawCode, name);
      const effectiveParamNames =
        params.length > 0
          ? params.map((p) => p.name)
          : codeParamNames.length > 0
            ? codeParamNames
            : [];

      const invokeFn = async () => {
        if (targetFn.length === 0) {
          return await Promise.resolve(targetFn());
        } else if (isDestructured) {
          return await Promise.resolve(targetFn(args));
        } else if (effectiveParamNames.length > 0) {
          const positionalArgs = effectiveParamNames.map((pName) => args[pName]);
          return await Promise.resolve(targetFn(...positionalArgs));
        } else if (targetFn.length === 1 && Object.keys(args).length === 1) {
          const singleVal = Object.values(args)[0];
          try {
            return await Promise.resolve(targetFn(singleVal));
          } catch {
            return await Promise.resolve(targetFn(args));
          }
        } else {
          return await Promise.resolve(targetFn(args));
        }
      };

      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Function execution timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
      });

      try {
        output = await Promise.race([invokeFn(), timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else if (vmContext.__result !== undefined) {
      output = await Promise.resolve(vmContext.__result);
    } else {
      output = undefined;
    }

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      success: true,
      output,
      rawCommand,
      durationMs: Math.max(0.4, durationMs),
      logs: logs.length > 0 ? logs : undefined,
    };
  } catch (runErr) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      success: false,
      error: runErr instanceof Error ? runErr.message : String(runErr),
      rawCommand,
      durationMs,
      logs: logs.length > 0 ? logs : undefined,
    };
  }
}
