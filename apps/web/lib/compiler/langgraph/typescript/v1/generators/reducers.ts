import type { CompiledFile } from "@workspace/canvas/types";
import type { CompileContext } from "../types";
import { toCamelCase, getChannelReducerName } from "../utils";

function normalizeReducerCode(
  code: string,
  prevType: string,
  updateType: string,
  typeName?: string,
): string {
  let fn = code.trim();

  // Strip leading block comments
  fn = fn.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "");
  // Strip leading line comments
  fn = fn.replace(/^\s*\/\/[^\n]*\n\s*/, "");
  // Strip trailing semicolons
  fn = fn.replace(/;+\s*$/, "");
  // Strip variable declaration if user typed "const foo = ..." or "export const foo = ..."
  fn = fn.replace(/^\s*(?:export\s+)?(?:const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*/, "");

  // Match arrow function: (prev, next) => ...
  const arrowRegex = /^\s*\(\s*([a-zA-Z0-9_$]+)(?:\s*:[^,)]+)?\s*,\s*([a-zA-Z0-9_$]+)(?:\s*:[^)]+)?\s*\)\s*=>/;
  if (arrowRegex.test(fn)) {
    fn = fn.replace(
      arrowRegex,
      `($1: ${prevType}, $2: ${updateType}): ${prevType} =>`,
    );
  } else {
    // Match function declaration/expression: function(prev, next) or function foo(prev, next)
    const funcRegex = /^\s*function(?:\s+[a-zA-Z0-9_$]+)?\s*\(\s*([a-zA-Z0-9_$]+)(?:\s*:[^,)]+)?\s*,\s*([a-zA-Z0-9_$]+)(?:\s*:[^)]+)?\s*\)/;
    if (funcRegex.test(fn)) {
      fn = fn.replace(
        funcRegex,
        `function ($1: ${prevType}, $2: ${updateType}): ${prevType}`,
      );
    }
  }

  // Type-safe guards for action checking without any/as
  fn = fn.replace(
    /const\s+action\s*=\s*next\?\.action;/g,
    `const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;`,
  );

  // Type-safe guard for separator without any/as
  fn = fn.replace(
    /next\?\.separator\s*!==\s*undefined\s*\?\s*String\(next\.separator\)\s*:\s*""/g,
    `typeof next === "object" && next !== null && "separator" in next && next.separator !== undefined ? String(next.separator) : ""`,
  );

  // Type-safe guard for amount without any/as
  fn = fn.replace(
    /\(Number\(next\?\.amount\)\s*\|\|\s*1\)/g,
    `(typeof next === "object" && next !== null && "amount" in next ? Number(next.amount) || 1 : 1)`,
  );

  // Type-safe guard for next?.value
  fn = fn.replace(
    /next\?\.value\s*!==\s*undefined\s*\?\s*next\.value/g,
    `typeof next === "object" && next !== null && "value" in next && next.value !== undefined ? next.value`,
  );

  if (prevType === "BaseMessage[]") {
    // Ensure incoming messages extraction from action envelope never falls back to the action container object
    fn = fn.replace(
      /const\s+incoming\s*=\s*typeof\s+next\s*===[^;]+;/g,
      `const incoming = typeof next === "object" && next !== null && "action" in next ? (next.value !== undefined ? next.value : []) : (typeof next === "object" && next !== null && "value" in next && next.value !== undefined ? next.value : next);`,
    );
  }

  // Destructuring rawPayload replaced with strongly-typed payload
  if (typeName) {
    fn = fn.replace(
      /const\s+payload\s*=\s*typeof\s+next\s*===/g,
      `const payload: Partial<${typeName}> = typeof next ===`,
    );
    fn = fn.replace(
      /const\s+rawPayload\s*=[\s\S]*?const\s*\{\s*action:\s*_action\s*,\s*\.\.\.payload\s*\}\s*=\s*rawPayload;/g,
      `const payload: Partial<${typeName}> = typeof next === "object" && next !== null && "value" in next && typeof next.value === "object" && next.value !== null ? next.value : (typeof next === "object" && next !== null ? next : {});`,
    );
    fn = fn.replace(
      /const\s+initial\s*=\s*\{/g,
      `const initial: ${typeName} = {`,
    );
    fn = fn.replace(
      /const\s+current\s*=\s*\(prev/g,
      `const current: ${typeName} = (prev`,
    );
  }

  return fn;
}

/**
 * Builds dedicated reducer files for state variables in src/reducers/<reducer>.ts
 */
export function buildReducerFiles(ctx: CompileContext): CompiledFile[] {
  const files: CompiledFile[] = [];
  const exportNames: string[] = [];

  const codeUsesActionUpdates = (code?: string): boolean => {
    if (!code) return false;
    return (
      code.includes(".action") ||
      code.includes('"action"') ||
      code.includes("'action'") ||
      code.includes(".amount") ||
      code.includes('"amount"') ||
      code.includes("'amount'") ||
      code.includes(".separator") ||
      code.includes('"separator"') ||
      code.includes("'separator'")
    );
  };

  for (const ch of ctx.input.stateChannels) {
    const reducerName = getChannelReducerName(ch.key);
    exportNames.push(reducerName);

    const customTypeMatch: string | undefined =
      (typeof ch.customTypeName === "string" ? ch.customTypeName : undefined) ||
      (typeof ch.customTypeSchema?.name === "string" ? ch.customTypeSchema.name : undefined) ||
      (ch.customTypeId && ctx.input.nodes
        ? (ctx.input.nodes.find((n) => n.id === ch.customTypeId)?.data as { name?: string } | undefined)?.name
        : undefined);
    const isCustomType = Boolean(customTypeMatch);

    let content = "";

    // 1. Messages channel
    if (ch.key === "messages" || ch.type === "messages" || ch.reducer === "add_messages") {
      if (ch.reducer === "custom" && ch.customReducerCode) {
        const updateType = codeUsesActionUpdates(ch.customReducerCode)
          ? "MessagesChannelUpdate"
          : "BaseMessage[] | BaseMessage";
        const customFn = normalizeReducerCode(
          ch.customReducerCode,
          "BaseMessage[]",
          updateType,
        );
        const stateImport =
          updateType === "MessagesChannelUpdate"
            ? `import type { MessagesChannelUpdate } from "../state";\n`
            : "";
        content = `import type { BaseMessage } from "@langchain/core/messages";
${stateImport}
/**
 * Reducer for "${ch.key}" messages channel
 */
export const ${reducerName} = ${customFn};
`;
      } else {
        content = `import { addMessages } from "@langchain/langgraph";

/**
 * Reducer for "${ch.key}" messages channel: LangGraph native append, ID deduplication & Overwrite support
 */
export const ${reducerName} = addMessages;
`;
      }
    } else if (ch.reducer === "custom" || ch.customReducerCode) {
      // 2. Custom reducer code
      let prevType = "string";
      let updateType = "string";

      if (isCustomType && customTypeMatch) {
        prevType = customTypeMatch;
        updateType = `${customTypeMatch}Update`;
      } else if (ch.type === "string") {
        prevType = "string";
        updateType = codeUsesActionUpdates(ch.customReducerCode)
          ? "StringChannelUpdate"
          : "string";
      } else if (ch.type === "number") {
        prevType = "number";
        updateType = codeUsesActionUpdates(ch.customReducerCode)
          ? "NumberChannelUpdate"
          : "number";
      } else if (ch.type === "boolean") {
        prevType = "boolean";
        updateType = codeUsesActionUpdates(ch.customReducerCode)
          ? "BooleanChannelUpdate"
          : "boolean";
      } else if (ch.type === "array") {
        prevType = "string[]";
        updateType = "string[]";
      } else if (ch.type === "object" || ch.type === "json") {
        prevType = "Record<string, string>";
        updateType = "Record<string, string>";
      }

      const customFn = normalizeReducerCode(
        ch.customReducerCode || `(prev, next) => next`,
        prevType,
        updateType,
        customTypeMatch,
      );

      const imports: string[] = [];
      if (updateType.endsWith("ChannelUpdate")) {
        imports.push(`import type { ${updateType} } from "../state";`);
      }
      if (isCustomType && customTypeMatch) {
        imports.push(`import type { ${customTypeMatch}, ${updateType} } from "../state";`);
      }
      if (customFn.includes("BaseMessage")) {
        imports.push(`import type { BaseMessage } from "@langchain/core/messages";`);
      }

      content = `${imports.length > 0 ? imports.join("\n") + "\n\n" : ""}/**
 * Reducer for "${ch.key}" state variable
 */
export const ${reducerName} = ${customFn};
`;
    } else if (isCustomType && customTypeMatch) {
      // 3. Custom type schema reducer
      const updateType = `${customTypeMatch}Update`;
      content = `import type { ${customTypeMatch}, ${updateType} } from "../state";

/**
 * Reducer for "${ch.key}" state variable (${customTypeMatch})
 */
export function ${reducerName}(
  prev: ${customTypeMatch},
  next: ${updateType},
): ${customTypeMatch} {
  const initial = { ...prev };
  if (typeof next === "object" && next !== null) {
    const payload = "value" in next && typeof next.value === "object" && next.value !== null ? next.value : next;
    return { ...initial, ...payload };
  }
  return initial;
}
`;
    } else if (ch.type === "string") {
      // 4. String channel
      if (ch.reducer === "append") {
        content = `/**
 * Reducer for "${ch.key}" state variable (appends incoming string)
 */
export function ${reducerName}(prev: string = "", next: string): string {
  return (prev || "") + (next || "");
}
`;
      } else {
        content = `/**
 * Reducer for "${ch.key}" state variable
 */
export function ${reducerName}(_prev: string = "", next: string): string {
  return next;
}
`;
      }
    } else if (ch.type === "number") {
      // 5. Number channel
      if (ch.reducer === "append") {
        content = `/**
 * Reducer for "${ch.key}" state variable (sums numbers)
 */
export function ${reducerName}(prev: number = 0, next: number): number {
  return (prev || 0) + (next || 0);
}
`;
      } else {
        content = `/**
 * Reducer for "${ch.key}" state variable
 */
export function ${reducerName}(_prev: number = 0, next: number): number {
  return next;
}
`;
      }
    } else if (ch.type === "boolean") {
      // 6. Boolean channel
      content = `/**
 * Reducer for "${ch.key}" state variable
 */
export function ${reducerName}(_prev: boolean = false, next: boolean): boolean {
  return next;
}
`;
    } else if (ch.type === "array") {
      // 7. Array channel
      if (ch.reducer === "concat_array" || ch.reducer === "append") {
        content = `/**
 * Reducer for "${ch.key}" state variable (concatenates arrays)
 */
export function ${reducerName}(prev: string[] = [], next: string[]): string[] {
  const current = Array.isArray(prev) ? prev : [];
  return current.concat(Array.isArray(next) ? next : (next != null ? [next] : []));
}
`;
      } else {
        content = `/**
 * Reducer for "${ch.key}" state variable
 */
export function ${reducerName}(_prev: string[] = [], next: string[]): string[] {
  return next;
}
`;
      }
    } else if (ch.type === "object" || ch.type === "json") {
      // 8. Object channel
      if (ch.reducer === "merge_object") {
        content = `/**
 * Reducer for "${ch.key}" state variable (shallow merge)
 */
export function ${reducerName}(
  prev: Record<string, string> = {},
  next: Record<string, string>,
): Record<string, string> {
  return { ...(prev || {}), ...(next || {}) };
}
`;
      } else {
        content = `/**
 * Reducer for "${ch.key}" state variable
 */
export function ${reducerName}(
  _prev: Record<string, string> = {},
  next: Record<string, string>,
): Record<string, string> {
  return next;
}
`;
      }
    } else {
      content = `/**
 * Reducer for "${ch.key}" state variable
 */
export function ${reducerName}<T>(_prev: T, next: T): T {
  return next;
}
`;
    }

    files.push({
      filename: `src/reducers/${reducerName}.ts`,
      language: "typescript",
      content,
    });
  }

  // Generate index.ts in src/reducers/
  if (exportNames.length > 0) {
    const uniqueExports = Array.from(new Set(exportNames));
    const indexContent = uniqueExports
      .map((name) => `export * from "./${name}";`)
      .join("\n") + "\n";
    files.push({
      filename: "src/reducers/index.ts",
      language: "typescript",
      content: indexContent,
    });
  }

  return files;
}
