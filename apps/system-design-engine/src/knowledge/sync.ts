import { NodeMemory, RelationshipMemory, ResourceMemory } from './documents.js';
import { Supermemory } from 'supermemory';

export class SupermemorySync {
  private client: Supermemory;

  constructor() {
    this.client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY || '',
    });
  }

  async syncGraph(projectId: string, nodes: NodeMemory[], edges: RelationshipMemory[]): Promise<void> {
    console.log(`Syncing graph for ${projectId} to Supermemory...`);
    try {
      for (const node of nodes) {
        await this.upsertNode(node);
      }
      for (const edge of edges) {
        await this.upsertRelationship(edge);
      }
      console.log(`Successfully synced graph for ${projectId} to Supermemory.`);
    } catch (error) {
      console.error(`Failed to sync graph for ${projectId} to Supermemory:`, error);
      throw error;
    }
  }

  async upsertNode(node: NodeMemory): Promise<void> {
    console.log(`Syncing Node ${node.nodeId} to Supermemory...`);
    await this.client.documents.add({
      content: `System Design Node: ${node.name}\nType: ${node.type}\nFacts: ${node.facts.join(', ')}`,
      metadata: {
        projectId: node.projectId,
        nodeId: node.nodeId,
        type: 'node',
        nodeType: node.type,
      }
    });
  }

  async upsertResource(resource: ResourceMemory): Promise<void> {
    console.log(`Syncing Resource ${resource.resourceId} to Supermemory...`);
    await this.client.documents.add({
      content: `System Design Resource: ${resource.name}\nType: ${resource.type}`,
      metadata: {
        projectId: resource.projectId,
        resourceId: resource.resourceId,
        type: 'resource',
        resourceType: resource.type,
      }
    });
  }

  async upsertRelationship(relationship: RelationshipMemory): Promise<void> {
    console.log(`Syncing Relationship ${relationship.edgeId} to Supermemory...`);
    await this.client.documents.add({
      content: `System Design Relationship: Node ${relationship.sourceId} ${relationship.relationType} Node ${relationship.targetId}`,
      metadata: {
        projectId: relationship.projectId,
        edgeId: relationship.edgeId,
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        relationType: relationship.relationType,
        type: 'relationship',
      }
    });
  }

  async deleteMemory(id: string): Promise<void> {
    console.log(`Deleting memory ${id} from Supermemory...`);
    // TODO: Call Supermemory API to delete
  }

  async searchProjectContext(projectId: string, query: string): Promise<any> {
    console.log(`Searching project context for ${projectId} with query: ${query}`);
    try {
      const response = await this.client.search.documents({
        q: query,
        filters: {
          AND: [
            {
              key: "projectId",
              value: projectId,
              filterType: "metadata"
            }
          ]
        }
      });
      return response;
    } catch (error) {
      console.error(`Failed to search project context for ${projectId}:`, error);
      throw error;
    }
  }
}

