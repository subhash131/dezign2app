import { NodeMemory } from './documents';
import { Supermemory } from 'supermemory';

interface SearchResultChunk {
  content: string;
  score: number;
}

interface SearchResult {
  documentId?: string;
  chunks?: SearchResultChunk[];
  metadata?: {
    projectId?: string;
    syncId?: string;
    kind?: string;
    nodeId?: string;
    [key: string]: string | undefined;
  };
}

interface ChunkMatch {
  content: string;
  score: number;
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
          metadata: {
            projectId,
            syncId,
            kind: 'architecture'
          }
        });
      }

      console.log(`Successfully synced graph for ${projectId} to Supermemory.`);
    } catch (error) {
      console.error(`Failed to sync graph for ${projectId} to Supermemory:`, error);
      throw error;
    }
  }

  async upsertNode(syncId: string, node: NodeMemory): Promise<void> {
    console.log(`Syncing Node ${node.name} to Supermemory...`);
    
    let content = `${node.name}\n\n`;
    if (node.dependencies.length > 0) {
      content += `Dependencies:\n${node.dependencies.map(d => `- ${d}`).join('\n')}\n\n`;
    }
    if (node.dependents.length > 0) {
      content += `Used by:\n${node.dependents.map(d => `- ${d}`).join('\n')}\n\n`;
    }
    if (node.responsibilities.length > 0) {
      content += `Responsibilities:\n${node.responsibilities.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    if (node.facts.length > 0) {
      content += `Facts:\n${node.facts.join('\n')}\n\n`;
    }

    await this.client.documents.add({
      content: content.trim(),
      containerTag: node.projectId,
      metadata: {
        projectId: node.projectId,
        nodeId: node.nodeId,
        syncId,
        kind: node.kind,
      }
    });
  }



  async clearProject(projectId: string): Promise<void> {
    console.log(`Clearing all documents for project ${projectId} in Supermemory...`);
    try {
      let hasMore = true;
      let loopCount = 0;
      let totalDeleted = 0;

      while (hasMore && loopCount < 20) {
        loopCount++;
        const response = await this.client.search.documents({
          q: "*", 
          containerTags: [projectId],
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

        if (!response || !response.results || response.results.length === 0) {
          hasMore = false;
          break;
        }

        const results = response.results;
        console.log(`Deleting ${results.length} documents for project ${projectId} (Page ${loopCount})...`);

        for (const doc of results) {
          if (doc.documentId) {
            try {
              await (this.client.documents as unknown as { delete: (id: string) => Promise<void> }).delete(doc.documentId); 
              totalDeleted++;
            } catch(e) {
              console.error(`Failed to delete document ${doc.documentId}`, e);
            }
          }
        }
      }
      
      console.log(`Successfully cleared ${totalDeleted} documents for project ${projectId} from Supermemory.`);
    } catch (error) {
      console.error(`Error during clearProject:`, error);
      throw error;
    }
  }

  async buildCodingContext(projectId: string, query: string) {
    console.log(`Building coding context for ${projectId} with query: ${query}`);
    try {
      const response = await this.client.search.documents({
        q: query,
        containerTags: [projectId],
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

      // 1. Flatten all chunks
      const allChunks: ChunkMatch[] = (response.results as SearchResult[]).flatMap((result) => 
        (result.chunks || []).map((chunk) => ({
          content: chunk.content,
          score: chunk.score,
          metadata: result.metadata
        }))
      );

      // 2. Filter by relevance score (e.g. > 0.5)
      const strongMatches = allChunks.filter((c) => c.score > 0.5);

      // 3. Dedupe by nodeId (keep highest score)
      const dedupedByNode = new Map<string, ChunkMatch>();
      const architectureChunks: string[] = [];

      for (const chunk of strongMatches) {
        if (chunk.metadata?.kind === 'architecture') {
          architectureChunks.push(chunk.content);
        } else {
          const nodeId = chunk.metadata?.nodeId;
          if (nodeId) {
            const existing = dedupedByNode.get(nodeId);
            if (!existing || existing.score < chunk.score) {
              dedupedByNode.set(nodeId, chunk);
            }
          }
        }
      }

      const uniqueNodeChunks = Array.from(dedupedByNode.values());

      // 4. Group by kind
      const context = {
        architecture: architectureChunks.join('\n\n'),
        services: uniqueNodeChunks.filter(c => c.metadata?.kind === 'service').map(c => c.content).slice(0, 5),
        entities: uniqueNodeChunks.filter(c => c.metadata?.kind === 'entity' || c.metadata?.kind === 'db_ref').map(c => c.content).slice(0, 10),
        clients: uniqueNodeChunks.filter(c => c.metadata?.kind === 'webClient').map(c => c.content).slice(0, 5),
        resources: uniqueNodeChunks.filter(c => c.metadata?.kind === 'kafka' || c.metadata?.kind === 'redis').map(c => c.content).slice(0, 5)
      };

      return context;

    } catch (error) {
      console.error(`Failed to build coding context for ${projectId}:`, error);
      throw error;
    }
  }
}

