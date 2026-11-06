"use client";

import React, { useMemo } from "react";
import {
  Shuffle,
  Plus,
  Sparkles,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toVarName } from "@/lib/compiler/utils";
import { toast } from "sonner";
import type { BackendNode, UIEventItem } from "@workspace/canvas";
import type {
  FrontendActionStepDraft,
  FrontendFieldSource,
  FrontendTransformBinding,
  AvailablePath,
} from "./types";
import { ensureActionTransformerConnection } from "./actionStepCanvasSync";
import { ActionFlowCombobox, ComboboxOption } from "./ActionFlowCombobox";
import { ResponseFieldPicker } from "./ResponseFieldPicker";
import { inferReturnSchemaFromCode } from "@/lib/utils/inferReturnSchema";

interface TransformerSchemaField {
  id?: string;
  name: string;
  type?: string;
  required?: boolean;
}

interface StateStoreFieldItem {
  name: string;
  type?: string;
}

export interface TransformerStepProps {
  draft: FrontendActionStepDraft;
  allSteps: FrontendActionStepDraft[];
  stepIndex: number;
  allNodes: BackendNode[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  incomingPaths?: AvailablePath[];
  onChange: (updated: FrontendActionStepDraft) => void;
}

export const TransformerStep: React.FC<TransformerStepProps> = ({
  draft,
  allSteps,
  stepIndex,
  allNodes,
  webPageNodeId,
  actionId,
  incomingPaths = [],
  onChange,
}) => {
  const priorSteps = useMemo(() => allSteps.slice(0, stepIndex), [allSteps, stepIndex]);

  const incomingFieldOptions = useMemo((): ComboboxOption[] => {
    return (incomingPaths || []).map((ip) => ({
      value: ip.path,
      label: `${ip.path}${ip.type ? ` (${ip.type})` : ""}`,
      type: ip.type || "string",
    }));
  }, [incomingPaths]);

  const currentPageNode = useMemo(
    () => allNodes.find((n) => n.id === webPageNodeId),
    [allNodes, webPageNodeId],
  );

  // Available canvas transformer nodes
  const canvasTransformers = useMemo(() => {
    return allNodes.filter(
      (n) => n.type === "transformer" || n.type === "transformer_ref",
    );
  }, [allNodes]);

  // Selected transformer node
  const selectedTransformerNode = useMemo(() => {
    return canvasTransformers.find(
      (t) =>
        t.id === draft.transformerNodeId ||
        t.id === draft.transformerRefNodeId ||
        (t.type === "transformer_ref" &&
          t.data?.transformerRef === draft.transformerNodeId) ||
        t.data?.functionName === draft.functionRef?.name ||
        t.data?.label === draft.transformerName ||
        (draft.transformerName &&
          toVarName(t.data?.label || t.data?.functionName || "") ===
            toVarName(draft.transformerName)),
    );
  }, [
    canvasTransformers,
    draft.transformerNodeId,
    draft.transformerRefNodeId,
    draft.functionRef?.name,
    draft.transformerName,
  ]);

  const masterTransformerNode = useMemo(() => {
    if (!selectedTransformerNode) return undefined;
    if (selectedTransformerNode.type === "transformer_ref") {
      const refId = selectedTransformerNode.data?.transformerRef;
      if (typeof refId === "string" && refId.length > 0) {
        return canvasTransformers.find(
          (t) =>
            t.type === "transformer" &&
            (t.id === refId ||
              t.data?.functionName === refId ||
              t.data?.label === refId ||
              (typeof t.data?.functionName === "string" && toVarName(t.data.functionName) === toVarName(refId)) ||
              (typeof t.data?.label === "string" && toVarName(t.data.label) === toVarName(refId))),
        );
      }
    }
    return selectedTransformerNode;
  }, [selectedTransformerNode, canvasTransformers]);

  const effectiveTransformerNode = masterTransformerNode || selectedTransformerNode;

  const inputSchema: TransformerSchemaField[] = useMemo(() => {
    const rawSchema =
      effectiveTransformerNode?.data?.inputSchema ||
      draft.functionRef?.inputSchema ||
      [];
    return rawSchema;
  }, [effectiveTransformerNode, draft.functionRef?.inputSchema]);

  const returnSchema: TransformerSchemaField[] = useMemo(() => {
    let rawSchema =
      effectiveTransformerNode?.data?.returnSchema ||
      draft.functionRef?.returnSchema ||
      [];
    if ((!rawSchema || rawSchema.length === 0) && effectiveTransformerNode?.data?.code) {
      try {
        const inferred = inferReturnSchemaFromCode(
          effectiveTransformerNode.data.code,
          effectiveTransformerNode.data.inputSchema || [],
        );
        if (inferred.length > 0) {
          rawSchema = inferred;
        }
      } catch {}
    }
    return rawSchema;
  }, [effectiveTransformerNode, draft.functionRef?.returnSchema]);

  // Handle selecting an existing transformer node
  const handleSelectTransformer = (nodeId: string) => {
    const t = canvasTransformers.find((tr) => tr.id === nodeId);
    if (!t) return;

    const fnName = t.data?.label || t.data?.functionName || "transformer";
    const cleanFn = toVarName(fnName);
    const defaultOutputVar = draft.outputVariable || `${cleanFn}Result`;
    const isGlobal =
      t.data?.scope === "global" || t.type === "transformer_ref";
    const masterId =
      t.type === "transformer_ref" ? t.data?.transformerRef || t.id : t.id;

    const masterNode =
      t.type === "transformer_ref" && typeof masterId === "string" && masterId.length > 0
        ? canvasTransformers.find(
            (tr) =>
              tr.type === "transformer" &&
              (tr.id === masterId ||
                tr.data?.functionName === masterId ||
                tr.data?.label === masterId ||
                (typeof tr.data?.functionName === "string" && toVarName(tr.data.functionName) === toVarName(masterId)) ||
                (typeof tr.data?.label === "string" && toVarName(tr.data.label) === toVarName(masterId))),
          ) || t
        : t;

    let effectiveEdgeId = draft.edgeId;
    let effectiveRefNodeId = draft.transformerRefNodeId;
    if (webPageNodeId && actionId) {
      const connRes = ensureActionTransformerConnection({
        webPageNodeId,
        actionId,
        transformerNodeId: t.id,
        stepOrder: draft.order,
        previousEdgeId: draft.edgeId,
      });
      if (connRes) {
        effectiveEdgeId = connRes.edgeId;
        effectiveRefNodeId = connRes.refNodeId;
      }
    }

    const currentBindings = draft.transformBindings || [];
    const sourceSchema: TransformerSchemaField[] =
      masterNode.data?.inputSchema || t.data?.inputSchema || [];
    let sourceReturnSchema: TransformerSchemaField[] =
      masterNode.data?.returnSchema || t.data?.returnSchema || [];
    if ((!sourceReturnSchema || sourceReturnSchema.length === 0) && masterNode.data?.code) {
      try {
        const inferred = inferReturnSchemaFromCode(masterNode.data.code, sourceSchema);
        if (inferred.length > 0) sourceReturnSchema = inferred;
      } catch {}
    }

    const nextBindings: FrontendTransformBinding[] = sourceSchema
      .filter((field: TransformerSchemaField) => Boolean(field.name && field.name.trim()))
      .map((field: TransformerSchemaField) => {
        const existing = currentBindings.find(
          (b) =>
            (b.argName || "").trim().toLowerCase() ===
            field.name.trim().toLowerCase(),
        );
        if (existing) return existing;
        const literalSource: FrontendFieldSource = { kind: "literal", value: "" };
        return {
          argName: field.name.trim(),
          source: literalSource,
        };
      });

    onChange({
      ...draft,
      name: defaultOutputVar,
      outputVariable: defaultOutputVar,
      transformerNodeId: masterId,
      transformerRefNodeId: effectiveRefNodeId || (t.type === "transformer_ref" ? t.id : undefined),
      transformerName: fnName,
      edgeId: effectiveEdgeId,
      functionRef: {
        name: cleanFn,
        importPath: isGlobal
          ? "@workspace/transformers"
          : `../transformers/${cleanFn}`,
        isGlobal,
        inputSchema: sourceSchema.map((f) => ({
          name: f.name,
          type: f.type || "string",
          required: f.required,
        })),
        returnSchema: sourceReturnSchema.map((f) => ({
          name: f.name,
          type: f.type || "string",
          required: f.required,
        })),
      },
      transformBindings: nextBindings,
    });
  };

  // Directly create a new TransformerNode on the canvas
  const handleCreateTransformerNode = () => {
    const store = useBackendCanvasStore.getState();
    const wpNode = store.nodes.find((n) => n.id === webPageNodeId);

    const existingCount = store.nodes.filter(
      (n) => n.type === "transformer",
    ).length;
    const fnName = `transformData${existingCount + 1}`;
    const cleanFn = toVarName(fnName);
    const newId = `transformer-${Date.now()}`;

    const basePos = wpNode?.position || { x: 300, y: 300 };
    const position = {
      x: basePos.x + 360,
      y: basePos.y + (existingCount + 1) * 60,
    };

    store.addNode({
      id: newId,
      type: "transformer",
      position,
      data: {
        label: fnName,
        functionName: fnName,
        description: `Transformer for ${wpNode?.data?.label || "Page Action"}`,
        scope: "global",
        inputSchema: [
          { id: "param-data", name: "data", type: "any", required: true },
        ],
        returnSchema: [
          { id: "param-result", name: "result", type: "any", required: true },
        ],
        logicMode: "code",
        code: "return {\n  result: data\n};",
        isAsync: false,
      },
    });

    let effectiveEdgeId = draft.edgeId;
    let effectiveRefNodeId = draft.transformerRefNodeId;
    if (webPageNodeId && actionId) {
      const connRes = ensureActionTransformerConnection({
        webPageNodeId,
        actionId,
        transformerNodeId: newId,
        stepOrder: draft.order,
        previousEdgeId: draft.edgeId,
      });
      if (connRes) {
        effectiveEdgeId = connRes.edgeId;
        effectiveRefNodeId = connRes.refNodeId;
      }
    }

    const defaultOutputVar = `${cleanFn}Result`;
    const defaultDataBindingSource: FrontendFieldSource = { kind: "literal", value: "" };
    onChange({
      ...draft,
      name: defaultOutputVar,
      outputVariable: defaultOutputVar,
      transformerNodeId: newId,
      transformerRefNodeId: effectiveRefNodeId,
      transformerName: fnName,
      edgeId: effectiveEdgeId,
      functionRef: {
        name: cleanFn,
        importPath: "@workspace/transformers",
        isGlobal: true,
        inputSchema: [
          { name: "data", type: "any", required: true },
        ],
        returnSchema: [
          { name: "result", type: "any", required: true },
        ],
      },
      transformBindings: [
        {
          argName: "data",
          source: defaultDataBindingSource,
        },
      ],
    });

    // Open config sidebar for the newly created node
    store.setActiveConfigItem({
      type: "transformer",
      id: newId,
      nodeId: newId,
    });

    toast.success(`Created TransformerNode "${fnName}" and linked to step`);
  };

  const handleOpenTransformerConfig = () => {
    const targetId =
      selectedTransformerNode?.id || draft.transformerNodeId;
    if (!targetId) return;
    useBackendCanvasStore.getState().setActiveConfigItem({
      type: "transformer",
      id: targetId,
      nodeId: targetId,
    });
  };

  // State Stores & variables options
  const stateStores = useMemo(
    () => allNodes.filter((n) => n.type === "state_store"),
    [allNodes],
  );

  const routeParamSuggestions = useMemo(() => {
    const params = currentPageNode?.data?.pathParams || [];
    return params.map((p) => ({
      value: p.name,
      label: p.name,
      type: p.type || "string",
    }));
  }, [currentPageNode?.data?.pathParams]);

  const queryParamSuggestions = useMemo(() => {
    const queries = currentPageNode?.data?.queryParams || [];
    return queries.map((q) => ({
      value: q.name,
      label: q.name,
      type: q.type || "string",
    }));
  }, [currentPageNode?.data?.queryParams]);

  const allStateVarOptions = useMemo(() => {
    const list: Array<{ value: string; label: string; type?: string; storeName?: string; storeId?: string }> = [];
    stateStores.forEach((s) => {
      const storeFields: StateStoreFieldItem[] = s.data?.fields || [];
      storeFields.forEach((f: StateStoreFieldItem) => {
        list.push({
          value: f.name,
          label: `${s.data?.label || s.data?.storeName || "Store"}.${f.name}`,
          type: f.type || "string",
          storeName: s.data?.storeName || s.data?.label || "Store",
          storeId: s.id,
        });
      });
    });
    const sections = currentPageNode?.data?.sections || [];
    sections.forEach((sec) => {
      (sec.states || []).forEach((st) => {
        if (!list.some((existing) => existing.value === st.name)) {
          list.push({
            value: st.name,
            label: `local.${st.name}`,
            type: st.type,
          });
        }
      });
    });
    return list;
  }, [stateStores, currentPageNode]);

  // Form input suggestions from currentPageNode sections
  const inputSuggestions = useMemo(() => {
    const sections = currentPageNode?.data?.sections || [];
    const fields: string[] = [];
    sections.forEach((sec) => {
      (sec.componentBindings || []).forEach((comp) => {
        if (comp.name && !fields.includes(comp.name)) {
          fields.push(comp.name);
        }
        (comp.elements || []).forEach((el) => {
          if (el.name && !fields.includes(el.name)) {
            fields.push(el.name);
          }
        });
      });
    });
    return fields;
  }, [currentPageNode]);

  // Auto-map arguments to candidate sources
  const handleAutoMapArguments = () => {
    const currentBindings = draft.transformBindings || [];
    const args: TransformerSchemaField[] =
      inputSchema.length > 0
        ? inputSchema
        : currentBindings.map((b) => ({ name: b.argName, type: "any" }));

    const nextBindings: FrontendTransformBinding[] = args.map((arg: TransformerSchemaField) => {
      const existing = currentBindings.find(
        (b) => b.argName.toLowerCase() === arg.name.toLowerCase(),
      );
      if (existing && existing.source.kind !== "literal") {
        return existing;
      }

      const lower = arg.name.toLowerCase();

      // 0. Check incoming realtime stream payload
      if (incomingPaths && incomingPaths.length > 0) {
        const matchedIncoming = incomingPaths.find(
          (ip) => ip.path.toLowerCase() === lower,
        );
        if (matchedIncoming) {
          return {
            argName: arg.name,
            source: {
              kind: "realtime_payload",
              fieldPath: matchedIncoming.path,
            },
          };
        }
        if (lower === "payload" || lower === "input" || lower === "data" || lower === "event") {
          return {
            argName: arg.name,
            source: {
              kind: "realtime_payload",
              fieldPath: "",
            },
          };
        }
      }

      // 1. Check prior steps
      for (const pStep of [...priorSteps].reverse()) {
        if (pStep.type === "api_call") {
          return {
            argName: arg.name,
            source: {
              kind: "prev_response",
              stepId: pStep.id,
              fieldPath: lower,
            },
          };
        }
      }

      // 2. Check state variables
      const matchedState = allStateVarOptions.find(
        (st) => st.value.toLowerCase() === lower,
      );
      if (matchedState) {
        return {
          argName: arg.name,
          source: {
            kind: "state_var",
            stateKey: matchedState.value,
            storeNodeId: matchedState.storeId,
            storeName: matchedState.storeName,
          },
        };
      }

      // 3. Check form inputs
      const matchedInput = inputSuggestions.find(
        (inp) => inp.toLowerCase() === lower,
      );
      if (matchedInput) {
        return {
          argName: arg.name,
          source: {
            kind: "user_input",
            fieldName: matchedInput,
          },
        };
      }

      // 4. Check query params
      const matchedQuery = queryParamSuggestions.find(
        (q) => q.value.toLowerCase() === lower,
      );
      if (matchedQuery) {
        return {
          argName: arg.name,
          source: {
            kind: "query_param",
            paramName: matchedQuery.value,
          },
        };
      }

      const defaultLiteral: FrontendFieldSource = { kind: "literal", value: "" };
      return existing || {
        argName: arg.name,
        source: defaultLiteral,
      };
    });

    onChange({
      ...draft,
      transformBindings: nextBindings,
    });
    toast.success("Auto-mapped arguments from available state and prior steps");
  };

  const handleBindingChange = (
    argName: string,
    source: FrontendFieldSource,
  ) => {
    const list = [...(draft.transformBindings || [])];
    const idx = list.findIndex((b) => b.argName === argName);
    if (idx >= 0) {
      list[idx] = { argName, source };
    } else {
      list.push({ argName, source });
    }
    onChange({
      ...draft,
      transformBindings: list,
    });
  };

  const handleAddCustomArg = () => {
    const current = draft.transformBindings || [];
    const newArgName = `arg${current.length + 1}`;
    const defaultLiteral: FrontendFieldSource = { kind: "literal", value: "" };
    onChange({
      ...draft,
      transformBindings: [
        ...current,
        {
          argName: newArgName,
          source: defaultLiteral,
        },
      ],
    });
  };

  const handleRemoveArg = (argName: string) => {
    onChange({
      ...draft,
      transformBindings: (draft.transformBindings || []).filter(
        (b) => b.argName !== argName,
      ),
    });
  };

  const outputVar = draft.outputVariable || draft.name || "transformResult";
  const transformerDisplayName =
    selectedTransformerNode?.data?.label ||
    selectedTransformerNode?.data?.functionName ||
    draft.transformerName ||
    "transformer";

  const fallbackBindings: FrontendTransformBinding[] = useMemo(() => {
    return inputSchema.map((f: TransformerSchemaField) => {
      const litSource: FrontendFieldSource = { kind: "literal", value: "" };
      return {
        argName: f.name,
        source: litSource,
      };
    });
  }, [inputSchema]);

  const activeBindings =
    draft.transformBindings && draft.transformBindings.length > 0
      ? draft.transformBindings
      : fallbackBindings;

  return (
    <div className="space-y-3 pt-1 text-xs">
      {/* Top Section Header & Create Transformer Button */}
      <div className="flex items-center justify-between p-2 rounded-lg border border-purple-500/25 bg-purple-500/5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400">
          <Shuffle size={13} className="shrink-0" />
          <span>Transformer Function</span>
        </div>
        <button
          type="button"
          onClick={handleCreateTransformerNode}
          className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer select-none"
          title="Add a new Transformer node to canvas and configure it"
        >
          <Plus size={10} />
          <span>New Transformer Node</span>
        </button>
      </div>

      {/* Transformer Node Selector */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Shuffle size={10} />
            Select Transformer Node
          </Label>
          {selectedTransformerNode && (
            <button
              type="button"
              onClick={handleOpenTransformerConfig}
              className="flex items-center gap-1 text-[9px] text-purple-400 hover:text-purple-300 hover:underline cursor-pointer"
              title="Open TransformerNode configuration"
            >
              <ExternalLink size={9} />
              <span>Configure Node</span>
            </button>
          )}
        </div>

        <Select
          value={selectedTransformerNode?.id || ""}
          onValueChange={handleSelectTransformer}
        >
          <SelectTrigger className="h-7 text-xs bg-background/80 border-border font-mono w-full">
            <SelectValue placeholder="Choose a transformer node..." />
          </SelectTrigger>
          <SelectContent>
            {canvasTransformers.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground text-center">
                No Transformer nodes on canvas. Click &quot;New Transformer Node&quot; to create one.
              </div>
            ) : (
              canvasTransformers.map((t) => {
                const name =
                  t.data?.label || t.data?.functionName || "Transformer";
                const scope = t.data?.scope || "global";
                const inCount = t.data?.inputSchema?.length || 0;
                const outCount = t.data?.returnSchema?.length || 0;
                return (
                  <SelectItem key={t.id} value={t.id} className="text-xs font-mono">
                    <span className="font-semibold text-purple-300">{name}</span>
                    <span className="text-[8px] ml-1.5 px-1 py-0.2 rounded font-sans uppercase text-muted-foreground/80 bg-muted/60">
                      {scope}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 ml-1 font-sans">
                      ({inCount} in → {outCount} out)
                    </span>
                  </SelectItem>
                );
              })
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Selected Transformer Info Card */}
      {selectedTransformerNode && (
        <div className="flex flex-col gap-1.5 p-2 rounded bg-background/60 border border-purple-500/20 text-xs">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-purple-300 font-semibold text-xs">
                {transformerDisplayName}
              </span>
              <span
                className={`text-[8px] font-mono px-1 py-0.2 rounded font-medium ${
                  selectedTransformerNode.data?.scope === "global"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                }`}
              >
                {(selectedTransformerNode.data?.scope || "GLOBAL").toUpperCase()}
              </span>
            </div>
            <span className="text-[9px] font-mono text-muted-foreground/70">
              {draft.functionRef?.importPath || `@workspace/transformers`}
            </span>
          </div>

          {selectedTransformerNode.data?.description && (
            <p className="text-[10px] text-muted-foreground italic">
              {selectedTransformerNode.data.description}
            </p>
          )}

          {returnSchema.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5 flex-wrap">
              <span className="text-[9px] text-muted-foreground/70">Returns:</span>
              {returnSchema.map((f: TransformerSchemaField) => (
                <span
                  key={f.name}
                  className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20"
                >
                  {f.name}: {f.type || "any"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Output Variable Configuration */}
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">
          Output Variable Name
        </Label>
        <Input
          value={outputVar}
          onChange={(e) =>
            onChange({
              ...draft,
              outputVariable: e.target.value,
              name: e.target.value,
            })
          }
          placeholder="e.g. transformedData, formatResult"
          className="h-7 text-xs font-mono bg-background"
        />
        <div className="text-[10px] font-mono text-muted-foreground/70 pt-0.5 truncate">
          const {outputVar} = {transformerDisplayName}(
          {(draft.transformBindings || []).map((b) => b.argName).join(", ")}
          )
        </div>
      </div>

      {/* Argument Bindings Section */}
      <div className="space-y-2 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-medium text-muted-foreground">
            Input Arguments
          </Label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAutoMapArguments}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border border-purple-500/30 transition-colors cursor-pointer select-none"
              title="Automatically map arguments to matching state, inputs, or prior responses"
            >
              <Sparkles size={9} />
              <span>Auto-map</span>
            </button>
            <button
              type="button"
              onClick={handleAddCustomArg}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
              title="Add an argument binding"
            >
              <Plus size={9} />
              <span>Add Arg</span>
            </button>
          </div>
        </div>

        {/* Bindings list */}
        {activeBindings.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/70 p-2 text-center rounded border border-dashed border-border/60">
            No arguments configured. Click &quot;Add Arg&quot; to provide inputs to this transformer.
          </div>
        ) : (
          <div className="space-y-2">
            {activeBindings.map((binding) => {
              const schemaField = inputSchema.find(
                (f: TransformerSchemaField) => f.name === binding.argName,
              );
              const src = binding.source;

              return (
                <div
                  key={binding.argName}
                  className="p-2 rounded border border-border/60 bg-muted/20 space-y-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="font-semibold text-purple-300">
                        {binding.argName}
                      </span>
                      {schemaField && (
                        <span className="text-[9px] text-muted-foreground/70 font-sans">
                          :{schemaField.type || "any"}
                          {schemaField.required && (
                            <span className="text-destructive ml-0.5">*</span>
                          )}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveArg(binding.argName)}
                      className="text-muted-foreground/40 hover:text-destructive p-0.5 rounded transition-colors"
                      title="Remove argument"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* Value source selector & input */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <Select
                      value={src.kind}
                      onValueChange={(val: string) => {
                        let nextSource: FrontendFieldSource;
                        if (val === "literal") {
                          nextSource = { kind: "literal", value: "" };
                        } else if (val === "prev_response") {
                          nextSource = {
                            kind: "prev_response",
                            stepId: priorSteps[0]?.id || "",
                            fieldPath: "",
                          };
                        } else if (val === "state_var") {
                          nextSource = { kind: "state_var", stateKey: "" };
                        } else if (val === "route_param") {
                          nextSource = {
                            kind: "route_param",
                            paramName: routeParamSuggestions[0]?.value || "",
                          };
                        } else if (val === "query_param") {
                          nextSource = {
                            kind: "query_param",
                            paramName: queryParamSuggestions[0]?.value || "",
                          };
                        } else if (val === "session_storage") {
                          nextSource = { kind: "session_storage", key: "" };
                        } else if (val === "local_storage") {
                          nextSource = { kind: "local_storage", key: "" };
                        } else if (val === "cookie") {
                          nextSource = { kind: "cookie", cookieName: "" };
                        } else if (val === "realtime_payload") {
                          nextSource = {
                            kind: "realtime_payload",
                            fieldPath: incomingPaths && incomingPaths.length > 0 ? incomingPaths[0]?.path || "" : "",
                          };
                        } else {
                          nextSource = { kind: "user_input", fieldName: "" };
                        }
                        handleBindingChange(binding.argName, nextSource);
                      }}
                    >
                      <SelectTrigger className="h-6 text-[11px] bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realtime_payload" className="text-violet-600 dark:text-violet-400 font-semibold">
                          Incoming Stream Data
                        </SelectItem>
                        <SelectItem value="literal">Literal Value</SelectItem>
                        <SelectItem value="prev_response">Prior Step Result</SelectItem>
                        <SelectItem value="state_var">State Variable</SelectItem>
                        <SelectItem value="user_input">User Form Input</SelectItem>
                        <SelectItem value="route_param">Route Param</SelectItem>
                        <SelectItem value="query_param">Query Param</SelectItem>
                        <SelectItem value="session_storage">SessionStorage</SelectItem>
                        <SelectItem value="local_storage">LocalStorage</SelectItem>
                        <SelectItem value="cookie">Cookie</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Source specific value input */}
                    {src.kind === "realtime_payload" && (
                      <ActionFlowCombobox
                        value={src.fieldPath || ""}
                        onChange={(val) =>
                          handleBindingChange(binding.argName, {
                            kind: "realtime_payload",
                            fieldPath: val,
                          })
                        }
                        placeholder="Select or type payload field..."
                        headerLabel="Incoming Stream Payload Fields"
                        options={[
                          { value: "", label: "(Full Payload: incomingData)", type: "object" },
                          ...incomingFieldOptions,
                        ]}
                      />
                    )}

                    {src.kind === "literal" && (
                      <Input
                        value={src.value || ""}
                        onChange={(e) =>
                          handleBindingChange(binding.argName, {
                            kind: "literal",
                            value: e.target.value,
                          })
                        }
                        placeholder="literal value..."
                        className="h-6 text-[11px] font-mono bg-background"
                      />
                    )}

                    {src.kind === "prev_response" && (() => {
                      const selStep = priorSteps.find((ps) => ps.id === src.stepId);
                      return (
                        <div className="flex gap-1 w-full items-center">
                          <Select
                            value={src.stepId || ""}
                            onValueChange={(sid) =>
                              handleBindingChange(binding.argName, {
                                ...src,
                                stepId: sid,
                              })
                            }
                          >
                            <SelectTrigger className="h-6 text-[10px] bg-background w-1/2">
                              <SelectValue placeholder="Step..." />
                            </SelectTrigger>
                            <SelectContent>
                              {priorSteps.map((ps, pi) => (
                                <SelectItem key={ps.id} value={ps.id} className="text-xs">
                                  #{pi + 1} {ps.name || ps.type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="w-1/2">
                            <ResponseFieldPicker
                              value={src.fieldPath || ""}
                              onChange={(val) =>
                                handleBindingChange(binding.argName, {
                                  ...src,
                                  fieldPath: val,
                                })
                              }
                              step={selStep}
                              allNodes={allNodes}
                              placeholder="field.path"
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {src.kind === "state_var" && (
                      <ActionFlowCombobox
                        value={src.stateKey || ""}
                        onChange={(val) => {
                          const matched = allStateVarOptions.find(
                            (o) => o.value === val,
                          );
                          handleBindingChange(binding.argName, {
                            kind: "state_var",
                            stateKey: val,
                            storeNodeId: matched?.storeId,
                            storeName: matched?.storeName,
                          });
                        }}
                        placeholder="State variable..."
                        headerLabel="State Variables"
                        options={allStateVarOptions}
                      />
                    )}

                    {src.kind === "user_input" && (
                      <Input
                        value={src.fieldName || ""}
                        onChange={(e) =>
                          handleBindingChange(binding.argName, {
                            kind: "user_input",
                            fieldName: e.target.value,
                          })
                        }
                        placeholder="form field name..."
                        className="h-6 text-[11px] font-mono bg-background"
                      />
                    )}

                    {src.kind === "route_param" && (
                      <Select
                        value={src.paramName || ""}
                        onValueChange={(val) =>
                          handleBindingChange(binding.argName, {
                            kind: "route_param",
                            paramName: val,
                          })
                        }
                      >
                        <SelectTrigger className="h-6 text-[11px] bg-background">
                          <SelectValue placeholder="Select param..." />
                        </SelectTrigger>
                        <SelectContent>
                          {routeParamSuggestions.map((p) => (
                            <SelectItem key={p.value} value={p.value} className="text-xs">
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {src.kind === "query_param" && (
                      <Select
                        value={src.paramName || ""}
                        onValueChange={(val) =>
                          handleBindingChange(binding.argName, {
                            kind: "query_param",
                            paramName: val,
                          })
                        }
                      >
                        <SelectTrigger className="h-6 text-[11px] bg-background">
                          <SelectValue placeholder="Select query param..." />
                        </SelectTrigger>
                        <SelectContent>
                          {queryParamSuggestions.map((q) => (
                            <SelectItem key={q.value} value={q.value} className="text-xs">
                              {q.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {src.kind === "session_storage" && (
                      <Input
                        value={src.key || ""}
                        onChange={(e) =>
                          handleBindingChange(binding.argName, {
                            kind: "session_storage",
                            key: e.target.value,
                          })
                        }
                        placeholder="storage key..."
                        className="h-6 text-[11px] font-mono bg-background"
                      />
                    )}

                    {src.kind === "local_storage" && (
                      <Input
                        value={src.key || ""}
                        onChange={(e) =>
                          handleBindingChange(binding.argName, {
                            kind: "local_storage",
                            key: e.target.value,
                          })
                        }
                        placeholder="storage key..."
                        className="h-6 text-[11px] font-mono bg-background"
                      />
                    )}

                    {src.kind === "cookie" && (
                      <Input
                        value={src.cookieName || ""}
                        onChange={(e) =>
                          handleBindingChange(binding.argName, {
                            kind: "cookie",
                            cookieName: e.target.value,
                          })
                        }
                        placeholder="cookie name..."
                        className="h-6 text-[11px] font-mono bg-background"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
