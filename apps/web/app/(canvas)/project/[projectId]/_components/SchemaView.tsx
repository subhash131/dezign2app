import React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Connection,
  useReactFlow,
} from "@xyflow/react";
import { Button } from "@workspace/ui/components/button";
import { PlusSquare, LayoutGrid } from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { nodeTypes } from "./backend-nodes/Nodes";
import { ForeignKeyEdge } from "./backend-nodes/ForeignKeyEdge";
import { HTTPConnectionEdge, MessagingEdge } from "./backend-nodes/CustomEdges";
import { isValidConnection } from "@workspace/canvas";
import { getOffsetPosition, useCanvasHandlers } from "./hooks/useCanvasHandlers";

const edgeTypes = {
  "foreign-key": ForeignKeyEdge,
  "connection": HTTPConnectionEdge,
  "message": MessagingEdge,
};

interface SchemaViewProps {
  projectId: string;
}

export function SchemaView({ projectId }: SchemaViewProps) {
  const {
    nodes,
    edges,
    onEdgesChange,
    onConnect,
    addTableNode,
  } = useBackendCanvasStore();
  
  const { handleNodesChange, handleMoveEnd } = useCanvasHandlers(projectId, "schema");
  const { screenToFlowPosition } = useReactFlow();

  const getCenterPosition = () => {
    if (typeof window === "undefined") return { x: 100, y: 100 };
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  };

  const handleAddTable = () => {
    const center = getCenterPosition();
    const { x, y } = getOffsetPosition(center.x - 75, center.y - 30, nodes);
    addTableNode(undefined, { x, y });
  };

  const schemaNodes = nodes
    .filter((n) => n.type === "entity" || n.type === "group")
    .map((n) => {
      if (n.type === "group") {
        return {
          ...n,
          style: { ...n.style, minWidth: 450, minHeight: 300 },
        };
      }
      return n;
    });
  const schemaEdges = edges.filter((e) => e.type === "foreign-key");

  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={schemaNodes}
        edges={schemaEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        deleteKeyCode={["Backspace", "Delete"]}
        onConnect={onConnect}
        isValidConnection={(connection: Connection) => {
          const src = nodes.find(n => n.id === connection.source);
          const tgt = nodes.find(n => n.id === connection.target);
          if (!src || !tgt) return false;
          return isValidConnection(src.type, connection.sourceHandle, tgt.type, connection.targetHandle).valid;
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onMoveEnd={handleMoveEnd}
        attributionPosition="bottom-right"
      >
        <Background gap={12} size={1} />
        <Controls />
        <MiniMap />
        <Panel position="top-right" className="flex gap-2 flex-col">
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs" onClick={handleAddTable}>
            <PlusSquare className="w-3.5 h-3.5 mr-2" />
            Table
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs" onClick={() => {
             // runAutoLayout()
          }}>
            <LayoutGrid className="w-3.5 h-3.5 mr-2" />
            Auto-layout
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
