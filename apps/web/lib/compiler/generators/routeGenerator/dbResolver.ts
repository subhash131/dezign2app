import { Endpoint, TargetDbOperation, ReusableFunction } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { toFolderName, toTableName, toVarName, toSingular, hasSingularPluralTableCollision } from "../../utils";

function isValidDbOpKind(kind: string): kind is ReusableFunction["kind"] {
  return (
    kind === "custom" ||
    kind === "create" ||
    kind === "update" ||
    kind === "upsert" ||
    kind === "delete" ||
    kind === "findAll" ||
    kind === "findById" ||
    kind === "publish" ||
    kind === "consume"
  );
}

function toOperationKind(kind: ReusableFunction["kind"]): "read" | "create" | "update" | "delete" {
  if (kind === "create" || kind === "upsert") return "create";
  if (kind === "update") return "update";
  if (kind === "delete") return "delete";
  return "read";
}

export interface EndpointWithNodeId extends Endpoint {
  nodeId?: string;
}

/**
 * Resolves all database & cache functions requested for an endpoint based on attached db_ref,
 * redis-cache nodes, canvas edges, and the user's explicit crudOperations selection.
 */
export function pickDbFunctionsForEndpoint(
  ep: EndpointWithNodeId,
  dbFunctions: ReusableFunction[],
  allNodes: BackendNode[],
  path: string,
  allEdges: BackendEdge[] = [],
  redisFunctions: ReusableFunction[] = [],
): TargetDbOperation[] {
  const combinedFunctions = [...dbFunctions, ...redisFunctions];
  if (combinedFunctions.length === 0 && allNodes.length === 0) return [];

  const isIdRoute = path.includes(":id") || path.includes("{id}");

  const isHealth =
    path === "/health" ||
    path === "health" ||
    path.endsWith("/health") ||
    path === "/" ||
    Boolean(ep.summary && ep.summary.toLowerCase().includes("health")) ||
    Boolean(ep.businessLogic && ep.businessLogic.toLowerCase().includes("health"));

  const nodeDbNodeIds =
    ep.databaseNodeIds ||
    (ep.databaseNodeId && ep.databaseNodeId !== "none" ? [ep.databaseNodeId] : []);

  const crudDbNodeIds =
    ep.crudOperations && Object.keys(ep.crudOperations).length > 0
      ? Object.keys(ep.crudOperations)
      : [];

  if (isHealth && crudDbNodeIds.length === 0) {
    return [];
  }

  const edgeDbNodeIds: string[] = [];
  const epNodeId = ep.nodeId;

  if (epNodeId && allEdges.length > 0 && allNodes.length > 0) {
    allEdges.forEach((e) => {
      let candidateId: string | null = null;
      if (
        e.source === epNodeId ||
        e.source === ep.id ||
        (e.sourceHandle && (e.sourceHandle.includes(ep.id) || e.sourceHandle.includes(epNodeId)))
      ) {
        candidateId = e.target;
      } else if (
        e.target === epNodeId ||
        e.target === ep.id ||
        (e.targetHandle && (e.targetHandle.includes(ep.id) || e.targetHandle.includes(epNodeId)))
      ) {
        candidateId = e.source;
      }

      if (candidateId) {
        const candidateNode = allNodes.find((n) => n.id === candidateId);
        if (
          candidateNode &&
          (candidateNode.type === "entity" ||
            candidateNode.type === "db_ref" ||
            candidateNode.type === "redis_schema" ||
            candidateNode.type === "redis-cache")
        ) {
          edgeDbNodeIds.push(candidateId);
        }
      }
    });
  }

  const targetNodeIds = Array.from(
    new Set([...nodeDbNodeIds, ...crudDbNodeIds, ...edgeDbNodeIds]),
  );

  if (targetNodeIds.length === 0) {
    return [];
  }

  const results: TargetDbOperation[] = [];

  for (const tableNodeId of targetNodeIds) {
    const tableNode = allNodes.find((n) => n.id === tableNodeId);
    if (!tableNode) continue;

    let rawTableName =
      tableNode?.data?.label ||
      tableNode?.data?.tableRef ||
      "";

    if (tableNode?.type === "db_ref" && tableNode.data?.tableRef) {
      const refEntity = allNodes.find((n) => n.id === tableNode.data.tableRef);
      if (refEntity) {
        rawTableName = refEntity.data?.label || rawTableName;
      }
    } else if (tableNode?.type === "redis-cache" && tableNode.data?.schemaRef) {
      const refSchema = allNodes.find((n) => n.id === tableNode.data.schemaRef);
      if (refSchema) {
        rawTableName = refSchema.data?.label || rawTableName;
      }
    }

    const cleanTableName = rawTableName.toLowerCase().replace(/[^a-z0-9]/g, "");

    const entityCustomFns: ReusableFunction[] = [];
    const targetEntityNode =
      tableNode?.type === "db_ref" && tableNode.data?.tableRef
        ? allNodes.find((n) => n.id === tableNode.data.tableRef)
        : tableNode?.type === "redis-cache" && tableNode.data?.schemaRef
          ? allNodes.find((n) => n.id === tableNode.data.schemaRef)
          : tableNode;

    const isRedis =
      targetEntityNode?.type === "redis_schema" ||
      targetEntityNode?.type === "redis-cache" ||
      targetEntityNode?.data?.dbType === "redis";

    if (targetEntityNode) {
      const ops = getEntityDbOperations(targetEntityNode, allNodes);
      const sqlTableName = toTableName(rawTableName);
      const hasCollision = hasSingularPluralTableCollision(sqlTableName, allNodes);
      const varName = hasCollision ? toVarName(sqlTableName) : toVarName(toSingular(sqlTableName));
      let importPath = "@workspace/redis";
      if (isRedis) {
        const targetDbId = targetEntityNode?.data?.databaseId;
        const parentInst = allNodes.find(
          (n) => n.id === targetDbId || (n.nodeId && n.nodeId === targetDbId),
        );
        if (parentInst?.data?.label) {
          const folder = toFolderName(parentInst.data.label);
          importPath = `@workspace/${folder}`;
        }
      } else {
        importPath = `@workspace/db/helpers/${varName}`;
      }
      ops.forEach((op) => {
        if (op.enabled !== false) {
          const resolvedKind: ReusableFunction["kind"] = isValidDbOpKind(op.kind)
            ? op.kind
            : "custom";
          entityCustomFns.push({
            name: op.name,
            importPath,
            signature: op.signature || `${op.name}(): void`,
            targetName: rawTableName,
            kind: resolvedKind,
          });
        }
      });
    }

    const tableFns = [
      ...entityCustomFns,
      ...combinedFunctions.filter((f) => {
        const targetClean = (f.targetName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const fnNameClean = f.name.toLowerCase();
        if (cleanTableName && targetClean) {
          return targetClean === cleanTableName;
        }
        return (
          (cleanTableName && fnNameClean.includes(cleanTableName)) ||
          (targetClean && cleanTableName && cleanTableName.includes(targetClean))
        );
      }),
    ];

    const fnsToUse = tableFns;

    const method = (ep.type || "POST").toLowerCase();
    const rawOps = ep.crudOperations?.[tableNodeId];

    // If explicit empty crudOperations are set for this table, user deliberately deselected/deleted ops
    if (Array.isArray(rawOps) && rawOps.length === 0) {
      continue;
    }

    let selectedOps: string[] =
      Array.isArray(rawOps) && rawOps.length > 0
        ? rawOps
        : [];

    // Only default if endpoint has no explicit pipelineSteps and no crudOps map
    if (selectedOps.length === 0 && (!ep.pipelineSteps || ep.pipelineSteps.length === 0)) {
      if (method === "get") {
        selectedOps = ["read"];
      } else if (method === "post") {
        selectedOps = ["create"];
      } else if (method === "put" || method === "patch") {
        selectedOps = ["update"];
      } else if (method === "delete") {
        selectedOps = ["delete"];
      }
    }

    for (const op of selectedOps) {
      let fn: ReusableFunction | undefined = fnsToUse.find(
        (f) => f.name === op || f.name.toLowerCase() === op.toLowerCase(),
      );
      let callExpr = "";

      if (!fn) {
        if (op === "read") {
          if (isIdRoute) {
            fn = fnsToUse.find((f) => f.kind === "findById") || fnsToUse.find((f) => f.kind === "findAll");
          } else {
            fn = fnsToUse.find((f) => f.kind === "findAll") || fnsToUse.find((f) => f.kind === "findById");
          }
        } else if (op === "create") {
          fn = fnsToUse.find((f) => f.kind === "create");
        } else if (op === "update") {
          fn = fnsToUse.find((f) => f.kind === "update");
        } else if (op === "delete") {
          fn = fnsToUse.find((f) => f.kind === "delete");
        }
      }

      if (fn) {
        const opLower = fn.name.toLowerCase();
        if (isRedis) {
          if (opLower.startsWith("get") || fn.kind === "findById") {
            callExpr = isIdRoute ? `await ${fn.name}(req.params.id)` : `await ${fn.name}(req.params.id || "default")`;
          } else if (opLower.startsWith("set") || fn.kind === "create" || fn.kind === "update") {
            callExpr = isIdRoute
              ? `await ${fn.name}(req.params.id, PAYLOAD_VAR)`
              : `await ${fn.name}(PAYLOAD_VAR?.id || "default", PAYLOAD_VAR)`;
          } else if (opLower.startsWith("invalidate") || opLower.startsWith("delete") || fn.kind === "delete") {
            callExpr = isIdRoute ? `await ${fn.name}(req.params.id)` : `await ${fn.name}(PAYLOAD_VAR?.id || "default")`;
          } else {
            callExpr = `await ${fn.name}()`;
          }
        } else {
          if (fn.kind === "findById" || opLower.includes("byid")) {
            callExpr = `await ${fn.name}(req.params.id)`;
          } else if (fn.kind === "create" || fn.kind === "upsert") {
            callExpr = `await ${fn.name}(PAYLOAD_VAR)`;
          } else if (fn.kind === "update") {
            callExpr = `await ${fn.name}(req.params.id, PAYLOAD_VAR)`;
          } else if (fn.kind === "delete") {
            callExpr = `await ${fn.name}(req.params.id)`;
          } else {
            callExpr = `await ${fn.name}()`;
          }
        }

        const targetFnName = fn.name;
        if (!results.some((r) => r.fn.name === targetFnName)) {
          results.push({
            fn,
            callExpr,
            operationKind: toOperationKind(fn.kind),
            tableNodeId,
          });
        }
      }
    }
  }

  return results;
}
