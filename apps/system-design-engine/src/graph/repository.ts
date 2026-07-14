import { NodeMemory } from '../knowledge/documents.js';

/**
 * Abstract interface to isolate the engine from the underlying persistence layer.
 * Can be implemented by Convex, Supermemory, Neo4J, or in-memory for testing.
 */
export interface GraphRepository {
  getNode(projectId: string, nodeId: string): Promise<NodeMemory | null>;
  searchNodes(projectId: string, query: string): Promise<NodeMemory[]>;
}
