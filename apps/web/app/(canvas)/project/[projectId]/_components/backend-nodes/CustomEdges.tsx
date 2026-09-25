import { EdgeProps, getBezierPath, BaseEdge, EdgeLabelRenderer } from "@xyflow/react";
import { BackendEdge } from "@/types/canvas";

import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";

function useSimulationEdgeState(edgeId: string) {
  const { status, activeEdgeIds, currentEdgeId, trace, activeIndex } =
    useSimulationStore();
  const hasRun = status !== "idle";
  const visitedTrace = trace.slice(0, activeIndex + 1);
  const isVisited =
    activeEdgeIds.includes(edgeId) ||
    visitedTrace.some((t) => t.edgeId === edgeId);
  const isCurrent = currentEdgeId === edgeId;

  return { hasRun, isVisited, isCurrent };
}

// Inline styles for animations
const EdgeStyles = () => (
  <style>{`
    @keyframes flow-dash-forward {
      from {
        stroke-dashoffset: 16;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    .edge-flow-animated {
      stroke-dasharray: 6, 6;
      animation: flow-dash-forward 0.8s linear infinite;
    }
    .edge-flow-animated-fast {
      stroke-dasharray: 4, 4;
      animation: flow-dash-forward 0.5s linear infinite;
    }
  `}</style>
);

// Standard markers for edges
const EdgeMarkers = () => (
  <svg style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
    <defs>
      <marker
        id="arrow-blue"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" />
      </marker>
      <marker
        id="arrow-purple"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
      </marker>
      <marker
        id="arrow-amber"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
      </marker>
      <marker
        id="arrow-cyan"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
      </marker>
    </defs>
  </svg>
);

// 3. Database Reference Edge (Dashed, visible only when source DB node is selected)
export const DatabaseRefEdge = (props: EdgeProps<BackendEdge>) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    source,
  } = props;

  const sourceNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === source),
  );
  const simulation = useSimulationEdgeState(props.id);

  // Requirement: Show edges ONLY when the database node is selected
  const isDbSelected = sourceNode?.selected || false;
  if (!isDbSelected) {
    return null;
  }

  const dbColor = sourceNode?.data?.color || "#f59e0b"; // Default amber
  const markerId = `arrow-db-${dbColor.replace("#", "")}`;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <EdgeStyles />
      <svg style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={dbColor} />
          </marker>
        </defs>
      </svg>

      {/* Base path / glow */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 3,
          stroke: `${dbColor}20`,
          opacity: simulation.hasRun && !simulation.isVisited ? 0.05 : 1,
        }}
      />

      {/* Main dashed edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: dbColor,
          strokeDasharray: "4, 4",
          opacity: simulation.hasRun && !simulation.isVisited ? 0.08 : 1,
          filter: simulation.isCurrent
            ? `drop-shadow(0 0 5px ${dbColor})`
            : undefined,
        }}
      />
    </>
  );
};

// 1. HTTP/API Connection Edge (Blue/Teal)
export const HTTPConnectionEdge = (props: EdgeProps<BackendEdge>) => {
  const targetNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === props.target),
  );
  const simulation = useSimulationEdgeState(props.id);

  if (targetNode?.type === "database") {
    return <DatabaseRefEdge {...props} />;
  }

  const sourceNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === props.source),
  );
  if (
    sourceNode?.type === "types" ||
    targetNode?.type === "types" ||
    props.data?.isTypeReference ||
    props.data?.isExtensionEdge
  ) {
    return <TypeReferenceEdge {...props} />;
  }

  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isStateSubscription = Boolean(
    props.data?.isStateSubscription ||
      sourceNode?.type === "state_store" ||
      props.sourceHandle?.startsWith("store-field-out-") ||
      props.targetHandle?.startsWith("section-state-in-"),
  );

  const edgeColor = isStateSubscription ? "#06b6d4" : "#0ea5e9";
  const markerId = isStateSubscription ? "arrow-cyan" : "arrow-blue";
  const flowColor = isStateSubscription ? "#cffafe" : "#e0f2fe";
  const glowColor = isStateSubscription ? "rgba(6, 182, 212, 0.2)" : "rgba(14, 165, 233, 0.15)";

  return (
    <>
      <EdgeStyles />
      <EdgeMarkers />

      {/* Background/Base path */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 3,
          stroke: glowColor,
          opacity: simulation.hasRun && !simulation.isVisited ? 0.05 : 1,
        }}
      />

      {/* Main coloured edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: edgeColor,
          opacity: simulation.hasRun && !simulation.isVisited ? 0.08 : 1,
          filter: simulation.isCurrent
            ? `drop-shadow(0 0 5px ${edgeColor})`
            : undefined,
        }}
      />

      {/* Animated Flow dots */}
      {(!simulation.hasRun || simulation.isVisited) && (
        <path
          d={edgePath}
          fill="none"
          className={
            simulation.isCurrent ? "edge-flow-animated-fast" : undefined
          }
          style={{
            strokeWidth: 1.5,
            stroke: flowColor,
            pointerEvents: "none",
            opacity: simulation.hasRun && !simulation.isCurrent ? 0.35 : 1,
          }}
        />
      )}

      {/* Edge label badge (never shown for state subscriptions) */}
      {props.data?.label && !isStateSubscription && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-background/95 border border-blue-500/40 text-blue-500 shadow-xs"
          >
            {props.data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// 2. Messaging Edge (Purple/Lavender)
export const MessagingEdge = (props: EdgeProps<BackendEdge>) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
  } = props;
  const simulation = useSimulationEdgeState(props.id);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <EdgeStyles />
      <EdgeMarkers />

      {/* Base shadow path */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 3.5,
          stroke: "rgba(168, 85, 247, 0.12)",
          opacity: simulation.hasRun && !simulation.isVisited ? 0.05 : 1,
        }}
      />

      {/* Main purple edge */}
      <BaseEdge
        path={edgePath}
        markerEnd="url(#arrow-purple)"
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: "#a855f7", // purple-500
          opacity: simulation.hasRun && !simulation.isVisited ? 0.08 : 1,
          filter: simulation.isCurrent
            ? "drop-shadow(0 0 5px #a855f7)"
            : undefined,
        }}
      />

      {/* Animated messaging pulses */}
      {(!simulation.hasRun || simulation.isVisited) && (
        <path
          d={edgePath}
          fill="none"
          className={simulation.isCurrent ? "edge-flow-animated" : undefined}
          style={{
            strokeWidth: 1.5,
            stroke: "#f3e8ff", // purple-100 overlay
            pointerEvents: "none",
            opacity: simulation.hasRun && !simulation.isCurrent ? 0.35 : 1,
          }}
        />
      )}
    </>
  );
};

// 4. Identity Connection Edge (Emerald/Teal Dashed)
export const IdentityConnectionEdge = (props: EdgeProps<BackendEdge>) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
  } = props;
  const simulation = useSimulationEdgeState(props.id);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <EdgeStyles />
      <EdgeMarkers />

      {/* Base path */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 3,
          stroke: "rgba(16, 185, 129, 0.1)",
          opacity: simulation.hasRun && !simulation.isVisited ? 0.05 : 1,
        }}
      />

      {/* Main dashed edge */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: "#10b981", // emerald-500
          strokeDasharray: "4, 4",
          opacity: simulation.hasRun && !simulation.isVisited ? 0.08 : 1,
          filter: simulation.isCurrent
            ? "drop-shadow(0 0 5px #10b981)"
            : undefined,
        }}
      />
    </>
  );
};

// 5. Transformer Reference Edge (Invisible reference edge between master transformer and transformer_ref nodes)
export const TransformerReferenceEdge = (props: EdgeProps<BackendEdge>) => {
  const isEdgeSelected = props.selected;
  const sourceNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === props.source),
  );
  const targetNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === props.target),
  );
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);

  const isNodeSelected =
    Boolean(sourceNode?.selected) ||
    Boolean(targetNode?.selected) ||
    activeConfigItem?.nodeId === props.source ||
    activeConfigItem?.id === props.source ||
    activeConfigItem?.nodeId === props.target ||
    activeConfigItem?.id === props.target;

  const isVisible = isEdgeSelected || isNodeSelected;

  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  if (!isVisible) {
    return (
      <BaseEdge
        path={edgePath}
        style={{
          opacity: 0,
          pointerEvents: "none",
          strokeWidth: 0,
        }}
      />
    );
  }

  return (
    <>
      <EdgeStyles />
      <EdgeMarkers />

      {/* Subtle purple background glow */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 4,
          stroke: "rgba(168, 85, 247, 0.25)",
          filter: "drop-shadow(0 0 6px rgba(168, 85, 247, 0.6))",
        }}
      />

      {/* Main purple dashed reference line */}
      <BaseEdge
        path={edgePath}
        markerEnd="url(#arrow-purple)"
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: "#a855f7", // purple-500
          strokeDasharray: "4, 4",
        }}
      />
    </>
  );
};

// 5b. Storage Reference Edge (Invisible reference edge between bucket on StorageNode and StorageOperationRefNode header)
export const StorageReferenceEdge = (props: EdgeProps<BackendEdge>) => {
  const isEdgeSelected = props.selected;
  const sourceNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === props.source),
  );
  const targetNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === props.target),
  );
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);

  const isNodeSelected =
    Boolean(sourceNode?.selected) ||
    Boolean(targetNode?.selected) ||
    activeConfigItem?.nodeId === props.source ||
    activeConfigItem?.id === props.source ||
    activeConfigItem?.nodeId === props.target ||
    activeConfigItem?.id === props.target;

  const isVisible = isEdgeSelected || isNodeSelected;

  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  if (!isVisible) {
    return (
      <BaseEdge
        path={edgePath}
        style={{
          opacity: 0,
          pointerEvents: "none",
          strokeWidth: 0,
        }}
      />
    );
  }

  return (
    <>
      <EdgeStyles />
      <EdgeMarkers />

      {/* Subtle amber background glow */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 4,
          stroke: "#f59e0b25",
          filter: "drop-shadow(0 0 6px #f59e0b80)",
        }}
      />

      {/* Main dashed edge */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: "#f59e0b", // amber-500
          strokeDasharray: "4, 4",
        }}
      />
    </>
  );
};

export type TypeReferenceEdgeProps = EdgeProps<BackendEdge>;

// 5. Type Reference Edge (Indigo dashed, conditionally visible when either connected node is selected, or always visible if extending a type)
export const TypeReferenceEdge = (props: TypeReferenceEdgeProps) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    source,
    target,
    data,
    selected,
  } = props;

  const sourceNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === source),
  );
  const targetNode = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === target),
  );

  const isExtensionEdge = Boolean(data?.isExtensionEdge);
  const isNodeSelected = Boolean(sourceNode?.selected || targetNode?.selected || selected);

  // Hidden when unselected, unless it is a visual extension edge
  if (!isExtensionEdge && !isNodeSelected) {
    return null;
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = isExtensionEdge ? "#8b5cf6" : "#6366f1"; // purple-500 for extends, indigo-500 for package types
  const markerId = isExtensionEdge ? "arrow-purple" : "arrow-indigo";

  return (
    <>
      <EdgeStyles />
      <EdgeMarkers />
      <svg style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
        <defs>
          <marker
            id="arrow-indigo"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
          </marker>
        </defs>
      </svg>

      {/* Glow path */}
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 4,
          stroke: `${edgeColor}25`,
          filter: `drop-shadow(0 0 6px ${edgeColor}80)`,
        }}
      />

      {/* Main dashed edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          ...style,
          strokeWidth: 1.5,
          stroke: edgeColor,
          strokeDasharray: "4, 4",
        }}
      />

      {/* Pill label only if extending a type */}
      {isExtensionEdge && data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-background/95 border border-purple-500/50 text-purple-400 shadow-xs ring-1 ring-purple-500/20"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

