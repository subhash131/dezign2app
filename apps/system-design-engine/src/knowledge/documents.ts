export interface NodeMemory {
  projectId: string;
  nodeId: string;
  kind: string; // Unified from previous 'type', 'nodeType', and 'resourceType'
  name: string;
  
  dependencies: string[];
  dependents: string[];
  responsibilities: string[];
  facts: string[];
  
  version: number;
}
