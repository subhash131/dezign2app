// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  compileTransformerHelpers  (thin orchestrator)
// LAYER:   compilers
// PURPOSE: Compiles transformer definitions from all service nodes and
//          standalone transformer canvas nodes.
//
// DELEGATES TO:
//   transformers/typeMapper.ts       — type utilities
//   transformers/schemaReconciler.ts — return-schema merging
//   transformers/transformerEmitter.ts — per-transformer file generation
//
// EMITS:
//   packages/transformers/src/<name>.ts   (global scope helpers)
//   packages/transformers/src/index.ts    (barrel)
//   packages/transformers/package.json
//   packages/transformers/tsconfig.json
//   apps/<service>/src/transformers/<name>.ts  (local scope helpers)
//   apps/<service>/src/transformers/index.ts
// ═══════════════════════════════════════════════════════════════════════════

import { BackendNode, BackendEdge } from "@/types/canvas";
import { TransformerHelperNodeData, CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { toPascalCase, toVarName } from "./utils";
import { SchemaFieldLike, renderFieldType } from "./transformers/typeMapper";
import { reconcileReturnSchema } from "./transformers/schemaReconciler";
import { generateTransformerFile } from "./transformers/transformerEmitter";

export interface CompiledTransformerResult {
  /** Files to write into packages/transformers/ (global) or service src/transformers/ (local) */
  files: CompiledFile[];
  /** ReusableFunction metadata for each compiled helper — used by route generators for imports */
  reusableFunctions: ReusableFunction[];
  /** The global package name if any global helpers were compiled, e.g. "@workspace/transformers" */
  globalPackageName?: string;
}

// Re-export sub-module utilities so existing imports from this file continue to work
export { reconcileReturnSchema } from "./transformers/schemaReconciler";
export { renderFieldType } from "./transformers/typeMapper";
export type { SchemaFieldLike } from "./transformers/typeMapper";

/** Global transformer package name */
const GLOBAL_PKG = "@workspace/transformers";

/**
 * Compiles transformer definitions from all service nodes and transformer canvas nodes.
 *
 * - Global transformers (scope = "global") → packages/transformers/
 * - Local transformers  (scope = "local")  → apps/<service>/src/transformers/
 *
 * Returns:
 *   - files: all compiled TypeScript files
 *   - reusableFunctions: metadata for the route generator to import/use
 *
 * @debugTag compile-transformers
 */
export function compileTransformerHelpers(
  allNodes: BackendNode[],
  allEdges: BackendEdge[] = [],
): CompiledTransformerResult {
  const serviceNodes = allNodes.filter((n) => n.type === "service");

  const allFiles: CompiledFile[] = [];
  const allReusable: ReusableFunction[] = [];

  const globalHelpers: TransformerHelperNodeData[] = [];
  const localHelpersByService = new Map<string, TransformerHelperNodeData[]>();

  // ── Collect helpers from service nodes ───────────────────────────────────
  serviceNodes.forEach((svc) => {
    const helpers = svc.data?.transformerHelpers;
    if (!helpers || helpers.length === 0) return;

    helpers.forEach((h) => {
      if (h.scope === "global") {
        globalHelpers.push(h);
      } else {
        const bucket = localHelpersByService.get(svc.id) ?? [];
        bucket.push(h);
        localHelpersByService.set(svc.id, bucket);
      }
    });
  });

  // ── Collect standalone transformer nodes from the canvas ─────────────────
  const transformerNodes = allNodes.filter((n) => n.type === "transformer");
  transformerNodes.forEach((tNode) => {
    const d = tNode.data;
    const fnName = toVarName(d.functionName || d.label || "transformData");
    const scope = d.scope || "global";

    // Find connected service for local-scope transformers
    let targetServiceId = d.targetServiceId;
    if (!targetServiceId) {
      const edge = allEdges.find((e) => e.source === tNode.id || e.target === tNode.id);
      if (edge) {
        const otherId = edge.source === tNode.id ? edge.target : edge.source;
        const other = allNodes.find((n) => n.id === otherId && n.type === "service");
        if (other) targetServiceId = other.id;
      }
    }

    const returnSchema = reconcileReturnSchema(
      (d.returnSchema || []) as SchemaFieldLike[],
      d.code,
      d.inputSchema,
    );

    const helperData: TransformerHelperNodeData = {
      id: tNode.id,
      name: fnName,
      description: d.description,
      scope: scope === "local" && targetServiceId ? "local" : "global",
      targetServiceId,
      inputSchema: d.inputSchema || [],
      logicMode: d.logicMode || "code",
      prompt: d.prompt,
      code: d.code,
      // Normalize: TransformerHelperNodeData.returnSchema requires type: string (not optional),
      // but SchemaFieldLike.type is optional during inference. Guarantee the field here.
      returnSchema: returnSchema.map((f) => ({
        name: f.name,
        type: f.type ?? "string",
        required: f.required,
        description: f.description,
      })),
      isAsync: d.isAsync,
      importedTransformerIds: d.importedTransformerIds || [],
      packageImports: d.packageImports || [],
      customDependencies: d.customDependencies || [],
    };

    if (helperData.scope === "global") {
      globalHelpers.push(helperData);
    } else if (targetServiceId) {
      const bucket = localHelpersByService.get(targetServiceId) ?? [];
      bucket.push(helperData);
      localHelpersByService.set(targetServiceId, bucket);
    } else {
      globalHelpers.push(helperData);
    }
  });

  // ── Collect transformer action steps from WebPage nodes ─────────────────
  const webPageNodes = allNodes.filter((n) => n.type === "webPage");
  webPageNodes.forEach((wp) => {
    const rawSections = Array.isArray(wp.data?.sections) ? wp.data.sections : [];
    const rawEvents = Array.isArray(wp.data?.events) ? wp.data.events : [];
    const allActions = [
      ...rawSections.flatMap((s: any) => s.actions || []),
      ...rawEvents,
    ];
    allActions.forEach((act: any) => {
      const steps = Array.isArray(act.actionSteps) ? act.actionSteps : [];
      steps.forEach((step: any) => {
        if (step.type !== "transform") return;
        const rawName = step.functionRef?.name || step.transformerName || step.name;
        if (!rawName) return;
        const fnName = toVarName(rawName);

        // Check if already covered by an existing helper
        if (
          globalHelpers.some((h) => h.name === fnName) ||
          Array.from(localHelpersByService.values()).some((list) =>
            list.some((h) => h.name === fnName),
          )
        ) {
          return;
        }

        // Check if there is an existing transformer node with code or schema
        const matchedTrNode = allNodes.find(
          (n) =>
            (n.type === "transformer" || n.type === "transformer_ref") &&
            (n.id === step.transformerNodeId ||
              n.id === step.transformerRefNodeId ||
              n.data?.functionName === rawName ||
              n.data?.label === rawName),
        );
        const resolvedCode =
          step.code ||
          matchedTrNode?.data?.code ||
          `return { id: Math.random().toString(36).substring(2, 9) };`;

        const returnSchema = reconcileReturnSchema(
          (step.functionRef?.returnSchema ||
            matchedTrNode?.data?.returnSchema || [
              { name: "id", type: "string" },
            ]) as SchemaFieldLike[],
          resolvedCode,
          step.functionRef?.inputSchema || matchedTrNode?.data?.inputSchema,
        );

        const helperData: TransformerHelperNodeData = {
          id: step.transformerNodeId || step.id || `trans-${fnName}`,
          name: fnName,
          description: step.description || `Transformer helper for ${fnName}`,
          scope: "global",
          inputSchema: step.functionRef?.inputSchema || matchedTrNode?.data?.inputSchema || [],
          logicMode: "code",
          prompt: step.prompt || matchedTrNode?.data?.prompt,
          code: resolvedCode,
          returnSchema: returnSchema.map((f) => ({
            name: f.name,
            type: f.type ?? "string",
            required: f.required,
            description: f.description,
          })),
          isAsync: Boolean(step.isAsync || matchedTrNode?.data?.isAsync),
          importedTransformerIds: step.importedTransformerIds || matchedTrNode?.data?.importedTransformerIds || [],
          packageImports: step.packageImports || matchedTrNode?.data?.packageImports || [],
          customDependencies: step.customDependencies || matchedTrNode?.data?.customDependencies || [],
        };

        globalHelpers.push(helperData);
      });
    });
  });

  // Map of all helpers by ID and name for cross-transformer dependency resolution
  const allHelpersById = new Map<string, TransformerHelperNodeData>();
  [...globalHelpers, ...Array.from(localHelpersByService.values()).flat()].forEach((h) => {
    allHelpersById.set(h.id, h);
    if (h.name) allHelpersById.set(h.name, h);
  });

  // Cycle detection: checks if candidateId transitively depends on sourceId
  const causesCycle = (sourceId: string, candidateId: string): boolean => {
    if (sourceId === candidateId) return true;
    const visited = new Set<string>();
    const queue = [candidateId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === sourceId) return true;
      if (visited.has(curr)) continue;
      visited.add(curr);

      const currNode = allHelpersById.get(curr);
      if (currNode && currNode.importedTransformerIds) {
        for (const depId of currNode.importedTransformerIds) {
          if (!visited.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }
    return false;
  };

  // ── Compile global helpers → packages/transformers/ ──────────────────────
  if (globalHelpers.length > 0) {
    const globalBarrelExports: string[] = [];

    globalHelpers.forEach((helper) => {
      const cleanName = toVarName(helper.name || "transform");

      // Resolve imported transformer dependencies (warn on cycles, but keep import so recursive logic works)
      const resolvedImports = (helper.importedTransformerIds || [])
        .map((depId) => allHelpersById.get(depId))
        .filter((dep): dep is TransformerHelperNodeData => {
          if (!dep || dep.id === helper.id) return false;
          if (causesCycle(helper.id, dep.id)) {
            console.warn(`[compileTransformerHelpers] Circular dependency detected between ${helper.name} and ${dep.name}. User must ensure base cases exist in logic.`);
          }
          return true;
        })
        .map((dep) => {
          const depName = toVarName(dep.name || "transform");
          // Global helper importing another helper in packages/transformers uses relative "./depName"
          return {
            name: depName,
            importPath: dep.scope === "global" ? `./${depName}` : `./${depName}`,
          };
        });

      const file = generateTransformerFile(helper, GLOBAL_PKG, resolvedImports);

      // ✦ emits: packages/transformers/src/<name>.ts
      allFiles.push({
        filename: `packages/transformers/${file.filename}`,
        language: file.language,
        content: file.content,
      });

      globalBarrelExports.push(`export * from "./${cleanName}";`);

      // Register as reusable function for route generators
      const inputTypeName = `${toPascalCase(cleanName)}Input`;
      const outputTypeName = `${toPascalCase(cleanName)}Output`;
      const inputParamNames = (helper.inputSchema || [])
        .map((f) => f.name?.trim())
        .filter(Boolean);
      const paramSignature =
        inputParamNames.length > 0
          ? `{ ${inputParamNames.join(", ")} }: ${inputTypeName}`
          : "";

      allReusable.push({
        name: cleanName,
        importPath: GLOBAL_PKG,
        signature: `${cleanName}(${paramSignature}): ${outputTypeName}`,
        targetName: cleanName,
        kind: "custom",
      });
    });

    // ✦ emits: packages/transformers/src/index.ts
    allFiles.push({
      filename: "packages/transformers/src/index.ts",
      language: "typescript",
      content: `/**\n * Global Data Transformation Functions\n * Auto-generated — edit transformer definitions to regenerate.\n */\n${globalBarrelExports.join("\n")}\n`,
    });

    // ✦ Collect custom dependencies from all global transformer helpers
    const customDepsRecord: Record<string, string> = {};
    const customDevDepsRecord: Record<string, string> = {
      "@workspace/typescript-config": "workspace:*",
      typescript: "^5.3.3",
    };
    globalHelpers.forEach((h) => {
      (h.customDependencies || []).forEach((dep) => {
        if (!dep.name || dep.name === GLOBAL_PKG || dep.name.startsWith("@workspace/")) return;
        if (dep.isDev) {
          customDevDepsRecord[dep.name] = dep.version || "latest";
        } else {
          customDepsRecord[dep.name] = dep.version || "latest";
        }
      });
      (h.packageImports || []).forEach((imp) => {
        if (
          imp.packageName &&
          imp.packageName !== GLOBAL_PKG &&
          !imp.packageName.startsWith("@workspace/") &&
          !customDepsRecord[imp.packageName]
        ) {
          customDepsRecord[imp.packageName] = "latest";
        }
      });
    });

    // ✦ emits: packages/transformers/package.json
    allFiles.push({
      filename: "packages/transformers/package.json",
      language: "json",
      content: JSON.stringify(
        {
          name: GLOBAL_PKG,
          version: "0.0.0",
          private: true,
          description: "Shared pure data-transformation functions",
          main: "src/index.ts",
          types: "src/index.ts",
          exports: {
            ".": "./src/index.ts",
            "./*": "./src/*.ts",
          },
          scripts: { build: "tsc", "check-types": "tsc --noEmit" },
          ...(Object.keys(customDepsRecord).length > 0
            ? { dependencies: customDepsRecord }
            : {}),
          devDependencies: customDevDepsRecord,
        },
        null,
        2,
      ),
    });

    // ✦ emits: packages/transformers/tsconfig.json
    allFiles.push({
      filename: "packages/transformers/tsconfig.json",
      language: "json",
      content: JSON.stringify(
        {
          extends: "@workspace/typescript-config/base.json",
          compilerOptions: { outDir: "./dist", rootDir: "./src" },
          include: ["src/**/*"],
        },
        null,
        2,
      ),
    });
  }

  // ── Compile local transformers → apps/<service>/src/transformers/ ─────────
  localHelpersByService.forEach((helpers, serviceNodeId) => {
    const svcNode = serviceNodes.find((n) => n.id === serviceNodeId);
    if (!svcNode) return;

    const svcLabel = (svcNode.data?.label || serviceNodeId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    const localBarrelExports: string[] = [];

    helpers.forEach((helper) => {
      const cleanName = toVarName(helper.name || "transform");
      const localImportPath = `./transformers/${cleanName}`;

      // Resolve imported transformer dependencies (warn on cycles, but keep import so recursive logic works)
      const resolvedImports = (helper.importedTransformerIds || [])
        .map((depId) => allHelpersById.get(depId))
        .filter((dep): dep is TransformerHelperNodeData => {
          if (!dep || dep.id === helper.id) return false;
          if (causesCycle(helper.id, dep.id)) {
            console.warn(`[compileTransformerHelpers] Circular dependency detected between ${helper.name} and ${dep.name}. User must ensure base cases exist in logic.`);
          }
          return true;
        })
        .map((dep) => {
          const depName = toVarName(dep.name || "transform");
          // If the dependency is global, import from @workspace/transformers
          // If it is in the same service, import from relative ./depName
          const importPath =
            dep.scope === "global"
              ? GLOBAL_PKG
              : `./${depName}`;
          return {
            name: depName,
            importPath,
          };
        });

      const file = generateTransformerFile(helper, localImportPath, resolvedImports);

      // ✦ emits: apps/<service>/src/transformers/<name>.ts
      allFiles.push({
        filename: `apps/${svcLabel}/src/transformers/${cleanName}.ts`,
        language: file.language,
        content: file.content,
      });

      localBarrelExports.push(`export * from "./${cleanName}";`);

      const inputTypeName = `${toPascalCase(cleanName)}Input`;
      const outputTypeName = `${toPascalCase(cleanName)}Output`;
      const inputParamNames = (helper.inputSchema || [])
        .map((f) => f.name?.trim())
        .filter(Boolean);
      const paramSignature =
        inputParamNames.length > 0
          ? `{ ${inputParamNames.join(", ")} }: ${inputTypeName}`
          : "";

      allReusable.push({
        name: cleanName,
        importPath: localImportPath,
        signature: `${cleanName}(${paramSignature}): ${outputTypeName}`,
        targetName: cleanName,
        kind: "custom",
      });
    });

    // ✦ emits: apps/<service>/src/transformers/index.ts
    allFiles.push({
      filename: `apps/${svcLabel}/src/transformers/index.ts`,
      language: "typescript",
      content: `/**\n * Local Transformation Functions for ${svcLabel}\n */\n${localBarrelExports.join("\n")}\n`,
    });
  });

  return {
    files: allFiles,
    reusableFunctions: allReusable,
    globalPackageName: globalHelpers.length > 0 ? GLOBAL_PKG : undefined,
  };
}
