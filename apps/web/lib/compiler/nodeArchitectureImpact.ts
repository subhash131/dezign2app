import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";
import {
  NodeArchitectureImpact,
  SeveredConnectionInfo,
  CascadeElementInfo,
  BrokenReferenceInfo,
} from "@/app/(canvas)/project/[projectId]/_components/node-deletion-dialog/types";
import { getNodeLabel } from "@/app/(canvas)/project/[projectId]/_components/node-deletion-dialog/utils";
import { isNodeDerivedFromEntity } from "@/lib/stores/backendCanvas/node/nodeEntitySync";

/**
 * Computes the canvas architecture blast radius when one or more nodes are deleted.
 */
export function computeNodeArchitectureImpact(
  nodes: BackendNode[],
  edges: BackendEdge[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & { nodeId: string; variant: "publish" | "consume" })[] = [],
  nodeIdsToDelete: string[],
): NodeArchitectureImpact {
  const deleteSet = new Set(nodeIdsToDelete);
  const targetNodesMap = new Map(nodes.filter((n) => deleteSet.has(n.id)).map((n) => [n.id, n]));

  // 1. Target Nodes Summary
  const targetNodes = Array.from(targetNodesMap.values()).map((node) => {
    let parentGroupLabel: string | undefined;
    if (node.data?.parentId) {
      const parent = nodes.find((n) => n.id === node.data?.parentId);
      if (parent) parentGroupLabel = getNodeLabel(parent);
    }

    return {
      id: node.id,
      label: getNodeLabel(node),
      type: node.type || "node",
      techStack: node.data?.techStack,
      dbEngine: node.data?.dbEngine,
      parentGroupLabel,
    };
  });

  // 2. Severed Connections (Edges connected to deleted nodes)
  const severedConnections: SeveredConnectionInfo[] = [];
  edges.forEach((edge) => {
    const isSourceDeleted = deleteSet.has(edge.source);
    const isTargetDeleted = deleteSet.has(edge.target);

    // If edge connects a deleted node to another node (or between two deleted nodes)
    if (isSourceDeleted || isTargetDeleted) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      const sourceLabel = sourceNode ? getNodeLabel(sourceNode) : edge.source;
      const targetLabel = targetNode ? getNodeLabel(targetNode) : edge.target;
      const sourceType = sourceNode?.type || "node";
      const targetType = targetNode?.type || "node";

      const direction: "incoming" | "outgoing" = isSourceDeleted ? "outgoing" : "incoming";
      const otherNodeId = isSourceDeleted ? edge.target : edge.source;
      const otherNodeLabel = isSourceDeleted ? targetLabel : sourceLabel;
      const otherNodeType = isSourceDeleted ? targetType : sourceType;

      let description = "Connection disconnected";
      const edgeType = edge.type || "connection";

      if (edgeType === "database-connection") {
        description = isSourceDeleted
          ? `Database link to ${targetLabel} removed`
          : `Connection from ${sourceLabel} severed`;
      } else if (edgeType === "foreign-key") {
        description = `Foreign key link between ${sourceLabel} and ${targetLabel} severed`;
      } else if (edgeType === "message") {
        description = `Message pipeline between ${sourceLabel} and ${targetLabel} severed`;
      } else if (edgeType === "reference" || edgeType === "transformer-reference" || edgeType === "page-reference") {
        description = `Reference link between ${sourceLabel} and ${targetLabel} unlinked`;
      } else {
        description = `Link between ${sourceLabel} and ${targetLabel} disconnected`;
      }

      severedConnections.push({
        edgeId: edge.id,
        edgeType: edge.type,
        sourceNodeId: edge.source,
        sourceNodeLabel: sourceLabel,
        sourceNodeType: sourceType,
        targetNodeId: edge.target,
        targetNodeLabel: targetLabel,
        targetNodeType: targetType,
        otherNodeId,
        otherNodeLabel,
        otherNodeType,
        direction,
        description,
      });
    }
  });

  // 3. Cascade Elements (Children and registered items that belong to deleted nodes)
  const cascadeElements: CascadeElementInfo[] = [];

  // 3a. Registered Endpoints
  endpoints.forEach((ep) => {
    if (deleteSet.has(ep.nodeId)) {
      cascadeElements.push({
        id: ep.id,
        label: ep.name || ep.id,
        type: "endpoint",
        category: "endpoint",
        description: `API endpoint (${ep.type}) removed from service`,
      });
    }
  });

  // 3b. Registered Messaging Events
  events.forEach((ev) => {
    if (deleteSet.has(ev.nodeId)) {
      cascadeElements.push({
        id: ev.id,
        label: ev.name || "Event",
        type: "event",
        category: "event",
        description: `${ev.variant === "publish" ? "Published" : "Consumed"} event removed`,
      });
    }
  });

  // 3c. Nested / Child Canvas Nodes & Associated TypesNodes
  const deletedEntityIds = new Set<string>();
  nodes.forEach((node) => {
    if (node.type === "entity" || node.type === "redis_schema") {
      if (
        deleteSet.has(node.id) ||
        (node.data?.databaseId && deleteSet.has(node.data.databaseId)) ||
        (node.data?.parentId && deleteSet.has(node.data.parentId)) ||
        (node.parentId && deleteSet.has(node.parentId))
      ) {
        deletedEntityIds.add(node.id);
      }
    }
  });

  const deletedTypesIds = new Set<string>();
  nodes.forEach((node) => {
    if (node.type === "types") {
      if (
        deleteSet.has(node.id) ||
        Array.from(deletedEntityIds).some((entId) =>
          isNodeDerivedFromEntity(node, entId, edges),
        )
      ) {
        deletedTypesIds.add(node.id);
      }
    }
  });

  nodes.forEach((node) => {
    if (deleteSet.has(node.id)) return; // Already in target nodes

    // Parent group deletion cascade
    if (node.data?.parentId && deleteSet.has(node.data.parentId)) {
      cascadeElements.push({
        id: node.id,
        label: getNodeLabel(node),
        type: node.type || "node",
        category: node.type === "webPage" ? "page" : node.type === "hook" ? "hook" : "schema",
        description: `Nested child of deleted group`,
      });
    }

    // Database entity table / collection belonging to deleted database
    if (node.type === "entity" && node.data?.databaseId && deleteSet.has(node.data.databaseId)) {
      cascadeElements.push({
        id: node.id,
        label: getNodeLabel(node),
        type: "entity",
        category: "schema",
        description: `Table schema belonging to deleted database`,
      });
    }

    // Associated TypesNode of deleted entity or extended TypesNode
    if (
      node.type === "types" &&
      (Array.from(deletedEntityIds).some((entId) => isNodeDerivedFromEntity(node, entId, edges)) ||
        (node.data?.extendedFromNodeId && deletedTypesIds.has(node.data.extendedFromNodeId)))
    ) {
      cascadeElements.push({
        id: node.id,
        label: getNodeLabel(node),
        type: "types",
        category: "schema",
        description: `Associated TypesNode of deleted entity`,
      });
    }
  });

  // 4. Broken References (Other nodes on canvas pointing to deleted nodes)
  const brokenReferences: BrokenReferenceInfo[] = [];
  nodes.forEach((node) => {
    if (deleteSet.has(node.id)) return;

    // Check databaseId / collectionRef / targetServerId / targetEndpointId / schemaRef / transformerRef
    if (node.data?.targetServerId && deleteSet.has(node.data.targetServerId)) {
      brokenReferences.push({
        referencingNodeId: node.id,
        referencingNodeLabel: getNodeLabel(node),
        referencingNodeType: node.type || "node",
        referenceType: "targetServerId",
        description: `Target server link unlinked`,
      });
    }

    if (node.data?.targetEndpointId && deleteSet.has(node.data.targetEndpointId)) {
      brokenReferences.push({
        referencingNodeId: node.id,
        referencingNodeLabel: getNodeLabel(node),
        referencingNodeType: node.type || "node",
        referenceType: "targetEndpointId",
        description: `Target endpoint link unlinked`,
      });
    }

    if (node.data?.schemaRef && deleteSet.has(node.data.schemaRef)) {
      brokenReferences.push({
        referencingNodeId: node.id,
        referencingNodeLabel: getNodeLabel(node),
        referencingNodeType: node.type || "node",
        referenceType: "schemaRef",
        description: `Schema reference unlinked`,
      });
    }

    if (node.data?.collectionRef && deleteSet.has(node.data.collectionRef)) {
      brokenReferences.push({
        referencingNodeId: node.id,
        referencingNodeLabel: getNodeLabel(node),
        referencingNodeType: node.type || "node",
        referenceType: "collectionRef",
        description: `Vector collection reference unlinked`,
      });
    }

    if (node.data?.transformerRef && deleteSet.has(node.data.transformerRef)) {
      brokenReferences.push({
        referencingNodeId: node.id,
        referencingNodeLabel: getNodeLabel(node),
        referencingNodeType: node.type || "node",
        referenceType: "transformerRef",
        description: `Transformer reference unlinked`,
      });
    }
  });

  const totalCanvasImpactCount =
    severedConnections.length + cascadeElements.length + brokenReferences.length;

  return {
    targetNodes,
    severedConnections,
    cascadeElements,
    brokenReferences,
    totalCanvasImpactCount,
  };
}
