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

  if (source.kind === "inline") {
    if ("value" in source) {
      if (source.value === undefined || source.value === null) return false;
      if (typeof source.value === "string" && source.value.trim().length === 0) return false;
      return true;
    }
    return false;
  }

  if (source.kind === "step_output") {
    if ("stepId" in source && "field" in source) {
      return Boolean(
        source.stepId?.trim() &&
          source.field !== undefined &&
          String(source.field).trim().length > 0,
      );
    }
    return false;
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

  return nested;
}

// ─── Step-Specific Input Validators ──────────────────────────────────────────

function isTransformerStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  if (!step.functionRef?.name && !step.transformerNodeId) return true;

  // Resolve input schema from step or from graph nodes
  let inputSchema = step.functionRef?.inputSchema;
  if (!inputSchema || inputSchema.length === 0) {
    const tNode = allNodes.find(
      (n) =>
        (n.type === "transformer" || n.type === "transformer_ref") &&
        (n.id === step.functionRef?.name ||
          n.data?.functionName === step.functionRef?.name ||
          n.data?.label === step.functionRef?.name ||
          n.id === step.transformerNodeId),
    );
    if (tNode) {
      if (tNode.type === "transformer_ref" && tNode.data?.transformerRef) {
        const master = allNodes.find(
          (m) =>
            m.type === "transformer" &&
            (m.id === tNode.data?.transformerRef ||
              m.data?.functionName === tNode.data?.transformerRef ||
              m.data?.label === tNode.data?.transformerRef),
        );
        inputSchema = master?.data?.inputSchema || [];
      } else {
        inputSchema = tNode.data?.inputSchema || [];
      }
    }
  }

  if (inputSchema && inputSchema.length > 0) {
    const validSchemaFields = inputSchema.filter(
      (f) => Boolean(f && f.name && f.name.trim().length > 0),
    );
    const requiredFields = validSchemaFields.filter(
      (f) => f.required !== false,
    );
    const fieldsToCheck =
      requiredFields.length > 0 ? requiredFields : validSchemaFields;

    if (fieldsToCheck.length > 0 && bindings.length === 0) return true;

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
  } else {
    if (bindings.length === 0) return true;
    if (bindings.some((b) => !isBindingSourceConfigured(b))) return true;
  }

  return false;
}

function isDbOperationStepUnconfigured(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  bindings: StepBinding[],
): boolean {
  const tableId = step.tableNodeId || step.databaseId;
  if (!tableId) return true;

  const tableNode = allNodes.find(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      (n.id === tableId || n.data?.tableRef === tableId),
  );

  const columns: EntityColumn[] = tableNode?.data?.columns || [];
  const pkCol = columns.find((c) => c.isPrimaryKey) || columns[0];
  const op = (step.operationId || step.functionRef?.name || "").toLowerCase();

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
    } else {
      if (bindings.length === 0) return true;
      if (bindings.some((b) => !isBindingSourceConfigured(b))) return true;
    }
    return false;
  }

  if (
    op.includes("update") ||
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

  if (bindings.length === 0) return true;
  if (bindings.some((b) => !isBindingSourceConfigured(b))) return true;
  return false;
}

function isRedisOperationStepUnconfigured(
  step: PipelineStepDraft,
  bindings: StepBinding[],
): boolean {
  const fn = (step.functionRef?.name || step.operationId || "").toLowerCase();
  if (!fn) return true;

  let requiredArgNames: string[] = ["key"];
  if (fn.includes("setex")) {
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
        (b.argName || "").trim().toLowerCase() === "message",
    );
    if (!payloadBinding || !isBindingSourceConfigured(payloadBinding)) {
      return true;
    }
  }
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
