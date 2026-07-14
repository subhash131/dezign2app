import { NodeMemory } from './documents';
import { Supermemory } from 'supermemory';

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
      // 1. Add new nodes
      for (const node of nodes) {
        await this.upsertNode(syncId, node);
      }
      
      // 2. Add architecture document
      if (architectureContent && architectureContent.trim() !== "") {
        console.log(`Syncing Architecture Document to Supermemory...`);
        await this.client.documents.add({
          content: `System Architecture Plan:\n\n${architectureContent}`,
          metadata: {
            projectId,
            syncId,
            kind: 'architecture'
          }
        });
      }

      // 3. Delete old documents
      console.log(`Successfully added new documents. Cleaning up old documents...`);
      await this.cleanupOldDocuments(projectId, syncId, nodes.length);
      
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
      metadata: {
        projectId: node.projectId,
        nodeId: node.nodeId,
        syncId,
        kind: node.kind,
      }
    });
  }

  private async cleanupOldDocuments(projectId: string, currentSyncId: string, nodeCount: number): Promise<void> {
    try {
      // Find all documents for this project
      // Assuming empty query or a wildcard query retrieves all for the metadata filter.
      // A more direct client.documents.list would be better if the SDK supports it.
      const response = await this.client.search.documents({
        q: "*", 
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

      if (!response || !response.results) return;

      const results = response.results;
      
      // Filter out the ones that don't match the new syncId
      const oldDocs = results.filter((r: any) => r.metadata?.syncId !== currentSyncId);
      
      if (oldDocs.length === 0) {
        return;
      }
      
      // Sanity check: don't delete if we are deleting wildly more than expected
      // Expecting at most around 2-3x the node count (accounting for old docs + arch doc).
      // If we somehow get thousands, abort.
      const maxDeletions = Math.max(50, nodeCount * 5); 
      if (oldDocs.length > maxDeletions) {
        console.warn(`Sanity check failed: Attempting to delete ${oldDocs.length} old documents, but node count is only ${nodeCount}. Aborting cleanup.`);
        return;
      }

      console.log(`Deleting ${oldDocs.length} old documents...`);
      for (const doc of oldDocs) {
         if (doc.documentId) {
            // Depending on SDK, delete might be client.documents.delete or similar.
            try {
               await (this.client.documents as any).delete({ id: doc.documentId }); 
            } catch(e) {
               console.error(`Failed to delete document ${doc.documentId}`, e);
            }
         }
      }
    } catch (error) {
      console.error(`Error during cleanup of old documents:`, error);
    }
  }

  async buildCodingContext(projectId: string, query: string): Promise<any> {
    console.log(`Building coding context for ${projectId} with query: ${query}`);
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
      
      if (!response || !response.results) {
        return { services: [], entities: [], clients: [], architecture: "", resources: [] };
      }

      // 1. Flatten all chunks
      const allChunks = response.results.flatMap((result: any) => 
        (result.chunks || []).map((chunk: any) => ({
          content: chunk.content,
          score: chunk.score,
          metadata: result.metadata
        }))
      );

      // 2. Filter by relevance score (e.g. > 0.65)
      const strongMatches = allChunks.filter((c: any) => c.score > 0.65);

      // 3. Dedupe by nodeId (keep highest score)
      const dedupedByNode = new Map<string, any>();
      const architectureChunks: string[] = [];

      for (const chunk of strongMatches) {
        if (chunk.metadata?.kind === 'architecture') {
          architectureChunks.push(chunk.content);
        } else {
          const nodeId = chunk.metadata?.nodeId;
          if (nodeId) {
            if (!dedupedByNode.has(nodeId) || dedupedByNode.get(nodeId).score < chunk.score) {
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

