import React from "react";
import {
  EdgeProps,
  getSmoothStepPath,
  BaseEdge,
} from "@xyflow/react";
import { BackendEdge } from "@/types/canvas";

export const ForeignKeyEdge = (props: EdgeProps<BackendEdge>) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  } = props;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Interpret crow's foot markers based on cardinality
  const sourceCard = data?.sourceCardinality || "1";
  const targetCard = data?.targetCardinality || "N";
  
  const sourceMarkerId = sourceCard === "1" ? "crows-foot-one" : "crows-foot-many";
  const targetMarkerId = targetCard === "1" ? "crows-foot-one" : "crows-foot-many";

  return (
    <>
      {/* SVG Definitions for Crow's Foot markers */}
      <svg style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <marker
            id="crows-foot-one"
            markerWidth="12"
            markerHeight="12"
            refX="6"
            refY="6"
            orient="auto-start-reverse"
          >
            <line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
          </marker>
          <marker
            id="crows-foot-many"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="6"
            orient="auto-start-reverse"
          >
            <line x1="0" y1="0" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
            <line x1="0" y1="12" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
          </marker>
        </defs>
      </svg>
      
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${targetMarkerId})`}
        markerStart={`url(#${sourceMarkerId})`}
        style={{
          ...props.style,
          strokeWidth: 1.5,
          stroke: "hsl(var(--muted-foreground))",
        }}
      />
    </>
  );
};
