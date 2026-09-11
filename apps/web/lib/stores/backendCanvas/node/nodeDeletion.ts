import { BackendCanvasState } from "../types";
import { cleanupDeletedNodesState } from "../stateCleanup";
import { computeNodeDeletionDiff } from "@/lib/compiler/nodeDeletionDiff";
import { handleNodeDeletionSync } from "@/lib/compiler/nodeDeletionSync";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";
import { isSchemaNodeType } from "./types";

/**
 * Handles node deletion by recording a history snapshot, cleaning up UI collapse states,
 * computing a deletion diff for monorepo disk synchronization, and cleaning up canvas state.
 */
export function executeNodeDeletion(
  currentState: BackendCanvasState,
  nodeIds: string[],
): Partial<BackendCanvasState> {
  if (!nodeIds || nodeIds.length === 0) return {};

  useSectionCollapseStore.getState().deleteNodeCollapseState(nodeIds);

  const isSchema = currentState.nodes.some(
    (n) => nodeIds.includes(n.id) && isSchemaNodeType(n.type),
  );
  currentState.pushHistorySnapshot(isSchema ? "schema" : "graph");

  try {
    const testCases = useSimulationStore.getState().testCases || [];
    const diff = computeNodeDeletionDiff(
      currentState.nodes,
      currentState.endpoints,
      currentState.events,
      currentState.edges,
      testCases,
      "Dezign2App Monorepo",
      nodeIds,
    );
    void handleNodeDeletionSync(currentState.projectId || "", diff);
  } catch (e) {
    console.error("[executeNodeDeletion] Failed to compute deletion diff:", e);
  }

  return cleanupDeletedNodesState(currentState, nodeIds);
}
