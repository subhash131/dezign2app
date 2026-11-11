import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type {
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
  EndNode,
  LangGraphLLMNode,
  LangGraphLLMRefNode,
  ToolNode,
  LangGraphToolRefNode,
  MiddlewareNode,
  LangGraphMiddlewareRefNode,
  MemoryNode,
  LangGraphMemoryRefNode,
  CanvasNode,
  LangGraphAgentRefNode,
  OutputNode,
  StepNode,
  LangGraphStateReducerRefNode,
  TransformerCanvasNode,
  TransformerRefCanvasNode,
  LangGraphTypesNode,
  LangGraphTypesRefNode,
  LangGraphCanvasNodeAddType,
  LangGraphStateChannel,
} from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_STEP,
  LANGGRAPH_CANVAS_NODE_END,
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_LLM_REF,
  LANGGRAPH_CANVAS_NODE_TOOL,
  LANGGRAPH_CANVAS_NODE_TOOL_REF,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_AGENT,
  LANGGRAPH_CANVAS_NODE_AGENT_REF,
  LANGGRAPH_CANVAS_NODE_NODE_REF,
  LANGGRAPH_CANVAS_NODE_MEMORY,
  LANGGRAPH_CANVAS_NODE_MEMORY_REF,
  LANGGRAPH_CANVAS_NODE_OUTPUT,
  LANGGRAPH_CANVAS_NODE_STATE_REDUCER_REF,
  LANGGRAPH_CANVAS_NODE_TRANSFORMER,
  LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF,
  LANGGRAPH_CANVAS_NODE_TYPES,
  LANGGRAPH_CANVAS_NODE_TYPES_REF,
  DEFAULT_MIDDLEWARE_TYPE,
  LLM_PROVIDERS,
  LLM_PROVIDER_PRESETS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_TEMPERATURE,
  STEP_TYPE_ROUTER,
} from "../constants";
import { generateDefaultTransformerCode } from "@/lib/utils/transformerCodeGenerator";
import { toVarName } from "@/lib/compiler/utils";

interface UseNodeFactoryProps {
  setNodes: React.Dispatch<React.SetStateAction<LangGraphCanvasNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<LangGraphCanvasEdge[]>>;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSideTab: (tab: "inspector" | "inputs" | "state" | "memory") => void;
  stateChannels: LangGraphStateChannel[];
}

function getNodeDimensions(type: LangGraphCanvasNodeAddType): {
  width: number;
  height: number;
} {
  switch (type) {
    case LANGGRAPH_CANVAS_NODE_END:
      return { width: 140, height: 45 };
    case LANGGRAPH_CANVAS_NODE_LLM:
    case LANGGRAPH_CANVAS_NODE_LLM_REF:
      return { width: 320, height: 180 };
    case LANGGRAPH_CANVAS_NODE_TOOL:
    case LANGGRAPH_CANVAS_NODE_TOOL_REF:
    case LANGGRAPH_CANVAS_NODE_MIDDLEWARE:
    case LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF:
    case LANGGRAPH_CANVAS_NODE_MEMORY:
    case LANGGRAPH_CANVAS_NODE_MEMORY_REF:
    case LANGGRAPH_CANVAS_NODE_AGENT_REF:
    case LANGGRAPH_CANVAS_NODE_NODE_REF:
    case LANGGRAPH_CANVAS_NODE_OUTPUT:
    case LANGGRAPH_CANVAS_NODE_TRANSFORMER:
    case LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF:
    case LANGGRAPH_CANVAS_NODE_TYPES:
    case LANGGRAPH_CANVAS_NODE_TYPES_REF:
      return { width: 280, height: 140 };
    case LANGGRAPH_CANVAS_NODE_STATE_REDUCER_REF:
      return { width: 260, height: 160 };
    case STEP_TYPE_ROUTER:
      return { width: 260, height: 120 };
    case LANGGRAPH_CANVAS_NODE_NODE:
    case LANGGRAPH_CANVAS_NODE_AGENT:
    default:
      return { width: 360, height: 160 };
  }
}

export function useNodeFactory({
  setNodes,
  setEdges,
  setSelectedNodeId,
  setActiveSideTab,
  stateChannels,
}: UseNodeFactoryProps) {
  const { screenToFlowPosition } = useReactFlow();

  const getCenterPosition = useCallback(
    (type: LangGraphCanvasNodeAddType, currentNodes: LangGraphCanvasNode[]) => {
      const { width, height } = getNodeDimensions(type);

      let screenX = typeof window !== "undefined" ? window.innerWidth / 2 : 400;
      let screenY = typeof window !== "undefined" ? window.innerHeight / 2 : 250;

      if (typeof document !== "undefined") {
        const reactFlowEl = document.querySelector(".react-flow") as HTMLElement | null;
        if (reactFlowEl) {
          const rect = reactFlowEl.getBoundingClientRect();
          screenX = rect.left + rect.width / 2;
          screenY = rect.top + rect.height / 2;
        }
      }

      let flowX = 400;
      let flowY = 250;

      try {
        if (screenToFlowPosition) {
          const pos = screenToFlowPosition({ x: screenX, y: screenY });
          if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) {
            flowX = pos.x;
            flowY = pos.y;
          }
        }
      } catch (err) {
        console.warn("Failed to get flow position for center of view:", err);
      }

      let x = Math.round(flowX - width / 2);
      let y = Math.round(flowY - height / 2);
      const offset = 24;

      // Avoid exact overlapping with existing nodes
      while (
        currentNodes.some(
          (n) => Math.abs(n.position.x - x) < 15 && Math.abs(n.position.y - y) < 15,
        )
      ) {
        x += offset;
        y += offset;
      }

      return { x, y };
    },
    [screenToFlowPosition],
  );

  const handleAddStep = useCallback(
    (type: LangGraphCanvasNodeAddType, label: string) => {
      if (type === LANGGRAPH_CANVAS_NODE_END) {
        const endId = `end_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newEndNode: EndNode = {
            id: endId,
            type: LANGGRAPH_CANVAS_NODE_END,
            position,
            data: { label: label || "END State" },
          };
          return [...nds, newEndNode];
        });
        setSelectedNodeId(endId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_LLM) {
        const llmId = `llm_${Date.now().toString(36).slice(-4)}`;
        const defaultPreset =
          LLM_PROVIDER_PRESETS[DEFAULT_LLM_PROVIDER] ??
          LLM_PROVIDER_PRESETS[LLM_PROVIDERS.CUSTOM];

        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newLLMNode: LangGraphLLMNode = {
            id: llmId,
            type: LANGGRAPH_CANVAS_NODE_LLM,
            position,
            data: {
              label: label || "LLM",
              llmId,
              provider: DEFAULT_LLM_PROVIDER,
              baseUrl: defaultPreset?.defaultUrl ?? DEFAULT_LLM_BASE_URL,
              model: defaultPreset?.defaultModel ?? DEFAULT_LLM_MODEL,
              apiKeyHeader: "",
              temperature: DEFAULT_LLM_TEMPERATURE,
              onDeleteLLM: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== llmId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== llmId && edge.target !== llmId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === llmId ? null : curr));
              },
            },
          };
          return [...nds, newLLMNode];
        });
        setSelectedNodeId(llmId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_LLM_REF) {
        const refId = `llm_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "LLM";

        setNodes((nds) => {
          const master = nds.find((n) => n.type === LANGGRAPH_CANVAS_NODE_LLM);
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel = (master.data as { label?: string })?.label || "LLM";
          }
          const position = getCenterPosition(type, nds);

          const newLLMRefNode: LangGraphLLMRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_LLM_REF,
            position,
            data: {
              label: label || `${preselectedMasterLabel} (Ref)`,
              refId,
              llmRef: preselectedMasterId,
              onDeleteLLMRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newLLMRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_TOOL) {
        const toolId = `tool_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newToolNode: ToolNode = {
            id: toolId,
            type: LANGGRAPH_CANVAS_NODE_TOOL,
            position,
            data: {
              label: label || "Tool Node",
              toolId,
              name: "my_tool",
              description: "Description of the tool",
              source: "inline",
              executionMode: "sandboxed_vm",
              returnType: "string",
              onDeleteTool: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== toolId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== toolId && edge.target !== toolId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === toolId ? null : curr));
              },
            },
          };
          return [...nds, newToolNode];
        });
        setSelectedNodeId(toolId);
        setActiveSideTab("inspector");
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_TOOL_REF) {
        const refId = `tool_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "Tool";

        setNodes((nds) => {
          const master = nds.find((n) => n.type === LANGGRAPH_CANVAS_NODE_TOOL);
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel =
              (master.data as { name?: string; label?: string })?.name ||
              (master.data as { label?: string })?.label ||
              "Tool";
          }
          const position = getCenterPosition(type, nds);

          const newToolRefNode: LangGraphToolRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_TOOL_REF,
            position,
            data: {
              label: label || `${preselectedMasterLabel} (Ref)`,
              refId,
              toolRef: preselectedMasterId,
              onDeleteToolRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newToolRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_MIDDLEWARE) {
        const mwId = `mw_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newMiddlewareNode: MiddlewareNode = {
            id: mwId,
            type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
            position,
            data: {
              label: label || "Middleware",
              middlewareId: mwId,
              name: "middleware",
              type: DEFAULT_MIDDLEWARE_TYPE,
              humanInTheLoopConfig: {
                interruptOn: { writeFile: true },
                approvalPrompt: "Requires approval before writing files...",
              },
              onDeleteMiddleware: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== mwId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== mwId && edge.target !== mwId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === mwId ? null : curr));
              },
            },
          };
          return [...nds, newMiddlewareNode];
        });
        setSelectedNodeId(mwId);
        setActiveSideTab("inspector");
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF) {
        const refId = `mw_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "Middleware";

        setNodes((nds) => {
          const master = nds.find(
            (n) => n.type === LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
          );
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel =
              (master.data as { name?: string; label?: string })?.name ||
              (master.data as { label?: string })?.label ||
              "Middleware";
          }
          const position = getCenterPosition(type, nds);

          const newMiddlewareRefNode: LangGraphMiddlewareRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
            position,
            data: {
              label: label || `${preselectedMasterLabel} (Ref)`,
              refId,
              middlewareRef: preselectedMasterId,
              onDeleteMiddlewareRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newMiddlewareRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_MEMORY) {
        const memId = `mem_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newMemoryNode: MemoryNode = {
            id: memId,
            type: LANGGRAPH_CANVAS_NODE_MEMORY,
            position,
            data: {
              label: label || "Memory Saver",
              memoryId: memId,
              name: "memory_saver",
              checkpointer: "memory",
              threadIdKey: "thread_id",
              threadScope: "session",
              autoSummarize: true,
              saveMessages: true,
              onDeleteMemory: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== memId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== memId && edge.target !== memId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === memId ? null : curr));
              },
            },
          };
          return [...nds, newMemoryNode];
        });
        setSelectedNodeId(memId);
        setActiveSideTab("inspector");
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_MEMORY_REF) {
        const refId = `mem_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "Memory";

        setNodes((nds) => {
          const master = nds.find((n) => n.type === LANGGRAPH_CANVAS_NODE_MEMORY);
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel =
              (master.data as { name?: string; label?: string })?.name ||
              (master.data as { label?: string })?.label ||
              "Memory";
          }
          const position = getCenterPosition(type, nds);

          const newMemoryRefNode: LangGraphMemoryRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_MEMORY_REF,
            position,
            data: {
              label: label || `${preselectedMasterLabel} (Ref)`,
              refId,
              memoryRef: preselectedMasterId,
              onDeleteMemoryRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newMemoryRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      if (
        type === LANGGRAPH_CANVAS_NODE_NODE ||
        type === LANGGRAPH_CANVAS_NODE_AGENT
      ) {
        const nodeId = `node_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newNode: CanvasNode = {
            id: nodeId,
            type: LANGGRAPH_CANVAS_NODE_NODE,
            position,
            data: {
              label: label || "Node",
              agentId: nodeId,
              name: label || "Node",
              systemPrompt: "",
              pipelineSteps: [],
              nodeSteps: [],
              llmConfig: {
                enabled: false,
                provider: DEFAULT_LLM_PROVIDER,
                model: DEFAULT_LLM_MODEL,
                temperature: DEFAULT_LLM_TEMPERATURE,
              },
              middlewareConfig: {
                enabled: false,
              },
              modelConfig: undefined,
              tools: [],
              middleware: [],
              onDeleteAgent: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== nodeId && edge.target !== nodeId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === nodeId ? null : curr));
              },
            },
          };
          return [...nds, newNode];
        });
        setSelectedNodeId(nodeId);
        setActiveSideTab("inspector");
        return;
      }

      if (
        type === LANGGRAPH_CANVAS_NODE_AGENT_REF ||
        type === LANGGRAPH_CANVAS_NODE_NODE_REF
      ) {
        const refId = `agent_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "Agent";

        setNodes((nds) => {
          const master = nds.find(
            (n) =>
              n.type === LANGGRAPH_CANVAS_NODE_NODE ||
              n.type === LANGGRAPH_CANVAS_NODE_AGENT ||
              n.type === LANGGRAPH_CANVAS_NODE_STEP,
          );
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel =
              (master.data as { name?: string; label?: string })?.name ||
              (master.data as { label?: string })?.label ||
              "Agent";
          }
          const position = getCenterPosition(type, nds);

          const newAgentRefNode: LangGraphAgentRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_AGENT_REF,
            position,
            data: {
              label: label || `↩ ${preselectedMasterLabel} (Ref)`,
              refId,
              agentRef: preselectedMasterId,
              nodeRef: preselectedMasterId,
              onDeleteAgentRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newAgentRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_OUTPUT) {
        const outId = `output_${Date.now().toString(36).slice(-4)}`;
        const permanentChannelId = `channel_${crypto.randomUUID()}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newOutputNode: OutputNode = {
            id: outId,
            type: LANGGRAPH_CANVAS_NODE_OUTPUT,
            position,
            data: {
              id: permanentChannelId,
              label: label || "Output Channel",
              name: label || "Output Channel",
              type: "sse",
              targetStateChannel: "messages",
              topicOrEventName: "messages",
              onDeleteOutput: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== outId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== outId && edge.target !== outId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === outId ? null : curr));
              },
            },
          };
          return [...nds, newOutputNode];
        });
        setSelectedNodeId(outId);
        setActiveSideTab("inspector");
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_STATE_REDUCER_REF) {
        const refId = `state_ref_${Date.now().toString(36).slice(-4)}`;
        const firstChannel = stateChannels[0]?.key || "messages";

        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newStateReducerRefNode: LangGraphStateReducerRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_STATE_REDUCER_REF,
            position,
            data: {
              label: label || `Mutate: ${firstChannel}`,
              refId,
              targetChannelKey: firstChannel,
              mode: "append",
              onDeleteStateReducerRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };
          return [...nds, newStateReducerRefNode];
        });
        setSelectedNodeId(refId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_TRANSFORMER) {
        const transformerId = `transformer_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const existingNames = new Set(
            nds
              .filter((n) => n.type === LANGGRAPH_CANVAS_NODE_TRANSFORMER)
              .map((n) => ((n.data as any)?.functionName || (n.data as any)?.label || "").toLowerCase()),
          );
          let fnName = label ? toVarName(label) : "transformData";
          if (existingNames.has(fnName.toLowerCase())) {
            let counter = 2;
            while (existingNames.has(`${fnName.toLowerCase()}${counter}`)) {
              counter++;
            }
            fnName = `${fnName}${counter}`;
          }
          const newTransformerNode: TransformerCanvasNode = {
            id: transformerId,
            type: LANGGRAPH_CANVAS_NODE_TRANSFORMER,
            position,
            data: {
              label: fnName,
              functionName: fnName,
              scope: "global",
              isGlobal: true,
              code: generateDefaultTransformerCode({ functionName: fnName }),
              inputSchema: [],
              returnSchema: [],
              onDeleteTransformer: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== transformerId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== transformerId && edge.target !== transformerId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === transformerId ? null : curr));
              },
            },
          };
          return [...nds, newTransformerNode];
        });
        setSelectedNodeId(transformerId);
        setActiveSideTab("inspector");
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF) {
        const refId = `transformer_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "Transformer";

        setNodes((nds) => {
          const master = nds.find(
            (n): n is TransformerCanvasNode =>
              n.type === LANGGRAPH_CANVAS_NODE_TRANSFORMER,
          );
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel =
              master.data.label ||
              master.data.functionName ||
              "Transformer";
          }
          const position = getCenterPosition(type, nds);

          const newTransformerRefNode: TransformerRefCanvasNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF,
            position,
            data: {
              label: label || `↩ ${preselectedMasterLabel} (Ref)`,
              transformerRef: preselectedMasterId,
              refId,
              onDeleteTransformerRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newTransformerRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_TYPES) {
        const typesId = `types_${Date.now().toString(36).slice(-4)}`;
        setNodes((nds) => {
          const position = getCenterPosition(type, nds);
          const newTypesNode: LangGraphTypesNode = {
            id: typesId,
            type: LANGGRAPH_CANVAS_NODE_TYPES,
            position,
            data: {
              label: label || "Custom Types",
              typesId,
              types: [
                {
                  id: `type_${Date.now().toString(36).slice(-4)}`,
                  name: "MyType",
                  kind: "interface",
                  description: "Custom schema definition",
                  fields: [
                    {
                      id: "field_1",
                      name: "id",
                      type: "string",
                      required: true,
                    },
                    {
                      id: "field_2",
                      name: "name",
                      type: "string",
                      required: true,
                    },
                  ],
                },
              ],
              rawTypeScript: "",
              definitionMode: "visual",
              onDeleteTypes: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== typesId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== typesId && edge.target !== typesId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === typesId ? null : curr));
              },
            },
          };
          return [...nds, newTypesNode];
        });
        setSelectedNodeId(typesId);
        setActiveSideTab("inspector");
        return;
      }

      if (type === LANGGRAPH_CANVAS_NODE_TYPES_REF) {
        const refId = `types_ref_${Date.now().toString(36).slice(-4)}`;
        let preselectedMasterId: string | undefined = undefined;
        let preselectedMasterLabel = "Custom Types";

        setNodes((nds) => {
          const master = nds.find(
            (n): n is LangGraphTypesNode =>
              n.type === LANGGRAPH_CANVAS_NODE_TYPES,
          );
          if (master) {
            preselectedMasterId = master.id;
            preselectedMasterLabel = master.data.label || "Custom Types";
          }
          const position = getCenterPosition(type, nds);

          const newTypesRefNode: LangGraphTypesRefNode = {
            id: refId,
            type: LANGGRAPH_CANVAS_NODE_TYPES_REF,
            position,
            data: {
              label: label || `↩ ${preselectedMasterLabel} (Ref)`,
              refId,
              typesRef: preselectedMasterId,
              onDeleteTypesRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== refId));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== refId && edge.target !== refId,
                  ),
                );
                setSelectedNodeId((curr) => (curr === refId ? null : curr));
              },
            },
          };

          return [...nds, newTypesRefNode];
        });

        setSelectedNodeId(refId);
        return;
      }

      const stepId =
        type === STEP_TYPE_ROUTER
          ? `router_${Date.now().toString(36).slice(-4)}`
          : `step_${Date.now().toString(36).slice(-4)}`;

      setNodes((nds) => {
        const position = getCenterPosition(type, nds);
        const newNode: StepNode = {
          id: stepId,
          type: LANGGRAPH_CANVAS_NODE_STEP,
          position,
          data: {
            label:
              label ||
              (type === STEP_TYPE_ROUTER ? "Conditional Router" : "Node"),
            stepId,
            stepType: type,
            ...(type === STEP_TYPE_ROUTER
              ? {
                  routerConfig: {
                    branches: [],
                  },
                }
              : {
                  llmConfig: {
                    enabled: false,
                    provider: DEFAULT_LLM_PROVIDER,
                    model: DEFAULT_LLM_MODEL,
                    temperature: DEFAULT_LLM_TEMPERATURE,
                  },
                  middlewareConfig: {
                    enabled: false,
                  },
                  modelConfig: undefined,
                }),
            stateUpdates: [],
            availableStateChannels: stateChannels,
            onDeleteStep: () => {
              setNodes((nodes) => nodes.filter((node) => node.id !== stepId));
              setEdges((edges) =>
                edges.filter(
                  (edge) => edge.source !== stepId && edge.target !== stepId,
                ),
              );
              setSelectedNodeId((curr) => (curr === stepId ? null : curr));
            },
          },
        };
        return [...nds, newNode];
      });

      setSelectedNodeId(stepId);
      setActiveSideTab("inspector");
    },
    [
      setNodes,
      setEdges,
      setSelectedNodeId,
      setActiveSideTab,
      stateChannels,
      getCenterPosition,
    ],
  );

  return { handleAddStep };
}
