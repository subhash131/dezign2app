import { NodeMemory } from './documents.js';

// Stubs for the serializer, these will parse the raw graph elements
// from packages/canvas and generate the corresponding memory documents.

export class KnowledgeSerializer {
  public static serializeNode(rawNode: Record<string, unknown>): NodeMemory | null {
    // TODO: Implement parsing logic from React Flow node data
    return null;
  }
}
