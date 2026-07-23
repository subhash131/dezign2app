import { NodeMemory } from './documents';
import { Supermemory } from 'supermemory';

interface SearchResult {
  id?: string;
  memory?: string;
  chunk?: string;
  similarity?: number;
  metadata?: {
    projectId?: string;
    syncId?: string;
    kind?: string;
    nodeId?: string;
    [key: string]: string | undefined;
  };
  relatedMemories?: SearchResult[];
}

interface ChunkMatch {
  content: string;
  similarity: number;
  metadata?: SearchResult['metadata'];
}

export class SupermemorySync {
  private client: Supermemory;

  constructor() {
    this.client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY || '',
    });
  }

  async syncGraph(projectId: string, syncId: string, nodes: NodeMemory[], architectureContent: string): Promise<void> {
    console.log(`Syncing graph for ${projectId} (syncId: ${syncId}) to Supermemory...`);
    try {
      // 1. Clear all previous documents for this project to avoid pagination issues
      console.log(`Cleaning up old documents before inserting new ones...`);
      await this.clearProject(projectId);

      // 2. Add new nodes
      for (const node of nodes) {
        await this.upsertNode(syncId, node);
      }
      
      // 3. Add architecture document
      if (architectureContent && architectureContent.trim() !== "") {
        console.log(`Syncing Architecture Document to Supermemory...`);
        await this.client.documents.add({
          content: `System Architecture Plan:\n\n${architectureContent}`,
          containerTag: projectId,
          dreaming: "instant",
          include:{
            relatedMemories: true,
          },  
          metadata: {
            projectId,
            syncId,
            kind: 'architecture'
          }
        }as any);
      }

      console.log(`Successfully synced graph for ${projectId} to Supermemory.`);
    } catch (error) {
      console.error(`Failed to sync graph for ${projectId} to Supermemory:`, error);
      throw error;
    }
  }

  async upsertNode(syncId: string, node: NodeMemory): Promise<void> {
    console.log(`Syncing Node ${node.name} to Supermemory...`);

    // Primary fact first — this keeps the node name + its definition (DDL, endpoints, etc.)
    // in the same leading chunk so vector search on "schema Slides" or "POST /slides" works.
    let content = "";

    if (node.facts.length > 0) {
      // Each fact is already a self-contained definition line (e.g. "database schema: Slides(...)")
      content += node.facts.join("\n") + "\n\n";
    } else {
      // Fallback: just the name
      content += `${node.name}\n\n`;
    }

    if (node.responsibilities.length > 0) {
      content += `Description: ${node.responsibilities.join(" ")}\n\n`;
    }
    if (node.dependencies.length > 0) {
      content += `Depends on: ${node.dependencies.join(", ")}\n\n`;
    }
    if (node.dependents.length > 0) {
      content += `Used by: ${node.dependents.join(", ")}\n\n`;
    }

    await this.client.documents.add({
      content: content.trim(),
      containerTag: node.projectId,
      dreaming: "instant",
      metadata: {
        projectId: node.projectId,
        nodeId: node.nodeId,
        syncId,
        kind: node.kind,
      }
    } as any);
  }




  async clearProject(projectId: string): Promise<void> {
    console.log(`Clearing all documents for project ${projectId} in Supermemory...`);
    try {
      await this.client.documents.deleteBulk({ containerTags: [projectId] });
      console.log(`Successfully cleared all documents for project ${projectId} from Supermemory.`);
    } catch (error) {
      console.error(`Error during clearProject:`, error);
      throw error;
    }
  }

  async buildCodingContext(projectId: string, query: string) {
    console.log(`Building coding context for ${projectId} with query: ${query}`);
    try {
      const response = await this.client.search.memories({
        q: query,
        containerTag: projectId,
        include: {
          relatedMemories: false,
          documents: false,
          summaries: false,
        },
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
      
      if (!response || !response.results) {
        return { services: [], entities: [], clients: [], architecture: "", resources: [] };
      }

      // 1. Collect all primary results — no relatedMemories traversal
      // (related chunks inherit the parent's similarity score which is misleading
      // and causes duplicates; primary results are sufficient at the lower threshold)
      const results = response.results as SearchResult[];
      const allMatches: ChunkMatch[] = results
        .map((result) => ({
          content: result.memory || result.chunk || "",
          similarity: result.similarity ?? 0,
          metadata: result.metadata,
        }))
        .filter((c) => c.content !== "");

      // 2. Filter by relevance — lowered from 0.5 to 0.15 so short entity documents
      // (e.g. a table with just a name + columns) are not silently discarded
      const strongMatches = allMatches.filter((c) => c.similarity >= 0.15);

      // 3. Dedupe by nodeId (keep highest similarity)
      const dedupedByNode = new Map<string, ChunkMatch>();
      const architectureChunks: string[] = [];

      for (const chunk of strongMatches) {
        if (chunk.metadata?.kind === 'architecture') {
          architectureChunks.push(chunk.content);
        } else {
          const nodeId = chunk.metadata?.nodeId;
          if (nodeId) {
            const existing = dedupedByNode.get(nodeId);
            if (!existing || existing.similarity < chunk.similarity) {
              dedupedByNode.set(nodeId, chunk);
            }
          }
        }
      }

      const uniqueNodeChunks = Array.from(dedupedByNode.values());

      // 4. Group by kind
      const testCaseChunks = uniqueNodeChunks.filter(c => c.content.includes("Test Cases:")).map(c => {
        const lines = c.content.split('\n');
        const tcIdx = lines.findIndex(l => l.startsWith("Test Cases:"));
        return tcIdx !== -1 ? `${c.content.split('\n')[0]} - ${lines.slice(tcIdx).join('\n')}` : c.content;
      });

      const context = {
        architecture: architectureChunks.join('\n\n'),
        services: uniqueNodeChunks.filter(c => c.metadata?.kind === 'service').map(c => c.content).slice(0, 5),
        entities: uniqueNodeChunks.filter(c => c.metadata?.kind === 'entity' || c.metadata?.kind === 'db_ref').map(c => c.content).slice(0, 10),
        clients: uniqueNodeChunks.filter(c => c.metadata?.kind === 'webClient').map(c => c.content).slice(0, 5),
        resources: uniqueNodeChunks.filter(c => c.metadata?.kind === 'kafka' || c.metadata?.kind === 'redis').map(c => c.content).slice(0, 5),
        testCases: testCaseChunks.slice(0, 10),
      };

      return context;

    } catch (error) {
      console.error(`Failed to build coding context for ${projectId}:`, error);
      throw error;
    }
  }

  async searchMemories(projectId: string, query: string) {
    console.log(`Searching memories for ${projectId} with query: ${query}`);
    try {
      const response = await this.client.search.memories({
        q: query,
        containerTag: projectId,
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
      return response.results || [];
    } catch (error) {
      console.error(`Failed to search memories for ${projectId}:`, error);
      throw error;
    }
  }
}

