import { BackendNode } from "@/types/canvas";

/**
 * If an entity node's label changes, update referencing columns across all other entity tables.
 */
export function syncEntityRenameReferences(
  currentNodes: BackendNode[],
  id: string,
  updatedNode: BackendNode,
  changes: Partial<BackendNode>,
): BackendNode[] {
  if (
    updatedNode.type !== "entity" ||
    changes.data?.label === undefined ||
    changes.data.label === updatedNode.data.label
  ) {
    return currentNodes;
  }

  const oldLabel = updatedNode.data.label;
  const newLabel = changes.data.label;

  if (
    !oldLabel ||
    oldLabel.trim() === "" ||
    !newLabel ||
    newLabel.trim() === ""
  ) {
    return currentNodes;
  }

  return currentNodes.map((node) => {
    if (node.id === id || node.type !== "entity" || !node.data.columns) {
      return node;
    }
    let colsChanged = false;
    const newCols = node.data.columns.map((col) => {
      if (col.references?.table === oldLabel) {
        colsChanged = true;
        return {
          ...col,
          references: {
            ...col.references,
            table: newLabel,
          },
        };
      }
      return col;
    });
    return colsChanged
      ? { ...node, data: { ...node.data, columns: newCols } }
      : node;
  });
}
