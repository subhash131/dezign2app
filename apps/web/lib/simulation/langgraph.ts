import type { BackendNode, SimulationTestCase } from "@/types/canvas";
import type { SimulationTestCaseResult, SimulationTraceEntry } from "./types";
import { clone, getPath } from "./utils";

export function resolveRouterFieldValue(
  field: string,
  state: Record<string, unknown>,
): unknown {
  const cleanField = field
    .replace(/^state\./, "")
    .replace(/^structuredResponse\./, "");
  // 1. Direct path in state
  let val = getPath(state, cleanField);
  if (val !== undefined && val !== null) return val;

  // 2. Structured response
  if (state.structuredResponse && typeof state.structuredResponse === "object") {
    val = getPath(state.structuredResponse, cleanField);
    if (val !== undefined && val !== null) return val;
  }

  // 3. Search in state.messages for JSON content in recent messages
  if (Array.isArray(state.messages) && state.messages.length > 0) {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const msg = state.messages[i];
      if (typeof msg?.content === "string") {
        const parsed = extractJsonFromText(msg.content);
        if (parsed) {
          val = resolveStructuredFieldValue(cleanField, parsed);
          if (val !== undefined && val !== null) return val;
        }
      }
    }
  }

  // 4. In state.response (stringified JSON)
  if (typeof state.response === "string") {
    const parsed = extractJsonFromText(state.response);
    if (parsed) {
      val = resolveStructuredFieldValue(cleanField, parsed);
      if (val !== undefined && val !== null) return val;
    }
  }

  return undefined;
}

/**
 * Robustly extracts a JSON object from text, handling markdown code fences,
 * preamble / postamble text, and single-string values.
 */
export function extractJsonFromText(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== "string") return null;
  const clean = text.trim();

  // 1. Direct parse
  try {
    const direct = JSON.parse(clean);
    if (typeof direct === "object" && direct !== null && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {}

  // 2. Fenced code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }

  // 3. Outer { and } substring extraction
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const substring = clean.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(substring);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }

  return null;
}

/**
 * Resolves a field value from structured output object or fallback text.
 * Strips prefix like "state." or "structuredResponse.", searches case-insensitively,
 * and falls back gracefully.
 */
export function resolveStructuredFieldValue(
  targetKey: string,
  structuredObj?: Record<string, unknown> | null,
  rawText?: string
): unknown {
  const cleanKey = targetKey
    .replace(/^state\./, "")
    .replace(/^structuredResponse\./, "")
    .trim();

  if (structuredObj && typeof structuredObj === "object") {
    // 1. Direct key
    if (cleanKey in structuredObj && structuredObj[cleanKey] !== undefined) {
      return structuredObj[cleanKey];
    }
    // 2. Nested path via getPath
    const nested = getPath(structuredObj, cleanKey);
    if (nested !== undefined) return nested;

    // 3. Case-insensitive key match
    const lowerKey = cleanKey.toLowerCase();
    for (const [k, v] of Object.entries(structuredObj)) {
      if (k.toLowerCase() === lowerKey) return v;
    }

    // 4. Single-key extraction (if schema has 1 property and object has 1 non-raw property)
    const validKeys = Object.keys(structuredObj).filter((k) => k !== "raw");
    if (validKeys.length === 1 && validKeys[0]) {
      return structuredObj[validKeys[0]];
    }
  }

  // 5. Fallback from raw text if it wasn't a full JSON object
  if (rawText) {
    const trimmed = rawText.trim().replace(/^["']|["']$/g, "");
    if (trimmed.length < 120 && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return trimmed;
    }
  }

  return undefined;
}

export function evaluateRouterBranch(
  branch: { field: string; operator: string; value?: string; isDefault?: boolean },
  state: Record<string, unknown>,
): boolean {
  if (branch.isDefault) return true;
  const actual = resolveRouterFieldValue(branch.field, state);
  const expected = branch.value;
  switch (branch.operator) {
    case "eq":
      return String(actual).toLowerCase() === String(expected).toLowerCase();
    case "neq":
      return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected)
        : String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "is_not_null":
      return actual !== null && actual !== undefined;
    default:
      return false;
  }
}

/** Simulates a LangGraph graph, preserving every visited node and router edge in the trace. */
export async function simulateLangGraphTestCase(args: {
  graph: BackendNode;
  testCase: SimulationTestCase;
}): Promise<SimulationTestCaseResult> {
  const data = args.graph.data;
  const steps = data.graphSteps ?? [];
  const graphEdges = data.graphEdges ?? [];
  const stepOrder = new Map(steps.map((step, index) => [step.id, index]));
  const state: Record<string, unknown> = {
    ...(args.testCase.initialState ?? {}),
    ...((args.testCase.request?.body as Record<string, unknown> | undefined) ??
      {}),
  };
  const trace: SimulationTraceEntry[] = [
    {
      id: `${args.testCase.id}-start`,
      kind: "step",
      label: "START",
      status: "completed",
      nodeId: "START",
      edgeId: args.testCase.targetRouteId,
      input: clone(state),
    },
  ];
  const assertions: SimulationTestCaseResult["assertions"] = [];
  const visited = new Set<string>();
  const actualPath: string[] = ["START"];
  let executionStatus = 200;
  const firstEdge = graphEdges
    .filter((edge) => edge.source === "START")
    .sort(
      (left, right) =>
        (stepOrder.get(left.targets?.[0]?.id ?? "") ??
          Number.MAX_SAFE_INTEGER) -
          (stepOrder.get(right.targets?.[0]?.id ?? "") ??
            Number.MAX_SAFE_INTEGER) ||
        (left.targets?.[0]?.id ?? "").localeCompare(
          right.targets?.[0]?.id ?? "",
          undefined,
          { numeric: true },
        ) ||
        (left.sourceHandle ?? "").localeCompare(right.sourceHandle ?? ""),
    )[0];
  let currentId = firstEdge?.targets?.[0]?.id;
  let incomingEdge = firstEdge;
  let guard = 0;

  while (
    currentId &&
    currentId !== "END" &&
    guard++ < steps.length + graphEdges.length + 5
  ) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const step = steps.find((candidate) => candidate.id === currentId);
    const agent = data.agentDefinitions?.find(
      (candidate) => (candidate.id || candidate.agentId) === currentId,
    );
    const resource = [
      ...(data.customLlmNodes ?? []),
      ...(data.toolDefinitions ?? []),
      ...(data.middlewareDefinitions ?? []),
      ...(data.memoryDefinitions ?? []),
      ...(data.outputChannels ?? []),
    ].find((candidate) => candidate.id === currentId);
    if (
      !step &&
      !agent &&
      !resource &&
      !graphEdges.some((edge) => edge.source === currentId)
    )
      break;
    actualPath.push(currentId);
    const nodeTrace: SimulationTraceEntry = {
      id: `${args.testCase.id}-${currentId}`,
      kind: "step",
      label:
        step?.name ||
        agent?.name ||
        (resource as { label?: string; name?: string } | undefined)?.label ||
        (resource as { label?: string; name?: string } | undefined)?.name ||
        currentId,
      status: "completed",
      nodeId: currentId,
      edgeId: incomingEdge?.id,
      input: clone(state),
    };
    trace.push(nodeTrace);

    // LangGraph nodes are mocked during test execution. Feed the configured
    // output into the next node instead of attempting to execute the node.
    const configuredOutput = args.testCase.mocks?.[currentId];
    if (configuredOutput) {
      nodeTrace.output = clone(configuredOutput.returnData);
      executionStatus = configuredOutput.status ?? 200;
      if (
        configuredOutput.returnData &&
        typeof configuredOutput.returnData === "object" &&
        !Array.isArray(configuredOutput.returnData)
      ) {
        Object.assign(state, configuredOutput.returnData);
      }
      if (executionStatus >= 400) {
        nodeTrace.status = "failed";
        break;
      }
    }

    for (const update of step?.stateUpdates ?? []) {
      let value: unknown = update.value;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          /* keep plain text state updates */
        }
      }
      state[update.channelKey] =
        update.mode === "append" && Array.isArray(state[update.channelKey])
          ? [...(state[update.channelKey] as unknown[]), value]
          : value;
    }

    const outgoing = graphEdges.filter((edge) => edge.source === currentId);
    const orderedOutgoing = [...outgoing].sort((left, right) => {
      const leftOrder =
        stepOrder.get(left.targets?.[0]?.id ?? "") ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        stepOrder.get(right.targets?.[0]?.id ?? "") ?? Number.MAX_SAFE_INTEGER;
      return (
        leftOrder - rightOrder ||
        (left.targets?.[0]?.id ?? "").localeCompare(
          right.targets?.[0]?.id ?? "",
          undefined,
          { numeric: true },
        ) ||
        (left.sourceHandle ?? "").localeCompare(right.sourceHandle ?? "")
      );
    });
    let nextEdge = orderedOutgoing[0];
    if (step?.type === "router" && outgoing.length > 0) {
      const selectedBranchId = args.testCase.routerChoices?.[step.id];
      const selectedBranch = step.routerConfig?.branches?.find(
        (branch) => branch.id === selectedBranchId,
      );
      const matchingBranch =
        selectedBranch ||
        step.routerConfig?.branches?.find(
          (branch) => branch.isDefault || evaluateRouterBranch(branch, state),
        );
      nextEdge =
        outgoing.find((edge) => edge.sourceHandle === matchingBranch?.id) ||
        nextEdge;
      trace.push({
        id: `${args.testCase.id}-${step.id}-route`,
        kind: "step",
        label: `Router → ${matchingBranch?.label || "default"}`,
        status: "completed",
        nodeId: step.id,
        edgeId: nextEdge?.id,
        input: clone(state),
      });
    }
    incomingEdge = nextEdge;
    currentId = nextEdge?.targets?.[0]?.id;
    if (currentId) {
      const agentRef = (args.graph.data as { customAgentRefNodes?: Array<{ id: string; agentRef?: string; nodeRef?: string }> })?.customAgentRefNodes?.find((r) => r.id === currentId);
      if (agentRef && (agentRef.agentRef || agentRef.nodeRef)) {
        actualPath.push(currentId);
        currentId = agentRef.agentRef || agentRef.nodeRef;
      }
    }
  }

  if (
    currentId === "END" ||
    incomingEdge?.targets?.some(
      (target) => target.kind === "end" || target.id === "END",
    )
  ) {
    actualPath.push("END");
    trace.push({
      id: `${args.testCase.id}-end`,
      kind: "step",
      label: "END",
      status: "completed",
      nodeId: "END",
      edgeId: incomingEdge?.id,
      output: clone(state),
    });
  }

  assertions.push({
    name: "expected status",
    passed:
      args.testCase.expectedStatus === undefined ||
      args.testCase.expectedStatus === executionStatus,
    detail:
      args.testCase.expectedStatus === undefined
        ? undefined
        : `Expected ${args.testCase.expectedStatus}, received ${executionStatus}`,
  });
  assertions.push({
    name: "expected final state",
    passed:
      args.testCase.expectedState === undefined ||
      JSON.stringify(args.testCase.expectedState) === JSON.stringify(state),
    detail:
      args.testCase.expectedState === undefined
        ? undefined
        : "Final graph state differs from expected state",
  });
  assertions.push({
    name: "expected graph path",
    passed:
      args.testCase.expectedPath === undefined ||
      JSON.stringify(args.testCase.expectedPath) === JSON.stringify(actualPath),
    detail:
      args.testCase.expectedPath === undefined
        ? undefined
        : `Expected ${JSON.stringify(args.testCase.expectedPath)}, received ${JSON.stringify(actualPath)}`,
  });
  const passed = assertions.every((assertion) => assertion.passed);
  return {
    status: passed ? executionStatus : 422,
    statusText: passed
      ? executionStatus >= 400
        ? "Node Output Failed"
        : "OK"
      : "Assertion Failed",
    headers: { "x-simulated": "true" },
    body: clone(state),
    trace,
    testCaseId: args.testCase.id,
    testCaseName: args.testCase.name,
    assertions,
  };
}
