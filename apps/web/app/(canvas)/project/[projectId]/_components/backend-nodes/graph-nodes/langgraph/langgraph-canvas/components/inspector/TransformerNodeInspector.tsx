"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Shuffle,
  Trash,
  Settings,
  Package,
  FlaskConical,
  Code2,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import type {
  TransformerCanvasNodeData,
  TransformerCanvasNode,
  TransformerRefCanvasNode,
  LangGraphCanvasNode,
  NodeDependencyItem,
  TransformerPackageImport,
  TransformerTestCase,
} from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_TRANSFORMER,
} from "../../constants";
import type { Parameter } from "@/types/canvas";
import { toVarName, toPascalCase } from "@/lib/compiler/utils";
import { inferReturnSchemaFromCode } from "@/lib/utils/inferReturnSchema";
import {
  generateDefaultTransformerCode,
  isLegacyOrEmptyTransformerCode,
  isDefaultStarterTransformerCode,
} from "@/lib/utils/transformerCodeGenerator";
import { LocalInput } from "../../../../common";
import { InputSchemaSection } from "../../../../../../config-sidebar/transformer-config/InputSchemaSection";
import { LogicSection } from "../../../../../../config-sidebar/transformer-config/LogicSection";
import { ReturnSchemaSection } from "../../../../../../config-sidebar/transformer-config/ReturnSchemaSection";
import { TransformerPackageImportsSection } from "../../../../../../config-sidebar/transformer-config/TransformerPackageImportsSection";
import { TransformerTestingSection } from "../../../../../../config-sidebar/transformer-config/TransformerTestingSection";
import { NodePackageManager } from "../../../../../../config-sidebar/NodePackageManager";
import type { RequestBodyMode } from "../../../../../../config-sidebar/RequestBodyEditor";

export interface TransformerNodeInspectorProps {
  selectedTransformerData?: TransformerCanvasNodeData | null;
  selectedTransformerRefData?: TransformerCanvasNodeData | null;
  onDeleteTransformer: () => void;
  onUpdateTransformer: (changes: Partial<TransformerCanvasNodeData>) => void;
  nodes?: LangGraphCanvasNode[];
  onSelectNode?: (nodeId: string) => void;
  initialTab?: "logic" | "packages" | "testing";
}

const DEFAULT_TRANSFORMER_DATA: TransformerCanvasNodeData = {
  label: "Transformer",
  functionName: "transformData",
  scope: "global",
  isGlobal: true,
  code: generateDefaultTransformerCode({ functionName: "transformData" }),
  inputSchema: [],
  returnSchema: [],
};

export function TransformerNodeInspector({
  selectedTransformerData,
  selectedTransformerRefData,
  onDeleteTransformer,
  onUpdateTransformer,
  nodes = [],
  onSelectNode,
  initialTab = "logic",
}: TransformerNodeInspectorProps) {
  const isRef = Boolean(selectedTransformerRefData);
  const data: TransformerCanvasNodeData =
    selectedTransformerData || selectedTransformerRefData || DEFAULT_TRANSFORMER_DATA;

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Master transformers available on the canvas
  const availableMasterTransformers = useMemo(() => {
    return nodes.filter(
      (n): n is TransformerCanvasNode =>
        n.type === LANGGRAPH_CANVAS_NODE_TRANSFORMER,
    );
  }, [nodes]);

  // If this is a ref node, find the referenced master transformer
  const referencedMaster = useMemo(() => {
    if (!isRef || !data.transformerRef) return undefined;
    return availableMasterTransformers.find(
      (m) =>
        m.id === data.transformerRef ||
        m.data.functionName === data.transformerRef ||
        m.data.label === data.transformerRef,
    );
  }, [isRef, data.transformerRef, availableMasterTransformers]);

  // Input & Return schemas normalized
  const inputSchema: Parameter[] = useMemo(() => {
    const raw = data.inputSchema || [];
    return raw.map((f, idx) => ({
      id: `in_${idx}_${f.name || "field"}`,
      name: f.name || "",
      type: f.type || "string",
      required: f.required ?? true,
      description: f.description,
    }));
  }, [data.inputSchema]);

  const returnSchema: Parameter[] = useMemo(() => {
    const raw = data.returnSchema || [];
    return raw.map((f, idx) => ({
      id: f.id || `out_${idx}_${f.name || "field"}`,
      name: f.name || "",
      type: f.type || "string",
      required: f.required ?? true,
      description: f.description,
    }));
  }, [data.returnSchema]);

  const functionName = data.functionName || data.label || "transformData";
  const scope = data.scope || "global";
  const logicMode = data.logicMode || "code";
  const isAsync = Boolean(data.isAsync);

  const Pascal = toPascalCase(toVarName(functionName));
  const inputTypeName = `${Pascal}Input`;
  const outputTypeName = `${Pascal}Output`;

  // Dynamic inferred return schema
  const inferredReturnSchema = useMemo(() => {
    return inferReturnSchemaFromCode(data.code || "", inputSchema);
  }, [data.code, inputSchema]);

  const handleInferFromCode = useCallback(() => {
    const fresh = inferReturnSchemaFromCode(data.code || "", inputSchema);
    if (fresh.length > 0) {
      onUpdateTransformer({ returnSchema: fresh });
    }
  }, [data.code, inputSchema, onUpdateTransformer]);

  // Auto-upgrade legacy flawed code or empty code to match current input schema
  useEffect(() => {
    if (!isRef && isLegacyOrEmptyTransformerCode(data.code)) {
      const nextCode = generateDefaultTransformerCode({
        functionName,
        inputSchema,
        returnSchema,
        outputTypeName,
        prompt: data.prompt,
      });
      const inferred = inferReturnSchemaFromCode(nextCode, inputSchema);
      onUpdateTransformer({
        code: nextCode,
        ...(inferred.length > 0 && (!data.returnSchema || data.returnSchema.length === 0)
          ? { returnSchema: inferred }
          : {}),
      });
    }
  }, [
    isRef,
    data.code,
    functionName,
    inputSchema,
    returnSchema,
    outputTypeName,
    data.prompt,
    data.returnSchema,
    onUpdateTransformer,
  ]);

  const customDependencies: NodeDependencyItem[] = useMemo(
    () => data.customDependencies || [],
    [data.customDependencies],
  );

  const packageImports: TransformerPackageImport[] = useMemo(
    () => data.packageImports || [],
    [data.packageImports],
  );

  const testCases: TransformerTestCase[] = useMemo(
    () => data.transformerTestCases || [],
    [data.transformerTestCases],
  );

  const inputSchemaMode: RequestBodyMode =
    data.inputSchemaMode ??
    (data.inputSchemaRawJson ? "raw_json" : "field_builder");

  const returnSchemaMode: RequestBodyMode =
    data.returnSchemaMode ??
    (data.returnSchemaRawJson ? "raw_json" : "field_builder");

  // -------------------------------------------------------------------------
  // Render: Transformer Reference Node
  // -------------------------------------------------------------------------
  if (isRef) {
    return (
      <div className="flex flex-col gap-6 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-2 border-b border-border/50 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded border border-purple-500/20 shadow-sm flex items-center gap-1">
                <Shuffle size={11} />
                TRANSFORMER REF
              </span>
              <span className="text-sm font-semibold tracking-tight text-foreground font-mono">
                {data.label || "Transformer Ref"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
              onClick={onDeleteTransformer}
              title="Delete Transformer Reference Node"
            >
              <Trash className="w-4 h-4" />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            Points to a master transformer definition on this canvas.
          </span>
        </div>

        {/* Master Selector */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            Target Transformer
          </Label>
          <Select
            value={data.transformerRef || ""}
            onValueChange={(val) => {
              const matched = availableMasterTransformers.find(
                (m) => m.id === val,
              );
              onUpdateTransformer({
                transformerRef: val,
                label: matched
                  ? `↩ ${matched.data.label || matched.data.functionName} (Ref)`
                  : "Transformer Ref",
              });
            }}
          >
            <SelectTrigger className="h-9 text-xs bg-background/60 border-border/60">
              <SelectValue placeholder="Select a master transformer..." />
            </SelectTrigger>
            <SelectContent>
              {availableMasterTransformers.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  No master transformers found on the canvas. Add a Transformer node from the sidebar first.
                </div>
              ) : (
                availableMasterTransformers.map((master) => (
                  <SelectItem key={master.id} value={master.id} className="text-xs">
                    {master.data.label || master.data.functionName || master.id}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Referenced Master Details Card */}
        {referencedMaster ? (
          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold font-mono text-foreground">
                  {referencedMaster.data.functionName || referencedMaster.data.label}
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {referencedMaster.data.scope || "global"}
              </span>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center gap-3">
              <span>
                <strong>{referencedMaster.data.inputSchema?.length ?? 0}</strong> inputs
              </span>
              <span>•</span>
              <span>
                <strong>{referencedMaster.data.returnSchema?.length ?? 0}</strong> returns
              </span>
            </div>

            {onSelectNode && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 mt-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                onClick={() => onSelectNode(referencedMaster.id)}
              >
                <span>Edit Master Transformer</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Select a master transformer above to link this reference.</span>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Master Transformer Node
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 border-b border-border/50 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded border border-purple-500/20 shadow-sm flex items-center gap-1">
              <Shuffle size={11} />
              TRANSFORMER
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground font-mono truncate max-w-[220px]">
              {functionName}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
            onClick={onDeleteTransformer}
            title="Delete Transformer Node"
          >
            <Trash className="w-4 h-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          Configure reusable data transformation parameters, TypeScript logic, and schemas.
        </span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 p-1 bg-muted/50 rounded-lg">
          <TabsTrigger
            value="logic"
            className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background"
          >
            <Settings className="w-3.5 h-3.5" />
            Config & Logic
          </TabsTrigger>
          <TabsTrigger
            value="packages"
            className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background"
          >
            <Package className="w-3.5 h-3.5 text-primary" />
            Packages
            {customDependencies.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/20 text-primary font-mono font-bold">
                {customDependencies.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="testing"
            className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background"
          >
            <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
            Test
            {testCases.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                {testCases.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: Config & Logic ────────────────────────────────────────── */}
        <TabsContent value="logic" className="space-y-6 pt-3">
          {/* Row 1: Function Name & Scope */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Function Name
              </Label>
              <LocalInput
                className="h-8 text-xs font-mono bg-background/60 border-border/60"
                value={functionName}
                debounceMs={200}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                onChange={(e) => {
                  const val = toVarName(e.target.value);
                  if (val && nodes) {
                    const isDuplicate = nodes.some(
                      (n) =>
                        n.id !== (selectedTransformerData as any)?.id &&
                        n.type === "transformer" &&
                        toVarName((n.data as any)?.functionName || (n.data as any)?.label || "").toLowerCase() ===
                          val.toLowerCase(),
                    );
                    if (isDuplicate) {
                      toast.error(`A transformer named "${val}" already exists. Transformer names must be unique.`);
                      return;
                    }
                  }
                  onUpdateTransformer({
                    label: val,
                    functionName: val,
                  });
                }}
                placeholder="e.g. cleanData"
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Scope
              </Label>
              <Select
                value={scope}
                onValueChange={(v) => {
                  if (v === "global" || v === "local") {
                    onUpdateTransformer({ scope: v, isGlobal: v === "global" });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background/60 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global" className="text-xs">
                    Global (Shared Package)
                  </SelectItem>
                  <SelectItem value="local" className="text-xs">
                    Local (Graph-specific)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              Description (optional)
            </Label>
            <LocalInput
              className="h-8 text-xs bg-background/60 border-border/60"
              value={data.description || ""}
              debounceMs={200}
              onChange={(e) => onUpdateTransformer({ description: e.target.value })}
              placeholder="e.g. Filters and transforms incoming messages"
            />
          </div>

          {/* 1. INPUT SCHEMA */}
          <InputSchemaSection
            nodeId="langgraph_tr"
            inputSchemaMode={inputSchemaMode}
            inputSchema={inputSchema}
            rawJson={data.inputSchemaRawJson || ""}
            onModeChange={(mode) => onUpdateTransformer({ inputSchemaMode: mode })}
            onSchemaChange={(fields, rawJson) => {
              const updatedFields: Parameter[] = fields.map((f, idx) => ({
                id: f.id || `in_field_${idx}`,
                name: f.name || "",
                type: f.type || "string",
                required: f.required ?? true,
                description: f.description,
              }));

              const shouldRegenerate =
                isLegacyOrEmptyTransformerCode(data.code) ||
                isDefaultStarterTransformerCode(data.code);

              if (shouldRegenerate) {
                const nextCode = generateDefaultTransformerCode({
                  functionName,
                  inputSchema: updatedFields,
                  returnSchema,
                  outputTypeName,
                  prompt: data.prompt,
                });
                const inferred = inferReturnSchemaFromCode(nextCode, updatedFields);
                onUpdateTransformer({
                  inputSchema: updatedFields,
                  inputSchemaRawJson: rawJson,
                  code: nextCode,
                  ...(inferred.length > 0 && (!data.returnSchema || data.returnSchema.length === 0)
                    ? { returnSchema: inferred }
                    : {}),
                });
              } else {
                onUpdateTransformer({
                  inputSchema: updatedFields,
                  inputSchemaRawJson: rawJson,
                });
              }
            }}
          />

          {/* 2. LOGIC SECTION */}
          <LogicSection
            logicMode={logicMode}
            prompt={data.prompt || ""}
            code={data.code || ""}
            isAsync={isAsync}
            functionName={functionName}
            inputTypeName={inputTypeName}
            outputTypeName={outputTypeName}
            inputSchema={inputSchema}
            returnSchema={returnSchema}
            packageImports={packageImports}
            onModeChange={(mode) => onUpdateTransformer({ logicMode: mode })}
            onPromptChange={(prompt) => onUpdateTransformer({ prompt })}
            onGenerateCode={() => {
              const generatedCode = generateDefaultTransformerCode({
                functionName,
                inputSchema,
                returnSchema,
                outputTypeName,
                prompt: data.prompt,
              });
              const inferred = inferReturnSchemaFromCode(generatedCode, inputSchema);
              onUpdateTransformer({
                code: generatedCode,
                logicMode: "code",
                ...(inferred.length > 0 && (!data.returnSchema || data.returnSchema.length === 0)
                  ? { returnSchema: inferred }
                  : {}),
              });
            }}
            onCodeChange={(code) => {
              const inferred = inferReturnSchemaFromCode(code, inputSchema);
              if (inferred.length > 0) {
                const existingMap = new Map(
                  (data.returnSchema || []).map((f: Parameter) => [f.name, f]),
                );
                const merged: Parameter[] = inferred.map((inf) => {
                  const prev = existingMap.get(inf.name);
                  if (
                    prev &&
                    prev.type &&
                    prev.type !== "string" &&
                    prev.type !== "object" &&
                    (inf.type === "string" || inf.type === "object")
                  ) {
                    return {
                      id: prev.id || inf.id,
                      name: inf.name,
                      type: prev.type,
                      isArray: prev.isArray ?? inf.isArray,
                      required: inf.required,
                      description: inf.description,
                    };
                  }
                  return inf;
                });
                onUpdateTransformer({ code, returnSchema: merged });
              } else {
                onUpdateTransformer({ code });
              }
            }}
            onAsyncChange={(asyncVal) => onUpdateTransformer({ isAsync: asyncVal })}
          />

          {/* 3. RETURN SCHEMA */}
          <ReturnSchemaSection
            nodeId="langgraph_tr"
            returnSchemaMode={returnSchemaMode}
            returnSchema={returnSchema}
            rawJson={data.returnSchemaRawJson || ""}
            inferredCount={inferredReturnSchema.length}
            onInferFromCode={handleInferFromCode}
            onModeChange={(mode) => onUpdateTransformer({ returnSchemaMode: mode })}
            onSchemaChange={(fields, rawJson) =>
              onUpdateTransformer({
                returnSchema: fields,
                returnSchemaRawJson: rawJson,
              })
            }
          />

          {/* 4. PACKAGE IMPORTS */}
          <TransformerPackageImportsSection
            currentNodeId="langgraph_tr"
            customDependencies={customDependencies}
            packageImports={packageImports}
            onChangePackageImports={(imports) =>
              onUpdateTransformer({ packageImports: imports })
            }
            onNavigateToPackagesTab={() => setActiveTab("packages")}
            onInsertCodeSnippet={(snippet) => {
              const currentCode = data.code || "";
              onUpdateTransformer({ code: `${snippet}\n${currentCode}` });
            }}
          />
        </TabsContent>

        {/* ─── TAB: Packages ─────────────────────────────────────────────── */}
        <TabsContent value="packages" className="space-y-4 pt-3">
          <NodePackageManager
            nodeId="langgraph_tr"
            nodeType="transformer"
            customDependencies={customDependencies}
            onUpdateDependencies={(deps) =>
              onUpdateTransformer({ customDependencies: deps })
            }
          />
        </TabsContent>

        {/* ─── TAB: Testing ──────────────────────────────────────────────── */}
        <TabsContent value="testing" className="space-y-4 pt-3">
          <TransformerTestingSection
            functionName={functionName}
            code={data.code || ""}
            isAsync={isAsync}
            inputSchema={inputSchema}
            testCases={testCases}
            packageImports={packageImports}
            onSaveTestCase={(tc) => {
              const idx = testCases.findIndex((c) => c.id === tc.id);
              const next =
                idx >= 0
                  ? testCases.map((c, i) => (i === idx ? tc : c))
                  : [...testCases, tc];
              onUpdateTransformer({ transformerTestCases: next });
            }}
            onDeleteTestCase={(id) => {
              onUpdateTransformer({
                transformerTestCases: testCases.filter((c) => c.id !== id),
              });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
