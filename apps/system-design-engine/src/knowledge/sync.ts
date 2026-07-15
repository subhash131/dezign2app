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
      dreaming: "instant",
      include:{
        relatedMemories: true,
      },
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
      let hasMore = true;
      let loopCount = 0;
      let totalDeleted = 0;

      while (hasMore && loopCount < 20) {
        loopCount++;
        const response = await this.client.search.memories({
          q: "*", 
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

        if (!response || !response.results || response.results.length === 0) {
          hasMore = false;
          break;
        }

        const results = response.results as SearchResult[];
        console.log(`Deleting ${results.length} documents for project ${projectId} (Page ${loopCount})...`);

        for (const doc of results) {
          if (doc.id) {
            try {
              await (this.client.documents as unknown as { delete: (id: string) => Promise<void> }).delete(doc.id); 
              totalDeleted++;
            } catch(e) {
              console.error(`Failed to delete document ${doc.id}`, e);
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
      const response = await this.client.search.memories({
        q: query,
        containerTag: projectId,
        include: {
          relatedMemories: true,
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

      // 1. Flatten all results and related memories
      const results = response.results as SearchResult[];
      const allMatches: ChunkMatch[] = [];

      for (const result of results) {
        const content = result.memory || result.chunk || "";
        const similarity = result.similarity ?? 0;
        
        if (content) {
          allMatches.push({
            content,
            similarity,
            metadata: result.metadata
          });
        }

        if (result.relatedMemories && Array.isArray(result.relatedMemories)) {
          for (const related of result.relatedMemories) {
            const relContent = related.memory || related.chunk || "";
            const relSimilarity = related.similarity ?? similarity ?? 0;
            if (relContent) {
              allMatches.push({
                content: relContent,
                similarity: relSimilarity,
                metadata: related.metadata
              });
            }
          }
        }
      }

      // 2. Filter by relevance similarity (e.g. > 0.5)
      const strongMatches = allMatches.filter((c) => c.similarity > 0.5);

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

