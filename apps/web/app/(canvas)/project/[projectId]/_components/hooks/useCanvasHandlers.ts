import { useCallback } from "react";
import { NodeChange } from "@xyflow/react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, BackendCanvasView } from "@/types/canvas";

export function useCanvasHandlers(projectId: string, view: BackendCanvasView) {
  const onNodesChangeStore = useBackendCanvasStore((s) => s.onNodesChange);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const removals = changes.filter((c) => c.type === "remove");
    const otherChanges = changes.filter((c) => c.type !== "remove");
    
    if (removals.length > 0) {
      const store = useBackendCanvasStore.getState();
      const entitiesToConfirm: BackendNode[] = [];
      const safeToRemove: NodeChange[] = [];
      
      removals.forEach((r) => {
        const node = store.nodes.find((n) => n.id === r.id);
        if (node && node.type === "entity") {
          const cols = node.data.columns || [];
          const idxs = node.data.indexes || [];
          const isEmpty = cols.length === 0 && idxs.length === 0;
          const isInitial = cols.length === 1 && cols[0]?.name === "_id" && idxs.length === 0;
          
          if (!isEmpty && !isInitial) {
            entitiesToConfirm.push(node);
          } else {
            safeToRemove.push(r);
          }
        } else if (node && node.type === "group") {
          const hasChildren = store.nodes.some((n) => n.parentId === node.id);
          if (hasChildren || node.data.label) {
            entitiesToConfirm.push(node);
          } else {
            safeToRemove.push(r);
          }
        } else if (node) {
          safeToRemove.push(r);
        }
      });
      
      if (entitiesToConfirm.length > 0) {
        store.setNodesPendingDeletion(entitiesToConfirm);
        if (otherChanges.length > 0 || safeToRemove.length > 0) {
          onNodesChangeStore([...otherChanges, ...safeToRemove]);
        }
        return;
      }
    }
    
    if (changes.length > 0) {
      onNodesChangeStore(changes);
    }
  }, [onNodesChangeStore]);

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      localStorage.setItem(`canvas_viewport_${projectId}_${view}`, JSON.stringify(viewport));
    },
    [projectId, view]
  );

  return { handleNodesChange, handleMoveEnd };
}

export function getOffsetPosition(baseX: number, baseY: number, nodes: BackendNode[]) {
  let x = baseX;
  let y = baseY;
  const offset = 20;
  
  // Find a position that doesn't exactly overlap with existing nodes
  while (nodes.some(node => Math.abs(node.position.x - x) < 5 && Math.abs(node.position.y - y) < 5)) {
    x += offset;
    y += offset;
  }
  
  return { x, y };
}
