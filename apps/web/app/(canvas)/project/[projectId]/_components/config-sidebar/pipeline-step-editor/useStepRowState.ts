"use client";

import { useMemo, useCallback } from "react";
import { Endpoint, BackendNode, BackendEdge, AnyMessagingResource, AvailableSource } from "@workspace/canvas/types";
import {
  PipelineStepDraft,
  StepBinding,
  ExpectedArg,
} from "./types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  STEP_TYPE_META,
  getAvailableSources,
  getAvailableTransformers,
  isPathMatch,
} from "./utils";
import { toVarName, toPascalCase, parseSchemaJson } from "@/lib/compiler/utils";
import { isStepInputUnconfigured } from "@/lib/utils/pipelineValidation";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";

function extractKafkaTopicSchemaArgs(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  endpoint?: Endpoint,
): ExpectedArg[] {
  const brokerNodes = allNodes.filter(
    (n) =>
      n.type === "kafka" ||
      n.type === "eventstream" ||
      n.type === "sqs" ||
      n.type === "redis-streams" ||
      n.type === "redis-pubsub" ||
      n.type === "queue" ||
      n.type === "pubsub",
  );

  const allResources: Array<{
    id?: string;
    name?: string;
    payloadSchema?: {
      fields?: Array<{ name?: string; type?: string; required?: boolean; description?: string }>;
      rawJson?: string;
    };
    schema?: string;
  }> = [];

  brokerNodes.forEach((b) => {
    const d = b.data || {};
    [
      ...(d.topics || []),
      ...(d.streams || []),
      ...(d.queues || []),
      ...(d.channels || []),
    ].forEach((r) => {
      if (r) allResources.push(r);
    });
  });

  if (endpoint?.publishedEvents) {
    endpoint.publishedEvents.forEach((pe) => {
      if (pe) allResources.push(pe as any);
    });
  }

  const targetResource = allResources.find(
    (r) =>
      (step.messagingResourceId && (r.id === step.messagingResourceId || r.name === step.messagingResourceId)) ||
      (step.operationId && (r.id === step.operationId || r.name === step.operationId || `publish-${r.name}` === step.operationId)) ||
      (step.functionRef?.name && (
        `publish${toPascalCase(r.name || "")}` === step.functionRef.name ||
        `publish${toPascalCase(r.id || "")}` === step.functionRef.name
      )),
  );

  const payloadSchema = targetResource?.payloadSchema;
  const schemaArgs: ExpectedArg[] = [];

  if (payloadSchema) {
    if (Array.isArray(payloadSchema.fields) && payloadSchema.fields.length > 0) {
      payloadSchema.fields.forEach((f) => {
        if (f.name && f.name.trim()) {
          schemaArgs.push({
            name: f.name.trim(),
            type: f.type || "string",
            required: f.required !== false,
          });
        }
      });
    } else if (payloadSchema.rawJson) {
      const parsed = parseSchemaJson(payloadSchema.rawJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([k, v]) => {
          const valType = typeof v === "object" && v !== null ? "object" : typeof v;
          schemaArgs.push({
            name: k,
            type: valType === "undefined" ? "string" : valType,
            required: true,
          });
        });
      }
    }
  }

  if (schemaArgs.length === 0 && targetResource?.schema) {
    const parsed = parseSchemaJson(targetResource.schema);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([k, v]) => {
        const valType = typeof v === "object" && v !== null ? "object" : typeof v;
        schemaArgs.push({
          name: k,
          type: valType === "undefined" ? "string" : valType,
          required: true,
        });
      });
    }
  }

  return schemaArgs;
}

export interface UseStepRowStateProps {
  step: PipelineStepDraft;
  index: number;
  priorSteps: PipelineStepDraft[];
  endpoint?: Endpoint;
  consumedEvent?: AnyMessagingResource;
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  serviceNodeId?: string;
  extraSources?: AvailableSource[];
  onChange: (updated: PipelineStepDraft) => void;
}

export function useStepRowState({
  step,
  index,
  priorSteps,
  endpoint,
  consumedEvent,
  allNodes,
  allEdges,
  serviceNodeId,
  extraSources = [],
  onChange,
}: UseStepRowStateProps) {
  const meta = STEP_TYPE_META[step.type] || STEP_TYPE_META.custom_code;

  // Available sources (request body, params, query, headers, prior steps, or event payload/metadata)
  const availableSources = useMemo(
    () => getAvailableSources(endpoint, priorSteps, allNodes, consumedEvent, extraSources),
    [endpoint, priorSteps, allNodes, consumedEvent, extraSources],
  );

  // Available transformers
  const availableTransformers = useMemo(
    () => getAvailableTransformers(allNodes, serviceNodeId, allEdges),
    [allNodes, serviceNodeId, allEdges],
  );

  const selectedTransformer = useMemo(() => {
    if (step.type !== "transform") return undefined;
    return availableTransformers.find(
      (t) =>
        t.name === step.functionRef?.name ||
        t.id === step.functionRef?.name,
    );
  }, [step.type, step.functionRef?.name, availableTransformers]);

  // DB nodes & entities
  const allEntityNodes = useMemo(
    () =>
      allNodes.filter(
        (n) =>
          n.type === "entity" ||
          n.type === "redis_schema" ||
          n.type === "redis-cache" ||
          n.type === "db_ref",
      ),
    [allNodes],
  );

  const selectedDbId = step.databaseId || "all";
  const selectedTableNode = useMemo(
    () => allEntityNodes.find((n) => n.id === step.tableNodeId),
    [allEntityNodes, step.tableNodeId],
  );

  // Expected arguments (for DB Operation, Redis, Transform, Kafka, Service Call)
  const expectedArgs = useMemo((): ExpectedArg[] => {
    const compute = (): ExpectedArg[] => {
      if (step.type === "transform" && selectedTransformer) {
        return (selectedTransformer.inputSchema || [])
          .filter((f) => f && f.name && f.name.trim())
          .map((f) => ({
            name: f.name.trim(),
            type: f.type || "string",
            required: f.required !== false,
          }));
      }

      if (step.type === "db_operation" && selectedTableNode) {
        const columns = selectedTableNode.data?.columns || [];
        const pkCol = columns.find((c) => c.isPrimaryKey) || columns[0];
        const pkName = pkCol?.name || "id";
        const pkType = pkCol?.type || "string";
        const writableCols = columns.filter((c) => !c.isPrimaryKey && c.name && c.name.trim());

        const opName = (step.functionRef?.name || step.operationId || "").toLowerCase();
        if (opName.includes("create") || opName.includes("insert")) {
          return writableCols.map((c) => ({
            name: toVarName(c.name),
            type: c.type || "string",
            required: c.isNotNull,
          }));
        }
        if (opName.includes("update")) {
          return [
            { name: toVarName(pkName), type: pkType, required: true },
            ...writableCols.map((c) => ({
              name: toVarName(c.name),
              type: c.type || "string",
              required: false,
            })),
          ];
        }
        if (opName.includes("byid") || opName.includes("findone") || opName.includes("delete")) {
          return [{ name: toVarName(pkName), type: pkType, required: true }];
        }
      }

      if (step.type === "redis_operation") {
        if (selectedTableNode && selectedTableNode.id !== "__direct__") {
          const ops = getEntityDbOperations(selectedTableNode, allNodes);
          const op = ops.find(
            (o) => o.id === step.operationId || o.name === step.functionRef?.name,
          );
          if (op && op.params) {
            return op.params
              .filter((p) => p && p.name && p.name.trim())
              .map((p) => ({
                name: p.name.trim(),
                type: p.type || "string",
                required: p.required !== false,
              }));
          }
        }

        // Direct / Standard Redis Commands
        const fn = (step.functionRef?.name || step.operationId || "").toLowerCase();
        if (fn.includes("setex")) {
          return [
            { name: "key", type: "string", required: true },
            { name: "seconds", type: "number", required: true },
            { name: "value", type: "string", required: true },
          ];
        }
        if (fn.includes("hset")) {
          return [
            { name: "key", type: "string", required: true },
            { name: "field", type: "string", required: true },
            { name: "value", type: "string", required: true },
          ];
        }
        if (fn.includes("hget") || fn.includes("hdel")) {
          return [
            { name: "key", type: "string", required: true },
            { name: "field", type: "string", required: true },
          ];
        }
        if (fn.includes("set") || fn.includes("lpush") || fn.includes("rpush")) {
          return [
            { name: "key", type: "string", required: true },
            { name: "value", type: "string", required: true },
          ];
        }
        if (fn.includes("publish")) {
          return [
            { name: "channel", type: "string", required: true },
            { name: "message", type: "string", required: true },
          ];
        }
        if (fn.includes("xadd")) {
          return [
            { name: "stream", type: "string", required: true },
            { name: "fields", type: "object", required: true },
          ];
        }
        if (fn.includes("expire")) {
          return [
            { name: "key", type: "string", required: true },
            { name: "seconds", type: "number", required: true },
          ];
        }
        return [{ name: "key", type: "string", required: true }];
      }

      if (step.type === "kafka_publish") {
        const fnName = step.functionRef?.name || "";
        const isGeneric = fnName === "publishKafkaEvent";
        const schemaArgs = extractKafkaTopicSchemaArgs(step, allNodes, endpoint);

        if (schemaArgs.length > 0) {
          const args: ExpectedArg[] = [];
          if (isGeneric) {
            args.push({ name: "topic", type: "string", required: true });
          }
          args.push(...schemaArgs);
          args.push({ name: "key", type: "string", required: false });
          args.push({ name: "payload", type: "object", required: false });
          return args;
        }

        if (isGeneric) {
          return [
            { name: "topic", type: "string", required: true },
            { name: "payload", type: "object", required: true },
            { name: "key", type: "string", required: false },
          ];
        }
        return [
          { name: "payload", type: "object", required: true },
          { name: "key", type: "string", required: false },
        ];
      }

      if (step.type === "external_call" || step.type === "service_call") {
        const targetId = step.externalNodeId || step.databaseId;
        const targetService = allNodes.find((n) => n.id === targetId);
        const allStoreEndpoints = useBackendCanvasStore.getState().endpoints;
        const endpoints: Endpoint[] =
          allStoreEndpoints.filter((e) => e.nodeId === targetId).length > 0
            ? allStoreEndpoints.filter((e) => e.nodeId === targetId)
            : targetService?.data?.endpoints || [];
        const targetEpId = step.externalEndpointId || step.tableNodeId;
        const targetEp = endpoints.find(
          (ep) => ep.id === targetEpId || ep.name === targetEpId,
        );
        if (targetEp) {
          const args: ExpectedArg[] = [];
          if (targetEp.pathParams && targetEp.pathParams.length > 0) {
            targetEp.pathParams
              .filter((p) => p && p.name && p.name.trim())
              .forEach((p) => {
                args.push({ name: p.name.trim(), type: p.type || "string", required: true });
              });
          }
          if (targetEp.queryParams && targetEp.queryParams.length > 0) {
            targetEp.queryParams
              .filter((q) => q && q.name && q.name.trim())
              .forEach((q) => {
                args.push({ name: q.name.trim(), type: q.type || "string", required: false });
              });
          }
          if (targetEp.headers && targetEp.headers.length > 0) {
            targetEp.headers
              .filter((h) => h && h.name && h.name.trim())
              .forEach((h) => {
                args.push({
                  name: h.name.trim(),
                  type: h.type || "string",
                  required: h.required !== false,
                });
              });
          }
          if (
            targetEp.requestBody &&
            targetEp.requestBody.fields &&
            targetEp.requestBody.fields.length > 0
          ) {
            targetEp.requestBody.fields
              .filter((f) => f && f.name && f.name.trim())
              .forEach((f) => {
                args.push({
                  name: f.name.trim(),
                  type: f.type || "string",
                  required: f.required !== false,
                });
              });
          } else if (targetEp.requestBody?.rawJson) {
            try {
              const parsed = JSON.parse(targetEp.requestBody.rawJson);
              if (
                typeof parsed === "object" &&
                parsed !== null &&
                !Array.isArray(parsed)
              ) {
                Object.entries(parsed)
                  .filter(([key]) => key && key.trim())
                  .forEach(([key, val]) => {
                    args.push({
                      name: key.trim(),
                      type: Array.isArray(val) ? "array" : typeof val,
                      required: true,
                    });
                  });
              } else {
                args.push({ name: "body", type: "object", required: true });
              }
            } catch {
              args.push({ name: "body", type: "object", required: true });
            }
          } else if (
            targetEp.type === "POST" ||
            targetEp.type === "PUT" ||
            targetEp.type === "PATCH"
          ) {
            args.push({ name: "body", type: "object", required: true });
          }
          return args;
        }
        return [
          { name: "params", type: "object", required: false },
          { name: "body", type: "object", required: false },
        ];
      }

      if (step.type === "push_to_client") {
        const args: ExpectedArg[] = [
          {
            name: "payload",
            type: "any",
            required: false,
          },
        ];

        // 1. From consumedEvent schema (e.g. Kafka topic schema fields)
        if (consumedEvent?.payloadSchema) {
          if (
            Array.isArray(consumedEvent.payloadSchema.fields) &&
            consumedEvent.payloadSchema.fields.length > 0
          ) {
            consumedEvent.payloadSchema.fields.forEach((f) => {
              if (f.name && f.name.trim()) {
                args.push({
                  name: f.name.trim(),
                  type: f.type || "string",
                  required: f.required !== false,
                });
              }
            });
          } else if (consumedEvent.payloadSchema.rawJson) {
            const parsed = parseSchemaJson(consumedEvent.payloadSchema.rawJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              Object.entries(parsed).forEach(([k, v]) => {
                const valType = typeof v === "object" && v !== null ? "object" : typeof v;
                args.push({
                  name: k,
                  type: valType === "undefined" ? "string" : valType,
                  required: true,
                });
              });
            }
          }
        }

        // 2. From endpoint request body schema
        if (endpoint?.requestBody) {
          if (
            Array.isArray(endpoint.requestBody.fields) &&
            endpoint.requestBody.fields.length > 0
          ) {
            endpoint.requestBody.fields.forEach((f) => {
              if (f.name && f.name.trim()) {
                args.push({
                  name: f.name.trim(),
                  type: f.type || "string",
                  required: f.required !== false,
                });
              }
            });
          } else if (endpoint.requestBody.rawJson) {
            const parsed = parseSchemaJson(endpoint.requestBody.rawJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              Object.entries(parsed).forEach(([k, v]) => {
                const valType = typeof v === "object" && v !== null ? "object" : typeof v;
                args.push({
                  name: k,
                  type: valType === "undefined" ? "string" : valType,
                  required: true,
                });
              });
            }
          }
        }

        // If specific schema args were added, payload is optional; otherwise payload is required
        if (args.length === 1) {
          args[0]!.required = true;
        }

        return args;
      }

      return [];
    };

    return compute().filter(
      (a) => Boolean(a && a.name && typeof a.name === "string" && a.name.trim().length > 0),
    );
  }, [
    step.type,
    selectedTransformer,
    selectedTableNode,
    step.databaseId,
    step.tableNodeId,
    step.functionRef?.name,
    step.operationId,
    allNodes,
    consumedEvent,
    endpoint,
  ]);

  // Auto-map arguments from route params / query / body / prior steps (preserving existing)
  // ONLY maps and adds fields that actually exist in available sources, preventing adding non-existent fields.
  const handleAutoMapArguments = useCallback(() => {
    if (expectedArgs.length === 0) return;
    const reqBodySource = availableSources.find(
      (s) => s.kind === "req_body" || s.id === "event_payload",
    );
    const reqParamsSource = availableSources.find((s) => s.kind === "req_params");
    const reqQuerySource = availableSources.find((s) => s.kind === "req_query");
    const reqHeadersSource = availableSources.find(
      (s) => s.kind === "req_headers" || s.id === "event_metadata",
    );

    const existingBindingMap = new Map<string, StepBinding>();
    (step.inputBindings || []).forEach((b) => {
      if (b.argName) {
        existingBindingMap.set(b.argName.trim().toLowerCase(), b);
      }
    });

    const newBindings: StepBinding[] = [];

    for (const arg of expectedArgs) {
      const normArg = arg.name.trim().toLowerCase();
      const existing = existingBindingMap.get(normArg);

      // 1. If an existing configured binding exists for this arg, preserve it
      if (existing) {
        const src = existing.source;
        const isConfigured =
          src.kind === "inline"
            ? src.value !== undefined && src.value !== ""
            : src.kind === "step_output"
            ? Boolean(src.stepId)
            : Boolean(src.field && src.field.trim() !== "");
        if (isConfigured) {
          newBindings.push(existing);
          continue;
        }
      }

      // 2. Path param match
      const matchParam = reqParamsSource?.paths.find((p) =>
        isPathMatch(p.path, arg.name),
      );
      if (matchParam) {
        newBindings.push({
          argName: arg.name,
          source: { kind: "req_params", field: matchParam.path },
        });
        continue;
      }

      // 3. Query param match
      const matchQuery = reqQuerySource?.paths.find((p) =>
        isPathMatch(p.path, arg.name),
      );
      if (matchQuery) {
        newBindings.push({
          argName: arg.name,
          source: { kind: "req_query", field: matchQuery.path },
        });
        continue;
      }

      // 4. Prior step outputs match
      let stepMatched = false;
      for (const ps of availableSources.filter((s) => s.kind === "step_output")) {
        const matchStepField = ps.paths.find((p) =>
          isPathMatch(p.path, arg.name),
        );
        if (matchStepField && ps.stepId) {
          newBindings.push({
            argName: arg.name,
            source: {
              kind: "step_output",
              stepId: ps.stepId,
              field: matchStepField.path,
            },
          });
          stepMatched = true;
          break;
        }
      }
      if (stepMatched) continue;

      // 5. Request body / Event payload match
      const matchBody = reqBodySource?.paths.find((p) =>
        isPathMatch(p.path, arg.name),
      );
      if (matchBody) {
        newBindings.push({
          argName: arg.name,
          source: { kind: "req_body", field: matchBody.path },
        });
        continue;
      }

      // 6. Header / Event Metadata match
      const matchHeader = reqHeadersSource?.paths.find((p) =>
        isPathMatch(p.path, arg.name),
      );
      if (matchHeader) {
        newBindings.push({
          argName: arg.name,
          source: { kind: "req_headers", field: matchHeader.path },
        });
        continue;
      }

      // 7. If existing was already present in inputBindings (even if unconfigured), preserve it
      if (existing) {
        newBindings.push(existing);
        continue;
      }

      // 7b. If payload argument and has prior step outputs, auto-bind to the immediate last prior step output
      if (arg.name === "payload") {
        if ((step.type === "push_to_client" || step.type === "kafka_publish") && newBindings.length > 0) {
          continue;
        }
        const stepSources = availableSources.filter((s) => s.kind === "step_output");
        const lastStep = stepSources.length > 0 ? stepSources[stepSources.length - 1] : undefined;
        if (lastStep?.stepId) {
          newBindings.push({
            argName: arg.name,
            source: {
              kind: "step_output",
              stepId: lastStep.stepId,
              field: "",
            },
          });
          continue;
        } else if (reqBodySource) {
          newBindings.push({
            argName: arg.name,
            source: { kind: "req_body", field: "" },
          });
          continue;
        }
      }

      // 8. If no matching field exists in any available source, do NOT add non-existent field
    }

    // Also keep any extra custom bindings that the user manually added
    const expectedArgNames = new Set(
      expectedArgs.map((a) => a.name.trim().toLowerCase()),
    );
    const extraCustomBindings = (step.inputBindings || []).filter(
      (b) => !expectedArgNames.has(b.argName.trim().toLowerCase()),
    );

    onChange({
      ...step,
      inputBindings: [...newBindings, ...extraCustomBindings],
    });
  }, [expectedArgs, availableSources, step, onChange]);

  const updateBinding = useCallback(
    (bi: number, updated: StepBinding) => {
      const bindings = [...(step.inputBindings || [])];
      bindings[bi] = updated;
      onChange({ ...step, inputBindings: bindings });
    },
    [step, onChange],
  );

  const addBinding = useCallback(() => {
    const validArgs = expectedArgs.filter(
      (a) => Boolean(a && a.name && typeof a.name === "string" && a.name.trim().length > 0),
    );
    const existingNames = new Set(
      (step.inputBindings || [])
        .map((b) => (b.argName || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const nextUnbound = validArgs.find(
      (a) => !existingNames.has(a.name.trim().toLowerCase()),
    );
    const argName = nextUnbound
      ? nextUnbound.name.trim()
      : (validArgs[0]?.name?.trim() ?? `arg_${(step.inputBindings || []).length + 1}`);

    let defaultSource: StepBinding["source"] = { kind: "req_body", field: "" };
    if (argName) {
      for (const src of availableSources) {
        const match = src.paths.find((p) => isPathMatch(p.path, argName));
        if (match) {
          if (src.kind === "step_output" && src.stepId) {
            defaultSource = { kind: "step_output", stepId: src.stepId, field: match.path };
          } else if (
            src.kind === "req_body" ||
            src.kind === "req_params" ||
            src.kind === "req_query" ||
            src.kind === "req_headers"
          ) {
            defaultSource = { kind: src.kind, field: match.path };
          }
          break;
        }
      }
    }

    const newBinding: StepBinding = {
      argName,
      source: defaultSource,
    };
    onChange({
      ...step,
      inputBindings: [...(step.inputBindings || []), newBinding],
    });
  }, [step, onChange, expectedArgs, availableSources]);

  const removeBinding = useCallback(
    (bi: number) => {
      onChange({
        ...step,
        inputBindings: (step.inputBindings || []).filter((_, i) => i !== bi),
      });
    },
    [step, onChange],
  );

  const stepId = step.id || `step-${index}`;
  const displayVarName = step.outputVariable || step.name || `step${index + 1}Result`;

  const isUnconfigured = useMemo(
    () => isStepInputUnconfigured(step, allNodes),
    [step, allNodes],
  );

  return {
    meta,
    availableSources,
    availableTransformers,
    selectedTransformer,
    selectedDbId,
    selectedTableNode,
    expectedArgs,
    isUnconfigured,
    stepId,
    displayVarName,
    handleAutoMapArguments,
    updateBinding,
    addBinding,
    removeBinding,
  };
}
