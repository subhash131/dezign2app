import React from "react";

export type CanvasMode = "architecture" | "infrastructure" | "video" | "ai-worker" | "ethical-hacker";
export type TrafficIntensity = "normal" | "burst";

export interface NodeHandle {
  id: string;
  side: "left" | "right" | "bottom" | "top";
  offsetX?: number;
  offsetY?: number;
  color?: string;
  label?: string;
}

export interface CanvasNode {
  id: string;
  title: string;
  category: string;
  badge: string;
  badgeVariant?: "purple" | "blue" | "amber" | "teal" | "zinc";
  icon: React.ElementType;
  // Compact coordinates (when infra is disabled)
  archX: number;
  archY: number;
  // Spacious coordinates (when infra is enabled)
  infraX: number;
  infraY: number;
  width: number;
  height: number;
  themeColor: string;
  details: string[];
  footerArtifact: string;
  subBadges?: string[];
  handles: NodeHandle[];
  // Incoming requests telemetry shown when Infrastructure Manager is enabled
  infraIncoming?: {
    baseCount: number;
    variance: number;
    unit?: string;
  };
  infraReplicas?: number;
}

export interface Connection {
  id: string;
  d: string;
  delay: number;
  label: string;
  labelPos: { x: number; y: number };
  color?: string;
  isReturn?: boolean;
}

export interface InfraDetails {
  category: string;
  engine: string;
  algorithm?: string;
  latencyP99?: string;
  replicationLag?: string;
  activeConns: string;
  health: string;
  upstream: string;
  description: string;
  metrics: { label: string; value: string; color?: string }[];
}

export interface InfraCircle {
  id: string;
  x: number;
  y: number;
  label: string;
  sublabel: string;
  // For LBs: total incoming rate at the LB entry point
  baseRate: number;
  variance: number;
  unit?: string;
  // Number of downstream backend instances traffic is split across (LBs only)
  downstreamInstances?: number;
  type: "load-balancer" | "db-replica";
  details: InfraDetails;
}

// Canvas coordinate dimensions for both modes
export const CANVAS_WIDTH_ARCH = 2280;
export const CANVAS_HEIGHT_ARCH = 720;

export const CANVAS_WIDTH_INFRA = 3200;
export const CANVAS_HEIGHT_INFRA = 800;
