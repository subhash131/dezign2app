import type { BackendNode } from "@/types/canvas";
import type { PipelineStep, ReusableFunction, DbOperationFunction } from "@workspace/canvas/types";
import {
  toTableName,
  toVarName,
  toSingular,
  toPlural,
  normalizeDbEngine,
  resolveMasterEntityNode,
  hasSingularPluralTableCollision,
} from "./utils";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";

interface CandidateOp {
  id?: string;
  name: string;
  kind?: string;
  importPath?: string;
  signature?: string;
  indexName?: string;
  returnIsArray?: boolean;
}

function inferCrudKindFromStep(step: PipelineStep): string | undefined {
  const opId = (step.operationId || "").toLowerCase();
  const fnName = (step.functionRef?.name || "").toLowerCase();

  if (opId.startsWith("auto-index-") || (fnName.includes("by") && !fnName.endsWith("byid") && !fnName.startsWith("findbyid"))) {
    return "fetchByIndex";
  }
  if (opId.startsWith("auto-find-all-") || opId === "findall" || (fnName.startsWith("findall") && !fnName.includes("by"))) {
    return "findAll";
  }
  if (opId.startsWith("auto-find-by-id-") || opId === "findbyid" || fnName.endsWith("byid")) {
    return "findById";
  }
  if (opId.startsWith("auto-create-") || opId === "create" || fnName.startsWith("create")) {
    return "create";
  }
  if (opId.startsWith("auto-update-") || opId === "update" || fnName.startsWith("update")) {
    return "update";
  }
  if (opId.startsWith("auto-upsert-") || opId === "upsert" || fnName.startsWith("upsert")) {
    return "upsert";
  }
  if (opId.startsWith("auto-delete-") || opId === "delete" || opId === "deletebyid" || fnName.startsWith("delete")) {
    return "delete";
  }
  return undefined;
}

function extractBySuffix(fnName: string): string | undefined {
  const match = fnName.match(/By([A-Z][A-Za-z0-9_]*)$/);
  return match && match[1] ? match[1].toLowerCase() : undefined;
}

function findTargetEntityNode(step: PipelineStep, allNodes: BackendNode[]): BackendNode | undefined {
  const targetId = step.tableNodeId || step.dbRefNodeId;
  if (!targetId) return undefined;

  const byId = allNodes.find(
    (n) => n.id === targetId && (n.type === "entity" || n.type === "db_ref"),
  );
  if (byId) {
    return resolveMasterEntityNode(byId, allNodes);
  }

  const targetLower = targetId.toLowerCase();
  const targetTable = toTableName(targetId);
  const byLabel = allNodes.find(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      ((n.data?.label || "").toLowerCase() === targetLower ||
        toTableName(n.data?.label || n.data?.tableRef || "") === targetTable),
  );
  return byLabel ? resolveMasterEntityNode(byLabel, allNodes) : undefined;
}

function resolveEntityDbEngine(entityNode: BackendNode, allNodes: BackendNode[]): string {
  const dbId = entityNode.data?.databaseId;
  const dbNode = dbId
    ? allNodes.find((n) => n.type === "database" && (n.id === dbId || n.nodeId === dbId))
    : allNodes.find((n) => n.type === "database" && n.data?.dbEngine !== "redis");
  return dbNode ? normalizeDbEngine(dbNode.data?.dbEngine || dbNode.data?.provider || dbNode.data?.dbType) : "sqlite";
}

function rewriteHelperImportPath(
  existingImportPath: string | undefined,
  matchedImportPath: string | undefined,
  varName: string,
  validAliases: Set<string>,
): string {
  if (existingImportPath) {
    const match = existingImportPath.match(/^(.*\/helpers\/)([^/]+)$/);
    if (match && match[1] && match[2]) {
      if (validAliases.has(match[2].toLowerCase())) {
        return existingImportPath;
      }
      return `${match[1]}${varName}`;
    }
  }
  return matchedImportPath || `@workspace/db/helpers/${varName}`;
}

function resolveSingleDbStep(
  step: PipelineStep,
  allNodes: BackendNode[],
  dbFunctions: ReusableFunction[],
): PipelineStep {
  if (step.type !== "db_operation") return step;

  const targetEntity = findTargetEntityNode(step, allNodes);
  if (!targetEntity) return step;

  const rawLabel = targetEntity.data?.label || targetEntity.data?.tableName || targetEntity.data?.tableRef || "table";
  const tableName = toTableName(rawLabel);
  const fullVarName = toVarName(tableName);
  const varName = fullVarName;
  const validAliases = new Set([fullVarName.toLowerCase()]);

  const engine = resolveEntityDbEngine(targetEntity, allNodes);
  const entityOps: DbOperationFunction[] = getEntityDbOperations(targetEntity, allNodes, engine);
  const compiledFns = dbFunctions.filter(
    (f) => toTableName(f.targetName || "") === tableName,
  );

  // Merge candidate operations (preferring compiledFns for signature/importPath when names match)
  const candidates: CandidateOp[] = [];
  for (const op of entityOps) {
    if (op.enabled === false) continue;
    const compiled = compiledFns.find(
      (f) => f.name.toLowerCase() === op.name.toLowerCase(),
    );
    candidates.push({
      id: op.id,
      name: compiled?.name || op.name,
      kind: op.kind,
      importPath: compiled?.importPath,
      signature: compiled?.signature || op.signature,
      indexName: op.indexName,
      returnIsArray:
        compiled?.returnIsArray ??
        (op.kind === "findAll" || (op.returnType || "").includes("[]")),
    });
  }
  for (const fn of compiledFns) {
    if (!candidates.some((c) => c.name.toLowerCase() === fn.name.toLowerCase())) {
      candidates.push({
        name: fn.name,
        kind: fn.kind,
        importPath: fn.importPath,
        signature: fn.signature,
        returnIsArray: fn.returnIsArray ?? fn.kind === "findAll",
      });
    }
  }

  const currentFnName = step.functionRef?.name || "";
  const currentOpId = step.operationId || "";

  let matched = candidates.find(
    (c) =>
      (currentOpId && c.id === currentOpId) ||
      (currentFnName && c.name.toLowerCase() === currentFnName.toLowerCase()),
  );

  if (!matched && candidates.length > 0) {
    const inferredKind = inferCrudKindFromStep(step);
    if (inferredKind === "fetchByIndex") {
      const bySuffix = extractBySuffix(currentFnName);
      const indexOps = candidates.filter((c) => c.kind === "fetchByIndex" || c.kind === "custom");
      if (bySuffix) {
        matched =
          indexOps.find((c) => extractBySuffix(c.name) === bySuffix) ||
          indexOps.find((c) => c.name.toLowerCase().endsWith(`by${bySuffix}`));
      }
      if (!matched && indexOps.length === 1) {
        matched = indexOps[0];
      }
    } else if (inferredKind) {
      matched = candidates.find((c) => c.kind === inferredKind);
    }
  }

  const currentImportPath = step.functionRef?.importPath;
  const nextImportPath = rewriteHelperImportPath(
    currentImportPath,
    matched?.importPath,
    varName,
    validAliases,
  );

  const hasNameMismatch = Boolean(
    matched && currentFnName && matched.name.toLowerCase() !== currentFnName.toLowerCase(),
  );
  const nextFnName = matched ? matched.name : currentFnName;
  const nextSignature = matched?.signature || step.functionRef?.signature;
  const nextOperationId = matched?.id || step.operationId;
  const nextReturnIsArray = matched?.returnIsArray ?? step.functionRef?.returnIsArray;

  if (
    !hasNameMismatch &&
    nextImportPath === currentImportPath &&
    nextSignature === step.functionRef?.signature &&
    nextOperationId === step.operationId
  ) {
    return step;
  }

  return {
    ...step,
    operationId: nextOperationId,
    functionRef: step.functionRef
      ? {
          ...step.functionRef,
          name: nextFnName || step.functionRef.name,
          importPath: nextImportPath,
          signature: nextSignature,
          ...(nextReturnIsArray !== undefined ? { returnIsArray: nextReturnIsArray } : {}),
        }
      : matched
        ? {
            name: matched.name,
            importPath: nextImportPath,
            signature: nextSignature,
            ...(nextReturnIsArray !== undefined ? { returnIsArray: nextReturnIsArray } : {}),
          }
        : undefined,
  };
}

/**
 * Recursively updates `db_operation` pipeline steps (including nested control-flow branches)
 * so stale `functionRef` names, signatures, and helper import paths stay synchronized when
 * an entity table is renamed or its operations are regenerated.
 */
export function resolvePipelineDbSteps(
  steps: PipelineStep[] | undefined,
  allNodes: BackendNode[],
  dbFunctions: ReusableFunction[] = [],
): PipelineStep[] | undefined {
  if (!Array.isArray(steps) || steps.length === 0) return steps;

  return steps.map((step) => {
    let next = resolveSingleDbStep(step, allNodes, dbFunctions);

    if (next.thenSteps) {
      next = { ...next, thenSteps: resolvePipelineDbSteps(next.thenSteps, allNodes, dbFunctions) };
    }
    if (next.elseSteps) {
      next = { ...next, elseSteps: resolvePipelineDbSteps(next.elseSteps, allNodes, dbFunctions) };
    }
    if (next.trySteps) {
      next = { ...next, trySteps: resolvePipelineDbSteps(next.trySteps, allNodes, dbFunctions) };
    }
    if (next.catchSteps) {
      next = { ...next, catchSteps: resolvePipelineDbSteps(next.catchSteps, allNodes, dbFunctions) };
    }
    if (next.cacheMissSteps) {
      next = {
        ...next,
        cacheMissSteps: resolvePipelineDbSteps(next.cacheMissSteps, allNodes, dbFunctions),
      };
    }
    if (next.switchCases) {
      next = {
        ...next,
        switchCases: next.switchCases.map((c) => ({
          ...c,
          steps: resolvePipelineDbSteps(c.steps, allNodes, dbFunctions) || [],
        })),
      };
    }
    if (next.switchDefault) {
      next = {
        ...next,
        switchDefault: resolvePipelineDbSteps(next.switchDefault, allNodes, dbFunctions),
      };
    }
    if (next.parallelBranches) {
      next = {
        ...next,
        parallelBranches: next.parallelBranches.map((br) => ({
          ...br,
          steps: resolvePipelineDbSteps(br.steps, allNodes, dbFunctions) || [],
        })),
      };
    }
    if (next.loopBody) {
      next = {
        ...next,
        loopBody: resolvePipelineDbSteps(next.loopBody, allNodes, dbFunctions),
      };
    }

    return next;
  });
}
