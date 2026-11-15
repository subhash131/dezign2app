import { DbOperationFunction, StepBinding } from "@workspace/canvas/types";
import type { BackendNode } from "@/types/canvas";
import { toVarName } from "@/lib/compiler/utils";
import { extractDbOperationParamsFromSignature } from "./signatureHelper";

/**
 * Derives the expected input arguments for any DB operation function.
 * Accurately handles fetchByIndex (with query/index params like createdBy, limit, offset),
 * CRUD operations, pure findAll (with optional pagination), and custom operations.
 */
export function getDbOperationExpectedArgs(
  op?: DbOperationFunction | null,
  targetNode?: BackendNode | null,
  functionRef?: { name?: string; signature?: string } | null,
): Array<{ name: string; type: string; required?: boolean }> {
  const columns: Array<{ name: string; type: string; isPrimaryKey?: boolean; isNotNull?: boolean }> =
    targetNode?.data?.columns || [];
  const pkCol = columns.find((c) => c.isPrimaryKey) || columns[0];
  const pkName = pkCol?.name || "id";
  const pkType = pkCol?.type || "string";
  const writableCols = columns.filter((c) => !c.isPrimaryKey && c.name && c.name.trim());

  const opKind = op?.kind;
  const opName = (op?.name || functionRef?.name || op?.id || "").toLowerCase();

  // 1. Fetch by index (e.g. findAllConversationsByUser, findByEmail)
  if (
    opKind === "fetchByIndex" ||
    (opName.includes("by") && op?.params && op.params.length > 0)
  ) {
    if (op?.params && op.params.length > 0) {
      return op.params
        .filter((p) => p && p.name && p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          type: p.type || "string",
          required: p.required !== false && p.defaultValue === undefined,
        }));
    }
    const fromSig = extractDbOperationParamsFromSignature(op?.signature || functionRef?.signature);
    if (fromSig.length > 0) return fromSig;
  }

  // 2. Create operations require writable entity columns
  if (
    opKind === "create" ||
    (!opKind && (opName.startsWith("create") || opName.startsWith("insert")))
  ) {
    if (writableCols.length > 0) {
      return writableCols.map((c) => ({
        name: c.name,
        type: c.type || "string",
        required: Boolean(c.isNotNull),
      }));
    }
  }

  // 3. Update operations require primary key + writable columns
  if (opKind === "update" || (!opKind && opName.startsWith("update"))) {
    return [
      { name: toVarName(pkName), type: pkType, required: true },
      ...writableCols.map((c) => ({
        name: c.name,
        type: c.type || "string",
        required: false,
      })),
    ];
  }

  // 4. ById / Delete operations require primary key
  if (
    opKind === "findById" ||
    opKind === "delete" ||
    (!opKind &&
      (opName.includes("byid") ||
        opName.includes("findone") ||
        opName.startsWith("delete")))
  ) {
    if (op?.params && op.params.length > 0) {
      return op.params
        .filter((p) => p && p.name && p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          type: p.type || "string",
          required: true,
        }));
    }
    return [{ name: toVarName(pkName), type: pkType, required: true }];
  }

  // 5. Pure findAll operations (without index/by):
  // If params or signature with parameters (e.g. limit?: number, offset?: number) are present,
  // surface them as optional arguments.
  if (
    opKind === "findAll" ||
    (!opKind && opName.startsWith("findall") && !opName.includes("by"))
  ) {
    if (op?.params && op.params.length > 0) {
      return op.params
        .filter((p) => p && p.name && p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          type: p.type || "string",
          required: Boolean(p.required),
        }));
    }
    const fromSig = extractDbOperationParamsFromSignature(op?.signature || functionRef?.signature);
    if (fromSig.length > 0) return fromSig;
    return [];
  }

  // 6. Custom or relational join operations with params
  if (op?.params && op.params.length > 0) {
    return op.params
      .filter((p) => p && p.name && p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        type: p.type || "string",
        required: p.required !== false && p.defaultValue === undefined,
      }));
  }

  // 7. Signature-derived fallback
  const sig = op?.signature || functionRef?.signature;
  if (sig) {
    const fromSig = extractDbOperationParamsFromSignature(sig);
    if (fromSig.length > 0) return fromSig;
  }

  return [];
}

export type StepBindingLike = StepBinding;

export interface AvailableSourceLike {
  id: string;
  kind: string;
  stepId?: string;
  paths: Array<{ path: string; type?: string }>;
}

function isPathMatchInternal(path: string, argName: string): boolean {
  if (!path || !argName) return false;
  const normArg = argName.trim().toLowerCase();
  const normPath = path.trim().toLowerCase();
  if (normPath === normArg) return true;
  if (normPath.endsWith(`.${normArg}`)) return true;
  const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanArg = normalize(argName);
  const lastSegment = path.split(".").pop() || path;
  const cleanPath = normalize(lastSegment);
  return cleanPath.length > 0 && cleanPath === cleanArg;
}

export function computeDbOpBindings(
  op: DbOperationFunction | undefined,
  targetNode: BackendNode | undefined,
  currentBindings: StepBinding[] = [],
  availableSources: AvailableSourceLike[] = [],
  functionRef?: { name?: string; signature?: string },
): StepBinding[] {
  if (!op && !targetNode) return [];

  const expectedArgs = getDbOperationExpectedArgs(op, targetNode, functionRef);
  if (expectedArgs.length === 0) return [];

  const reqBodySource = availableSources.find(
    (s) => s.kind === "req_body" || s.id === "event_payload",
  );
  const reqParamsSource = availableSources.find((s) => s.kind === "req_params");
  const reqQuerySource = availableSources.find((s) => s.kind === "req_query");
  const authSource = availableSources.find((s) => s.kind === "auth");
  const stepSources = availableSources.filter((s) => s.kind === "step_output");

  const mappedBindings: StepBinding[] = expectedArgs.map((arg) => {
    // 1. Preserve existing configured binding if present
    const existing = currentBindings.find(
      (b) => (b.argName || "").trim().toLowerCase() === arg.name.toLowerCase(),
    );
    if (existing) {
      return existing;
    }

    const normArg = arg.name.toLowerCase();

    // 2. Check path params
    const matchParam = reqParamsSource?.paths.find((p) => isPathMatchInternal(p.path, arg.name));
    if (matchParam) {
      return {
        argName: arg.name,
        source: { kind: "req_params", field: matchParam.path },
      };
    }

    // 3. Check query params
    const matchQuery = reqQuerySource?.paths.find((p) => isPathMatchInternal(p.path, arg.name));
    if (matchQuery) {
      return {
        argName: arg.name,
        source: { kind: "req_query", field: matchQuery.path },
      };
    }

    // 4. Check prior step outputs
    for (const ps of stepSources) {
      const matchStep = ps.paths.find((p) => isPathMatchInternal(p.path, arg.name));
      if (matchStep && ps.stepId) {
        return {
          argName: arg.name,
          source: { kind: "step_output", stepId: ps.stepId, field: matchStep.path },
        };
      }
    }

    // 5. Check request body
    const matchBody = reqBodySource?.paths.find((p) => isPathMatchInternal(p.path, arg.name));
    if (matchBody) {
      return {
        argName: arg.name,
        source: { kind: "req_body", field: matchBody.path },
      };
    }

    // 6. Check auth session
    const matchAuth = authSource?.paths.find((p) => isPathMatchInternal(p.path, arg.name));
    if (matchAuth) {
      return {
        argName: arg.name,
        source: { kind: "auth", field: matchAuth.path },
      };
    }

    // Default if unmapped: query param for limit/offset
    if (normArg === "limit" || normArg === "offset") {
      return {
        argName: arg.name,
        source: { kind: "req_query", field: reqQuerySource ? normArg : "" },
      };
    }

    return {
      argName: arg.name,
      source: { kind: "req_body", field: "" },
    };
  });

  return mappedBindings;
}
