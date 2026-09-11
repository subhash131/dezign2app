import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  CompiledFile,
} from "@workspace/canvas/types";
import { compileMonorepo } from "@/lib/compiler/compileMonorepo";
import {
  DeletionTarget,
  NodeArchitectureImpact,
} from "./types";
import { NodeDeletionDiffResult } from "@/lib/compiler/nodeDeletionDiff";
import {
  simulateSubItemDeletion,
  computeFileDiffs,
} from "./subitem-handlers";

export interface SubItemDeletionComputationResult {
  architectureImpact: NodeArchitectureImpact;
  diff: NodeDeletionDiffResult;
}

/**
 * Computes both Architecture Impact and Monorepo Code Diff for granular canvas sub-items
 * (e.g. database columns, table indexes, page sections, access zones, endpoints, page renames).
 */
export function computeSubItemDeletion(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  edges: BackendEdge[] = [],
  testCases: SimulationTestCase[] = [],
  projectName: string = "Dezign2App Monorepo",
  target: DeletionTarget,
): SubItemDeletionComputationResult {
  // 1. Compile before state
  let filesBefore: CompiledFile[] = [];
  try {
    const beforeNodes =
      target.type === "pageRename"
        ? nodes.map((n) =>
            n.id === target.nodeId
              ? { ...n, data: { ...n.data, label: target.oldLabel } }
              : n,
          )
        : nodes;

    filesBefore = compileMonorepo(
      beforeNodes,
      endpoints,
      events,
      edges,
      testCases,
      projectName,
    ).files;
  } catch (e) {
    console.error("[computeSubItemDeletion] Error compiling before state:", e);
  }

  // 2. Simulate canvas modifications and calculate architecture blast radius
  const {
    nextNodes,
    nextEndpoints,
    nextEvents,
    nextEdges,
    targetNodes,
    severedConnections,
    cascadeElements,
    brokenReferences,
  } = simulateSubItemDeletion(
    { nodes, endpoints, events, edges },
    target,
  );

  // 3. Compile monorepo with simulated after state
  let filesAfter: CompiledFile[] = [];
  try {
    filesAfter = compileMonorepo(
      nextNodes,
      nextEndpoints,
      nextEvents,
      nextEdges,
      testCases,
      projectName,
    ).files;
  } catch (e) {
    console.error("[computeSubItemDeletion] Error compiling after state:", e);
    filesAfter = filesBefore;
  }

  // 4. Calculate file diffs between before and after
  const diff = computeFileDiffs(filesBefore, filesAfter, targetNodes);

  const totalCanvasImpactCount =
    severedConnections.length + cascadeElements.length + brokenReferences.length;

  const architectureImpact: NodeArchitectureImpact = {
    targetNodes,
    severedConnections,
    cascadeElements,
    brokenReferences,
    totalCanvasImpactCount,
  };

  return {
    architectureImpact,
    diff,
  };
}

export * from "./subitem-handlers";
