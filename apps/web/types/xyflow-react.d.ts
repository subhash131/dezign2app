declare module "@xyflow/react" {
  import * as React from "react";

  export interface XYPosition {
    x: number;
    y: number;
  }

  export interface Node<TData = any, TType extends string = string> {
    id: string;
    type?: TType;
    position: XYPosition;
    data: TData;
    deletable?: boolean;
    selected?: boolean;
  }

  export interface Edge<TData = any> {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type?: string;
    data?: TData;
    label?: React.ReactNode;
    style?: React.CSSProperties;
    markerEnd?: Record<string, unknown>;
    labelStyle?: React.CSSProperties;
    labelShowBg?: boolean;
    labelBgStyle?: React.CSSProperties;
    labelBgPadding?: [number, number];
    labelBgBorderRadius?: number;
  }

  export interface Connection {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }

  export interface NodeProps<TNode = Node> {
    id: string;
    data: TNode extends Node<infer TData, string> ? TData : never;
    selected?: boolean;
  }

  export type NodeChange<TNode = Node> =
    | { id: string; type: "add" | "remove" | "replace" | "select" | "dimensions" }
    | { id: string; type: "position"; position?: XYPosition; dragging?: boolean };

  export type EdgeChange<TEdge = Edge> = {
    id: string;
    type: "add" | "remove" | "replace" | "select";
  };

  export type OnNodesChange<TNode = Node> = (
    changes: NodeChange<TNode>[],
  ) => void;
  export type OnEdgesChange<TEdge = Edge> = (
    changes: EdgeChange<TEdge>[],
  ) => void;
  export type OnConnect = (connection: Connection) => void;

  export const Position: {
    Left: "left";
    Right: "right";
    Top: "top";
    Bottom: "bottom";
  };

  export const MarkerType: {
    ArrowClosed: "arrowclosed";
  };

  export const BackgroundVariant: {
    Dots: "dots";
    Lines: "lines";
  };

  export const Handle: React.ComponentType<Record<string, unknown>>;
  export const Background: React.ComponentType<Record<string, unknown>>;
  export const Controls: React.ComponentType<Record<string, unknown>>;
  export const MiniMap: React.ComponentType<Record<string, unknown>>;
  export const ReactFlowProvider: React.ComponentType<{
    children?: React.ReactNode;
  }>;

  export function ReactFlow<TNode = Node, TEdge = Edge>(
    props: Record<string, unknown> & {
      children?: React.ReactNode;
      nodes?: TNode[];
      edges?: TEdge[];
    },
  ): React.ReactElement;

  export interface Viewport {
    x: number;
    y: number;
    zoom: number;
  }

  export function useReactFlow<TNode = Node, TEdge = Edge>(): {
    fitView: (options?: Record<string, unknown>) => void;
    screenToFlowPosition: (position: XYPosition) => XYPosition;
    setViewport: (viewport: Viewport, options?: Record<string, unknown>) => void;
    getViewport: () => Viewport;
  };

  export function applyNodeChanges<TNode = Node>(
    changes: NodeChange<TNode>[],
    nodes: TNode[],
  ): TNode[];

  export function applyEdgeChanges<TEdge = Edge>(
    changes: EdgeChange<TEdge>[],
    edges: TEdge[],
  ): TEdge[];
}
