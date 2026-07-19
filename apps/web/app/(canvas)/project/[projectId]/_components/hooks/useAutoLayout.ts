import { useCallback } from 'react';
import { useReactFlow, Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useBackendCanvasStore } from '@/lib/stores/backendCanvasStore';

const nodeWidth = 250;
const nodeHeight = 150;

export function useAutoLayout() {
  const { fitView } = useReactFlow();
  const { nodes, edges, onNodesChange } = useBackendCanvasStore();

  const handleLayout = useCallback(
    (direction = 'TB') => {
      const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
      
      const isHorizontal = direction === 'LR';
      dagreGraph.setGraph({ rankdir: direction, marginx: 50, marginy: 50 });

      nodes.forEach((node) => {
        // We use node.measured width and height if they are available
        const measuredNode = node as typeof node & { measured?: { width?: number; height?: number } };
        const width = measuredNode.measured?.width ?? nodeWidth;
        const height = measuredNode.measured?.height ?? nodeHeight;
        dagreGraph.setNode(node.id, { width, height });
      });

      edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);

      const nodeChanges = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const measuredNode = node as typeof node & { measured?: { width?: number; height?: number } };
        const width = measuredNode.measured?.width ?? nodeWidth;
        const height = measuredNode.measured?.height ?? nodeHeight;

        // In groups/parent nodes, positions should be relative. 
        // For simplicity, dagre layout applies to top-level elements cleanly.
        return {
          id: node.id,
          type: 'position' as const,
          position: {
            x: nodeWithPosition.x - width / 2,
            y: nodeWithPosition.y - height / 2,
          },
        };
      });

      // Update positions via store to ensure they sync back to the database
      onNodesChange(nodeChanges);

      // Fit view afterwards
      window.requestAnimationFrame(() => {
        fitView({ duration: 800 });
      });
    },
    [nodes, edges, fitView, onNodesChange]
  );

  return { handleLayout };
}
