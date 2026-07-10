import { CanvasAdapter, CanvasOperation, BackendDesignDoc, BackendNode, BackendEdge } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export interface BackendStoreActions {
  addNode: (node: Omit<BackendNode, "fractionalIndex">) => void;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: Omit<BackendEdge, "fractionalIndex">) => void;
  updateEdge: (id: string, changes: Partial<BackendEdge>) => void;
  deleteEdge: (id: string) => void;
}

export class BackendCanvasAdapter implements CanvasAdapter<BackendDesignDoc> {
  // Always read live from the store — no stale closure
  private getStateFn: () => BackendDesignDoc;
  private actions: BackendStoreActions;

  constructor(actions: BackendStoreActions) {
    this.getStateFn = () => {
      const s = useBackendCanvasStore.getState();
      return { nodes: s.nodes, edges: s.edges };
    };
    this.actions = actions;
  }

  getState(): BackendDesignDoc {
    return this.getStateFn();
  }

  applyOperations(ops: CanvasOperation[]): void {
    for (const op of ops) {
      switch (op.op) {
        case "add_node":
          this.actions.addNode({
            id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: op.type,
            position: op.position || { x: 0, y: 0 },
            data: { label: op.label, ...op.data },
          });
          break;
        case "update_node":
          this.actions.updateNode(op.id, op.changes);
          break;
        case "delete_node":
          this.actions.deleteNode(op.id);
          break;
        case "add_edge":
          this.actions.addEdge({
            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            source: op.source,
            target: op.target,
            type: op.type,
            data: op.data,
          });
          break;
        case "update_edge":
          this.actions.updateEdge(op.id, op.changes);
          break;
        case "delete_edge":
          this.actions.deleteEdge(op.id);
          break;
        case "run_auto_layout":
          // Layout will be handled in the component that watches for this signal, 
          // or we can implement elkjs directly here if we pass it down
          break;
      }
    }
  }

  serialize(): string {
    const { nodes, edges } = this.getStateFn();
    
    if (nodes.length === 0) return "Backend Canvas is empty.";

    let output = "Backend Canvas Nodes:\n";
    nodes.forEach((n) => {
      let extra = "";
      if (n.type === "entity" && n.data.columns) {
        extra = ` (Columns: ${n.data.columns.map((c) => c.name).join(", ")})`;
      }
      output += `- [${n.type}] id: ${n.id}, label: "${n.data.label}"${extra}\n`;
    });

    if (edges.length > 0) {
      output += "\nConnections:\n";
      edges.forEach((e) => {
        const sourceNode = nodes.find(n => n.id === e.source)?.data.label || e.source;
        const targetNode = nodes.find(n => n.id === e.target)?.data.label || e.target;
        const label = e.data?.label ? ` (label: ${e.data.label})` : "";
        output += `- ${sourceNode} -> ${targetNode} [${e.type}]${label}\n`;
      });
    }

    return output;
  }
}
