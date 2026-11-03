import {
  BackendNode,
  Endpoint,
  EntityColumn,
  KafkaTopic,
  StepBinding,
} from "@/types/canvas";
import { PipelineStepDraft } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/types";
import { toVarName } from "@/lib/compiler/utils";
import { BindingCheckItem } from "@/types/canvas";

/**
 * Validates if an argument binding has a properly configured, non-empty source.
 */
export function isBindingSourceConfigured(
  binding: BindingCheckItem | StepBinding | undefined,
): boolean {
  if (!binding || !binding.source || !binding.source.kind) return false;
  const source = binding.source;
  const isWholeObjectArg =
    !binding.argName ||
    binding.argName.toLowerCase() === "payload" ||
    binding.argName.toLowerCase() === "data" ||
    binding.argName.toLowerCase() === "body" ||
    binding.argName.toLowerCase() === "_spread";

  if (source.kind === "inline") {
    if ("value" in source) {
      if (source.value === undefined || source.value === null) return false;
      if (typeof source.value === "string" && source.value.trim().length === 0) return false;
      return true;
    }
    return false;
  }

  if (source.kind === "step_output") {
    if ("stepId" in source) {
      if (!source.stepId?.trim()) return false;
      if (isWholeObjectArg) return true;
      return Boolean(source.field !== undefined && String(source.field).trim().length > 0);
    }
    return false;
  }

  if (source.kind === "req_body" || source.kind === "auth") {
    // If binding whole object arg (e.g. payload, body, data, auth, user), field can be empty. Otherwise field must be specified.
    if (isWholeObjectArg) return true;
    return Boolean(source.field !== undefined && String(source.field).trim().length > 0);
  }

  if ("field" in source) {
    return Boolean(source.field !== undefined && String(source.field).trim().length > 0);
  }

  return false;
}

/**
 * Recursively collects all nested steps within control flow blocks.
 */
export function collectNestedSteps(step: PipelineStepDraft): PipelineStepDraft[] {
  const nested: PipelineStepDraft[] = [];

  if (step.thenSteps) {
    for (const s of step.thenSteps) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }
  if (step.elseSteps) {
    for (const s of step.elseSteps) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }
  if (step.trySteps) {
    for (const s of step.trySteps) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }
  if (step.catchSteps) {
    for (const s of step.catchSteps) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }
  if (step.switchCases) {
    for (const c of step.switchCases) {
      if (c.steps) {
        for (const s of c.steps) {
          nested.push(s, ...collectNestedSteps(s));
        }
      }
    }
  }
  if (step.switchDefault) {
    for (const s of step.switchDefault) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }
  if (step.parallelBranches) {
    for (const b of step.parallelBranches) {
      if (b.steps) {
        for (const s of b.steps) {
          nested.push(s, ...collectNestedSteps(s));
        }
      }
    }
  }
  if (step.loopBody) {
    for (const s of step.loopBody) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }
  if (step.cacheMissSteps) {
    for (const s of step.cacheMissSteps) {
      nested.push(s, ...collectNestedSteps(s));
    }
  }

  return nested;
}

/**
 * Flattens all pipeline steps recursively including control flow branches.
 */
export function flattenAllPipelineSteps(steps: PipelineStepDraft[]): PipelineStepDraft[] {
  const result: PipelineStepDraft[] = [];
  for (const step of steps) {
    result.push(step, ...collectNestedSteps(step));
  }
  return result;
}

// ─── Step-Specific Input Validators ──────────────────────────────────────────

function isTransformerStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  if (!step.functionRef?.name && !step.transformerNodeId) return true;

  // Resolve input schema from graph nodes (live canvas truth) or fallback to step
  const tNode = allNodes.find(
    (n) =>
      (n.type === "transformer" || n.type === "transformer_ref") &&
      (n.id === step.transformerNodeId ||
        n.id === step.functionRef?.name ||
        n.data?.functionName === step.functionRef?.name ||
        n.data?.label === step.functionRef?.name ||
        (step.functionRef?.name && (
          toVarName(n.data?.functionName || "") === toVarName(step.functionRef.name) ||
          toVarName(n.data?.label || "") === toVarName(step.functionRef.name)
        ))),
  );

  let inputSchema:
    | Array<{ name: string; type?: string; required?: boolean }>
    | undefined = tNode?.data?.inputSchema;
  if (tNode?.type === "transformer_ref" && tNode.data?.transformerRef) {
    const master = allNodes.find(
      (m) =>
        m.type === "transformer" &&
        (m.id === tNode.data?.transformerRef ||
          m.data?.functionName === tNode.data?.transformerRef ||
          m.data?.label === tNode.data?.transformerRef ||
          (tNode.data?.transformerRef && (
            toVarName(m.data?.functionName || "") === toVarName(tNode.data.transformerRef) ||
            toVarName(m.data?.label || "") === toVarName(tNode.data.transformerRef)
          ))),
    );
    if (master) {
      inputSchema = master.data?.inputSchema;
    }
  }

  // Fallback to step.functionRef if node was not found
  if (inputSchema === undefined) {
    inputSchema = step.functionRef?.inputSchema;
  }

  // If input schema has fields
  if (Array.isArray(inputSchema) && inputSchema.length > 0) {
    const validSchemaFields = inputSchema.filter(
      (f) => Boolean(f && f.name && f.name.trim().length > 0),
    );
    const requiredFields = validSchemaFields.filter(
      (f) => f.required !== false,
    );
    const fieldsToCheck =
      requiredFields.length > 0 ? requiredFields : validSchemaFields;

    if (fieldsToCheck.length > 0) {
      if (bindings.length === 0) return true;

      for (const field of fieldsToCheck) {
        const binding = bindings.find(
          (b) =>
            (b.argName || "").trim().toLowerCase() ===
            field.name.trim().toLowerCase(),
        );
        if (!binding || !isBindingSourceConfigured(binding)) {
          return true;
        }
      }
    }
    return false;
  }

  // If input schema is not configured or empty: zero inputs required func()
  return false;
}

function isDbOperationStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  const tableId = step.tableNodeId || step.databaseId;
  if (!tableId) return true;

  let tableNode = allNodes.find(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      (n.id === tableId || n.data?.tableRef === tableId),
  );
  if (tableNode?.type === "db_ref" && tableNode.data?.tableRef) {
    const master = allNodes.find((n) => n.id === tableNode!.data!.tableRef);
    if (master) tableNode = master;
  }

  const columns: EntityColumn[] = tableNode?.data?.columns || [];
  const pkCol = columns.find((c) => c.isPrimaryKey) || columns[0];
  const op = (step.operationId || step.functionRef?.name || "").toLowerCase();
  if (!op) return true;

  // 1. Pure findAll operations (without index/by) have no required input arguments
  if (op.includes("findall") && !op.includes("by")) {
    return false;
  }

  // Any non-optional binding that is present must be properly configured (non-empty source/field)
  if (
    bindings.some((b) => {
      const isOptionalPagination =
        b.argName?.toLowerCase() === "limit" || b.argName?.toLowerCase() === "offset";
      if (isOptionalPagination) return false;
      return !isBindingSourceConfigured(b);
    })
  ) {
    return true;
  }

  // 2. create / insert: requires not-null columns (or writable cols if none)
  if (op.includes("create") || op.includes("insert")) {
    const requiredCols = columns.filter(
      (c) => c.isNotNull && !c.isPrimaryKey && Boolean(c.name && c.name.trim()),
    );
    if (requiredCols.length > 0) {
      for (const col of requiredCols) {
        const binding = bindings.find(
          (b) =>
            (b.argName || "").trim().toLowerCase() ===
              col.name.trim().toLowerCase() ||
            (b.argName || "").trim().toLowerCase() ===
              toVarName(col.name).toLowerCase(),
        );
        if (!binding || !isBindingSourceConfigured(binding)) {
          return true;
        }
      }
      return false;
    }
    const writableCols = columns.filter((c) => !c.isPrimaryKey && Boolean(c.name && c.name.trim()));
    if (writableCols.length > 0 && bindings.length === 0) {
      return true;
    }
    return false;
  }

  // 3. update: requires primary key
  if (op.includes("update")) {
    const pkName = pkCol?.name || "id";
    const pkBinding = bindings.find(
      (b) =>
        (b.argName || "").trim().toLowerCase() ===
          pkName.trim().toLowerCase() ||
        (b.argName || "").trim().toLowerCase() ===
          toVarName(pkName).toLowerCase() ||
        (b.argName || "").trim().toLowerCase() === "id",
    );
    if (!pkBinding || !isBindingSourceConfigured(pkBinding)) {
      return true;
    }
    return false;
  }

  // 4. byid / findone / delete: requires primary key
  if (
    op.includes("byid") ||
    op.includes("findone") ||
    op.includes("delete")
  ) {
    const pkName = pkCol?.name || "id";
    const pkBinding = bindings.find(
      (b) =>
        (b.argName || "").trim().toLowerCase() ===
          pkName.trim().toLowerCase() ||
        (b.argName || "").trim().toLowerCase() ===
          toVarName(pkName).toLowerCase() ||
        (b.argName || "").trim().toLowerCase() === "id",
    );
    if (!pkBinding || !isBindingSourceConfigured(pkBinding)) {
      return true;
    }
    return false;
  }

  // 5. Check if tableNode has custom dbOperations with parameter definitions
  const customOps: any[] = tableNode?.data?.dbOperations || [];
  const matchedOp = customOps.find(
    (o) =>
      o.id === step.operationId ||
      o.name?.toLowerCase() === op ||
      (step.functionRef?.name && o.name === step.functionRef.name),
  );
  if (matchedOp) {
    if (matchedOp.kind === "findAll") return false;
    const requiredParams = (matchedOp.params || []).filter(
      (p: any) => p && p.name && p.required !== false,
    );
    if (requiredParams.length > 0) {
      for (const p of requiredParams) {
        const binding = bindings.find(
          (b) => (b.argName || "").trim().toLowerCase() === p.name.trim().toLowerCase(),
        );
        if (!binding || !isBindingSourceConfigured(binding)) {
          return true;
        }
      }
      return false;
    }
    if ((matchedOp.params || []).length === 0 && bindings.length === 0) {
      return false;
    }
  }

  return false;
}

function isRedisOperationStepUnconfigured(
  step: PipelineStepDraft,
  bindings: StepBinding[],
): boolean {
  const fn = (step.functionRef?.name || step.operationId || "").toLowerCase();
  if (!fn) return true;

  if (bindings.some((b) => !isBindingSourceConfigured(b))) {
    return true;
  }

  let requiredArgNames: string[] = ["key"];
  if (
    fn.includes("ping") ||
    fn.includes("dbsize") ||
    fn.includes("flushdb") ||
    fn.includes("time") ||
    fn.includes("info")
  ) {
    requiredArgNames = [];
  } else if (fn.includes("setex")) {
    requiredArgNames = ["key", "seconds", "value"];
  } else if (fn.includes("hset")) {
    requiredArgNames = ["key", "field", "value"];
  } else if (fn.includes("hget") || fn.includes("hdel")) {
    requiredArgNames = ["key", "field"];
  } else if (
    fn.includes("set") ||
    fn.includes("lpush") ||
    fn.includes("rpush")
  ) {
    requiredArgNames = ["key", "value"];
  } else if (fn.includes("publish")) {
    requiredArgNames = ["channel", "message"];
  } else if (fn.includes("xadd")) {
    requiredArgNames = ["stream", "fields"];
  } else if (fn.includes("expire")) {
    requiredArgNames = ["key", "seconds"];
  }

  for (const argName of requiredArgNames) {
    const binding = bindings.find(
      (b) => (b.argName || "").trim().toLowerCase() === argName.toLowerCase(),
    );
    if (!binding || !isBindingSourceConfigured(binding)) {
      return true;
    }
  }

  // Validate cache miss fallback DB bindings if enabled
  if (step.cacheMiss?.enabled && step.cacheMiss.action === "fallback_db") {
    const dbBindings = step.cacheMiss.inputBindings || [];
    if (dbBindings.length === 0) return true;
    if (dbBindings.some((b) => !isBindingSourceConfigured(b))) return true;
  }

  return false;
}

function isKafkaPublishStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  const fnName = step.functionRef?.name || step.operationId || "";
  if (!fnName && !step.brokerNodeId && !step.messagingResourceId) return true;

  const isGeneric =
    fnName === "publishKafkaEvent" || (!fnName && !step.messagingResourceId);

  const brokerNodes = allNodes.filter(
    (n) =>
      n.type === "kafka" ||
      n.type === "eventstream" ||
      (n.type === "queue" &&
        n.data?.implementation?.toLowerCase() === "kafka"),
  );

  let targetTopic: KafkaTopic | undefined;
  for (const b of brokerNodes) {
    const topics: KafkaTopic[] = b.data?.topics || [];
    const match = topics.find(
      (t) =>
        t.id === step.messagingResourceId ||
        t.name === step.messagingResourceId ||
        t.id === step.operationId ||
        t.name === step.operationId ||
        (fnName &&
          (fnName.toLowerCase().includes(t.name?.toLowerCase()) ||
            fnName.toLowerCase() === `publish${t.name?.toLowerCase()}`)),
    );
    if (match) {
      targetTopic = match;
      break;
    }
  }

  const payloadSchema = targetTopic?.payloadSchema;
  if (
    payloadSchema &&
    Array.isArray(payloadSchema.fields) &&
    payloadSchema.fields.length > 0
  ) {
    const requiredFields = payloadSchema.fields.filter(
      (f) => f.required !== false && Boolean(f.name && f.name.trim()),
    );
    const fieldsToCheck =
      requiredFields.length > 0 ? requiredFields : payloadSchema.fields;

    for (const field of fieldsToCheck) {
      if (!field.name) continue;
      const binding = bindings.find(
        (b) =>
          (b.argName || "").trim().toLowerCase() ===
          field.name.trim().toLowerCase(),
      );
      if (!binding || !isBindingSourceConfigured(binding)) {
        return true;
      }
    }
    return false;
  }

  if (isGeneric) {
    const topicBinding = bindings.find(
      (b) => (b.argName || "").trim().toLowerCase() === "topic",
    );
    const payloadBinding = bindings.find(
      (b) =>
        (b.argName || "").trim().toLowerCase() === "payload" ||
        (b.argName || "").trim().toLowerCase() === "message",
    );
    if (!topicBinding || !isBindingSourceConfigured(topicBinding)) return true;
    if (!payloadBinding || !isBindingSourceConfigured(payloadBinding))
      return true;
    return false;
  }

  const payloadBinding = bindings.find(
    (b) =>
      (b.argName || "").trim().toLowerCase() === "payload" ||
      (b.argName || "").trim().toLowerCase() === "message" ||
      bindings.length > 0,
  );
  if (!payloadBinding || !isBindingSourceConfigured(payloadBinding)) {
    return true;
  }
  return false;
}

function isServiceCallStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  const targetNodeId = step.externalNodeId || step.databaseId;
  if (!targetNodeId) return true;
  const targetService = allNodes.find((n) => n.id === targetNodeId);
  if (!targetService) return true;

  const targetEpId =
    step.externalEndpointId || step.tableNodeId || step.operationId;
  const targetEndpoints: Endpoint[] = targetService.data?.endpoints || [];
  const targetEp = targetEndpoints.find(
    (ep) => ep.id === targetEpId || ep.name === targetEpId,
  );

  if (targetEp?.pathParams && targetEp.pathParams.length > 0) {
    for (const param of targetEp.pathParams) {
      if (!param.name?.trim()) continue;
      const binding = bindings.find(
        (b) =>
          (b.argName || "").trim().toLowerCase() ===
          param.name.trim().toLowerCase(),
      );
      if (!binding || !isBindingSourceConfigured(binding)) {
        return true;
      }
    }
  }
  return false;
}

function isExternalCallStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  const targetNodeId = step.externalNodeId || step.databaseId;
  if (!targetNodeId) return true;
  const targetNode = allNodes.find((n) => n.id === targetNodeId);
  if (!targetNode?.data?.baseUrl?.trim()) {
    return true;
  }

  const targetEpId =
    step.externalEndpointId || step.tableNodeId || step.operationId;
  const targetEndpoints: Endpoint[] = targetNode.data?.endpoints || [];
  const targetEp = targetEndpoints.find(
    (ep) => ep.id === targetEpId || ep.name === targetEpId,
  );

  if (targetEp?.pathParams && targetEp.pathParams.length > 0) {
    for (const param of targetEp.pathParams) {
      if (!param.name?.trim()) continue;
      const binding = bindings.find(
        (b) =>
          (b.argName || "").trim().toLowerCase() ===
          param.name.trim().toLowerCase(),
      );
      if (!binding || !isBindingSourceConfigured(binding)) {
        return true;
      }
    }
  }
  return false;
}

function isLangGraphStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
): boolean {
  if (!step.langGraphTargetNodeId) return true;
  const targetNode = allNodes.find(
    (n) => n.id === step.langGraphTargetNodeId,
  );
  if (!targetNode) return true;

  // History mode only requires target LangGraph node and a threadId source
  if (step.langGraphAction === "history") {
    return !step.langGraphThreadIdSource?.trim();
  }

  const inputBindings = step.inputBindings || [];
  const stateMapping = step.langGraphStateMapping || {};

  // If any input bindings are present, ensure only non-empty named bindings are checked
  if (inputBindings.some((b) => b.argName?.trim() && !isBindingSourceConfigured(b))) {
    return true;
  }

  // Check if messages channel is mapped via dedicated langGraphMessagesConfig or stateMapping/inputBindings
  const hasMessagesConfigured = Boolean(
    (step.langGraphMessagesConfig?.mode === "bulk"
      ? step.langGraphMessagesConfig.bulkMessagesSource?.trim()
      : step.langGraphMessagesConfig?.userMessageSource?.trim()) ||
    (stateMapping["messages"] !== undefined && stateMapping["messages"] !== "") ||
    (stateMapping["message"] !== undefined && stateMapping["message"] !== "") ||
    inputBindings.some(
      (b) =>
        (b.argName === "messages" || b.argName === "message") &&
        isBindingSourceConfigured(b),
    ),
  );

  const isChannelMapped = (req: { key?: string; stateChannelKey?: string }) => {
    const key = req.key || "";
    const stateKey = req.stateChannelKey;
    const lowerKey = key.toLowerCase();

    // Check if this channel represents conversation messages (either by key or via stateChannelKey alias)
    const isMessagesChannel =
      lowerKey === "messages" ||
      lowerKey === "message" ||
      (stateKey !== undefined &&
        stateKey
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .includes("messages"));

    if (isMessagesChannel && hasMessagesConfigured) {
      return true;
    }

    const keysToCheck = [key];
    if (stateKey) {
      for (const sk of stateKey.split(",")) {
        const trimmed = sk.trim();
        if (trimmed && !keysToCheck.includes(trimmed)) {
          keysToCheck.push(trimmed);
        }
      }
    }

    return keysToCheck.some((k) => {
      const hasInMapping =
        k in stateMapping &&
        stateMapping[k] !== undefined &&
        stateMapping[k] !== "";
      const hasInBindings = inputBindings.some(
        (b) => b.argName === k && isBindingSourceConfigured(b),
      );
      return hasInMapping || hasInBindings;
    });
  };

  // Check required input channels declared by the target agent
  const inputChannels = targetNode.data?.inputChannels;
  if (Array.isArray(inputChannels) && inputChannels.length > 0) {
    const requiredChannels = inputChannels.filter(
      (c: { required?: boolean; key?: string }) => c.required && c.key,
    );
    for (const req of requiredChannels) {
      // thread_id / threadId is configurable.thread_id (checkpointer config), not a state channel —
      // it is validated separately via langGraphThreadIdSource, so skip it here.
      if (req.key === "thread_id" || req.key === "threadId") continue;
      if (!isChannelMapped(req)) {
        return true;
      }
    }
  }

  return false;
}

function isPushToClientStepUnconfigured(
  step: PipelineStepDraft,
  bindings: StepBinding[],
): boolean {
  if (!step.clientDeliveryTargetPageId && !step.clientDeliveryPageRefNodeId) {
    return true;
  }
  if (
    step.clientDeliveryProtocol === "API_PUSH" &&
    !step.clientDeliveryWebhookUrl?.trim()
  ) {
    return true;
  }
  if (!step.clientDeliveryPayloadMapping?.trim()) {
    const payloadBinding = bindings.find(
      (b) =>
        (b.argName || "").trim().toLowerCase() === "payload" ||
        (b.argName || "").trim().toLowerCase() === "message" ||
        (b.argName || "").trim().toLowerCase() === "data",
    );
    if (payloadBinding) {
      if (!isBindingSourceConfigured(payloadBinding)) {
        return true;
      }
    } else {
      if (bindings.length === 0) {
        return true;
      }
    }
  }
  if (bindings.some((b) => !isBindingSourceConfigured(b))) {
    return true;
  }
  return false;
}

function isStorageOperationStepUnconfigured(
  step: PipelineStepDraft,
  bindings: StepBinding[],
): boolean {
  if (!step.storageNodeId && !step.brokerNodeId) return true;
  if (!step.bucketId) return true;
  if (bindings.some((b) => !isBindingSourceConfigured(b))) {
    return true;
  }
  return false;
}

// ─── Master Step Input Validator ─────────────────────────────────────────────

/**
 * Validates if an individual pipeline step has missing / unconfigured input bindings.
 */
export function isStepInputUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[] = [],
): boolean {
  if (step.enabled === false) return false;
  if (step.type === "return_response") return false;

  // Recursively check nested steps in control flow branches
  const nested = collectNestedSteps(step);
  if (nested.some((child) => isStepInputUnconfigured(child, allNodes))) {
    return true;
  }

  const bindings = step.inputBindings || [];

  if (step.type === "transform") {
    return isTransformerStepUnconfigured(step, allNodes, bindings);
  }

  if (step.type === "db_operation") {
    return isDbOperationStepUnconfigured(step, allNodes, bindings);
  }

  if (step.type === "redis_operation") {
    return isRedisOperationStepUnconfigured(step, bindings);
  }

  if (step.type === "storage_operation") {
    return isStorageOperationStepUnconfigured(step, bindings);
  }

  if (step.type === "kafka_publish") {
    return isKafkaPublishStepUnconfigured(step, allNodes, bindings);
  }

  if (step.type === "service_call") {
    return isServiceCallStepUnconfigured(step, allNodes, bindings);
  }

  if (step.type === "external_call") {
    return isExternalCallStepUnconfigured(step, allNodes, bindings);
  }

  if (step.type === "langgraph_invoke") {
    return isLangGraphStepUnconfigured(step, allNodes);
  }

  if (step.type === "push_to_client") {
    return isPushToClientStepUnconfigured(step, bindings);
  }

  return false;
}
