import { Editor } from "tldraw";
import { CanvasAdapter, CanvasOperation, FrontendDesignDoc } from "@/types/canvas";

export class FrontendCanvasAdapter implements CanvasAdapter<FrontendDesignDoc> {
  private editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  getState(): FrontendDesignDoc {
    return {
      snapshot: this.editor.store.getSnapshot(),
    };
  }

  applyOperations(ops: CanvasOperation[]): void {
    const shapesToAdd: any[] = [];
    const shapesToUpdate: any[] = [];
    const shapesToDelete: string[] = [];

    for (const op of ops) {
      if (op.op === "add_shape") {
        shapesToAdd.push({
          id: `shape:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: op.type,
          x: op.x,
          y: op.y,
          props: op.props,
        });
      } else if (op.op === "update_shape") {
        shapesToUpdate.push({
          id: op.id,
          ...op.props,
        });
      } else if (op.op === "delete_shape") {
        shapesToDelete.push(op.id);
      }
    }

    if (shapesToAdd.length > 0) {
      this.editor.createShapes(shapesToAdd);
    }
    if (shapesToUpdate.length > 0) {
      this.editor.updateShapes(shapesToUpdate);
    }
    if (shapesToDelete.length > 0) {
      this.editor.deleteShapes(shapesToDelete);
    }
  }

  serialize(): string {
    // Serialize current shapes to a concise format for AI context
    const shapes = Array.from(this.editor.store.allRecords()).filter(
      (r) => r.typeName === "shape"
    ) as any[];

    if (shapes.length === 0) return "Canvas is empty.";

    const summary = shapes.map((s) => {
      let text = "";
      if (s.props?.text) text = ` text: "${s.props.text}"`;
      return `- [${s.type}] id: ${s.id}, x: ${Math.round(s.x)}, y: ${Math.round(
        s.y
      )}${text}`;
    });

    return `Frontend Canvas Shapes:\n${summary.join("\n")}`;
  }
}
