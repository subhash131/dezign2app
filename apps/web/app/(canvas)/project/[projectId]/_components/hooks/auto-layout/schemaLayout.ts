import { Position } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { BackendNode, BackendNodeData } from "@/types/canvas";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "./types";
import { getNodeDimensions, getIsPkNode } from "./nodeDimensions";
import { layoutSchemaRanks } from "./schemaRankLayout";
import {
  partitionEntitiesIntoFunctionalGroups,
  type SchemaFunctionalGroup,
} from "./schemaGrouping";

export interface PerformSchemaLayoutOptions {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  onNodesChange?: (changes: PositionNodeChange[]) => void;
  fitView: (options?: { duration?: number; padding?: number; maxZoom?: number }) => void;
  direction?: string;
}

interface StorageCluster {
  id: string;
  type: "database" | "redis" | "unassigned";
  storageNode?: LayoutNode;
  entities: LayoutNode[];
}

interface ClusterGroupResult {
  group: SchemaFunctionalGroup;
  position: { x: number; y: number }; // Relative to cluster origin
  width: number;
  height: number;
}

interface ClusterLayoutResult {
  cluster: StorageCluster;
  width: number;
  height: number;
  storagePosition?: { x: number; y: number };
  entityPositions: Map<string, { x: number; y: number }>;
  groupResults: ClusterGroupResult[];
}

/**
 * Computes an isolated LR Dagre + staggered ranks layout for a single storage cluster.
 * Partitions entities into common-purpose functional groups (Authentication, Application, LangGraph),
 * enclosing each group in a visual group container (SchemaGroupNode) and positioning groups side-by-side.
 * The storage node (Database or Redis Instance) is placed horizontally centered above the groups.
 */
function layoutIsolatedCluster(
  cluster: StorageCluster,
  schemaEdges: LayoutEdge[],
  existingGroupNodes: LayoutNode[] = [],
): ClusterLayoutResult {
  const entityPositions = new Map<string, { x: number; y: number }>();
  const groupResults: ClusterGroupResult[] = [];

  // 1. Cluster has no entities (e.g. empty Database or empty Redis instance)
  if (cluster.entities.length === 0) {
    if (cluster.storageNode) {
      const storageDim = getNodeDimensions(cluster.storageNode);
      return {
        cluster,
        width: storageDim.width,
        height: storageDim.height,
        storagePosition: { x: 0, y: 0 },
        entityPositions,
        groupResults: [],
      };
    }
    return {
      cluster,
      width: 0,
      height: 0,
      entityPositions,
      groupResults: [],
    };
  }

  // 2. Partition cluster entities into common-purpose functional groups
  const functionalGroups = partitionEntitiesIntoFunctionalGroups(
    cluster.entities,
    existingGroupNodes,
  );

  // Group container padding and gaps
  const GROUP_PAD_X = 36;
  const GROUP_HEADER_TOP = 130; // Header tab space at top-left to provide generous gap between group label and tables
  const GROUP_PAD_BOTTOM = 80; // Bottom clearance to ensure tall entity tables never overflow group boundary
  const GROUP_GAP_X = 100; // Side-by-side gap between groups
  const STORAGE_TO_GROUPS_GAP_Y = 130; // Vertical gap between DB node and groups

  const storageDim = cluster.storageNode
    ? getNodeDimensions(cluster.storageNode)
    : { width: 0, height: 0 };

  const groupsOffsetY = cluster.storageNode
    ? storageDim.height + STORAGE_TO_GROUPS_GAP_Y
    : 0;

  // 3. Compute layout for each functional group independently
  interface IntermediateGroupCalc {
    group: SchemaFunctionalGroup;
    groupWidth: number;
    groupHeight: number;
    localEntityPositions: Map<string, { x: number; y: number }>;
  }

  const groupCalculations: IntermediateGroupCalc[] = [];

  functionalGroups.forEach((group) => {
    const groupEntityIdSet = new Set(group.entities.map((n) => n.id));
    // Intra-group foreign key edges only
    const groupEdges = schemaEdges.filter(
      (e) => groupEntityIdSet.has(e.source) && groupEntityIdSet.has(e.target),
    );

    // Build localized Dagre graph for this group
    const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: "LR",
      marginx: 35,
      marginy: 35,
      ranksep: 260,
      nodesep: 45,
    });

    group.entities.forEach((node) => {
      const { width, height } = getNodeDimensions(node);
      dagreGraph.setNode(node.id, { width, height });
    });

    groupEdges.forEach((edge) => {
      if (edge.type === "foreign-key") {
        const sourceNode = group.entities.find((n) => n.id === edge.source);
        const targetNode = group.entities.find((n) => n.id === edge.target);

        const sourceIsPk = getIsPkNode(sourceNode, edge.sourceHandle);
        const targetIsPk = getIsPkNode(targetNode, edge.targetHandle);

        if (sourceIsPk && !targetIsPk) {
          dagreGraph.setEdge(edge.source, edge.target);
        } else if (targetIsPk && !sourceIsPk) {
          dagreGraph.setEdge(edge.target, edge.source);
        } else {
          dagreGraph.setEdge(edge.source, edge.target);
        }
      } else {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    });

    dagre.layout(dagreGraph);

    const rawLocalPositions = new Map<string, { x: number; y: number }>();
    group.entities.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const { width, height } = getNodeDimensions(node);
      if (nodeWithPosition) {
        rawLocalPositions.set(node.id, {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        });
      } else {
        rawLocalPositions.set(node.id, { x: 0, y: 0 });
      }
    });

    // Stagger schema ranks into sub-columns for balanced grid layout
    layoutSchemaRanks({
      dagreGraph,
      entityFlowNodes: group.entities,
      entityFlowEdges: groupEdges,
      positionsMap: rawLocalPositions,
    });

    // Compute bounding box of entities in this group
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    group.entities.forEach((node) => {
      const pos = rawLocalPositions.get(node.id) ?? { x: 0, y: 0 };
      const { width, height } = getNodeDimensions(node);
      if (pos.x < minX) minX = pos.x;
      if (pos.x + width > maxX) maxX = pos.x + width;
      if (pos.y < minY) minY = pos.y;
      if (pos.y + height > maxY) maxY = pos.y + height;
    });

    if (minX === Infinity) {
      minX = 0;
      maxX = 320;
      minY = 0;
      maxY = 200;
    }

    const groupEntitiesWidth = maxX - minX;
    const groupEntitiesHeight = maxY - minY;

    const groupWidth = Math.max(450, groupEntitiesWidth + GROUP_PAD_X * 2);
    const groupHeight = Math.max(340, groupEntitiesHeight + GROUP_HEADER_TOP + GROUP_PAD_BOTTOM);

    // Entity positions relative to this group container's top-left corner
    const groupLocalEntityPositions = new Map<string, { x: number; y: number }>();
    group.entities.forEach((node) => {
      const pos = rawLocalPositions.get(node.id) ?? { x: minX, y: minY };
      groupLocalEntityPositions.set(node.id, {
        x: GROUP_PAD_X + (pos.x - minX),
        y: GROUP_HEADER_TOP + (pos.y - minY),
      });
    });

    groupCalculations.push({
      group,
      groupWidth,
      groupHeight,
      localEntityPositions: groupLocalEntityPositions,
    });
  });

  // 4. Arrange groups side-by-side horizontally
  let curGroupX = 0;
  let maxGroupHeight = 0;

  const intermediateGroups: Array<{
    group: SchemaFunctionalGroup;
    localX: number;
    width: number;
    height: number;
    localEntityPositions: Map<string, { x: number; y: number }>;
  }> = [];

  groupCalculations.forEach((calc, idx) => {
    if (idx > 0) curGroupX += GROUP_GAP_X;
    intermediateGroups.push({
      group: calc.group,
      localX: curGroupX,
      width: calc.groupWidth,
      height: calc.groupHeight,
      localEntityPositions: calc.localEntityPositions,
    });
    if (calc.groupHeight > maxGroupHeight) maxGroupHeight = calc.groupHeight;
    curGroupX += calc.groupWidth;
  });

  const totalGroupsWidth = curGroupX;
  const clusterWidth = Math.max(storageDim.width, totalGroupsWidth);
  const groupsShiftX = (clusterWidth - totalGroupsWidth) / 2;

  intermediateGroups.forEach((g) => {
    const groupFinalX = g.localX + groupsShiftX;
    const groupFinalY = groupsOffsetY;
    groupResults.push({
      group: g.group,
      position: { x: groupFinalX, y: groupFinalY },
      width: g.width,
      height: g.height,
    });

    g.localEntityPositions.forEach((relPos, entityId) => {
      entityPositions.set(entityId, {
        x: groupFinalX + relPos.x,
        y: groupFinalY + relPos.y,
      });
    });
  });

  const storagePosition = cluster.storageNode
    ? {
        x: (clusterWidth - storageDim.width) / 2,
        y: 0,
      }
    : undefined;

  const clusterHeight = cluster.storageNode
    ? storageDim.height + STORAGE_TO_GROUPS_GAP_Y + maxGroupHeight
    : maxGroupHeight;

  return {
    cluster,
    width: clusterWidth,
    height: clusterHeight,
    storagePosition,
    entityPositions,
    groupResults,
  };
}

export function performSchemaLayout({
  nodes,
  edges,
  onNodesChange,
  fitView,
}: PerformSchemaLayoutOptions) {
  // Filter for Schema nodes (entity, redis_schema, database, redis_instance, transformer, group) and schema edges
  const schemaNodes = nodes.filter(
    (n) =>
      n.type === "entity" ||
      n.type === "database" ||
      n.type === "redis_instance" ||
      n.type === "redis_schema" ||
      n.type === "group",
  );
  if (schemaNodes.length === 0) return;

  const schemaEdges = edges.filter(
    (e) =>
      e.type === "foreign-key" ||
      e.type === "database-connection" ||
      e.type === "connection",
  );

  const isDatabaseNode = (n: LayoutNode) => n.type === "database";
  const isRedisNode = (n: LayoutNode) => n.type === "redis_instance";
  const isStorageNode = (n: LayoutNode) => isDatabaseNode(n) || isRedisNode(n);
  const isGroupNode = (n: LayoutNode) => n.type === "group";

  const dbNodes = schemaNodes.filter(isDatabaseNode);
  const redisNodes = schemaNodes.filter(isRedisNode);
  const existingGroupNodes = schemaNodes.filter(isGroupNode);
  const storageNodes = [...dbNodes, ...redisNodes];
  const storageNodeIdSet = new Set(storageNodes.map((n) => n.id));

  const entityNodes = schemaNodes.filter(
    (n) => !isStorageNode(n) && !isGroupNode(n),
  );

  // 1. Initialize dedicated cluster for each Database and each Redis instance
  const clustersMap = new Map<string, StorageCluster>();

  dbNodes.forEach((db) => {
    clustersMap.set(db.id, {
      id: db.id,
      type: "database",
      storageNode: db,
      entities: [],
    });
  });

  redisNodes.forEach((redis) => {
    clustersMap.set(redis.id, {
      id: redis.id,
      type: "redis",
      storageNode: redis,
      entities: [],
    });
  });

  const unassignedCluster: StorageCluster = {
    id: "__unassigned__",
    type: "unassigned",
    entities: [],
  };

  // 2. Associate each entity / redis_schema to its exact cluster
  const entityToClusterId = new Map<string, string>();

  // Signal A: Explicit databaseId match
  entityNodes.forEach((entity) => {
    const dbId = entity.data?.databaseId;
    if (dbId && clustersMap.has(dbId)) {
      entityToClusterId.set(entity.id, dbId);
    }
  });

  // Signal B: Direct connecting edge to a specific Database or Redis instance
  entityNodes.forEach((entity) => {
    if (entityToClusterId.has(entity.id)) return;
    const directEdge = schemaEdges.find(
      (e) =>
        (e.source === entity.id && storageNodeIdSet.has(e.target)) ||
        (e.target === entity.id && storageNodeIdSet.has(e.source)),
    );
    if (directEdge) {
      const targetStorageId = storageNodeIdSet.has(directEdge.source)
        ? directEdge.source
        : directEdge.target;
      if (clustersMap.has(targetStorageId)) {
        entityToClusterId.set(entity.id, targetStorageId);
      }
    }
  });

  // Signal C: Database node internal 'tables' definition matching
  dbNodes.forEach((db) => {
    const rawTables = db.data?.tables;
    if (Array.isArray(rawTables)) {
      rawTables.forEach((t) => {
        entityNodes.forEach((entity) => {
          if (entityToClusterId.has(entity.id)) return;
          const tableName = entity.data?.tableName;
          const tableRef = entity.data?.tableRef;
          if (
            (t.id && t.id === entity.id) ||
            (t.name && tableName && t.name.toLowerCase() === tableName.toLowerCase()) ||
            (t.tableRef && tableRef && t.tableRef === tableRef)
          ) {
            entityToClusterId.set(entity.id, db.id);
          }
        });
      });
    }
  });

  // Signal D: Foreign Key graph propagation
  let fkChanged = true;
  while (fkChanged) {
    fkChanged = false;
    entityNodes.forEach((entity) => {
      if (entityToClusterId.has(entity.id)) return;
      if (entity.type === "redis_schema") return;

      const fkEdge = schemaEdges.find((e) => {
        if (e.type !== "foreign-key") return false;
        if (e.source === entity.id && entityToClusterId.has(e.target)) return true;
        if (e.target === entity.id && entityToClusterId.has(e.source)) return true;
        return false;
      });

      if (fkEdge) {
        const otherEntityId =
          fkEdge.source === entity.id ? fkEdge.target : fkEdge.source;
        const parentClusterId = entityToClusterId.get(otherEntityId);
        if (parentClusterId) {
          entityToClusterId.set(entity.id, parentClusterId);
          fkChanged = true;
        }
      }
    });
  }

  // Signal E: Type and single-instance heuristics
  const defaultDbNode =
    dbNodes.find((d) => Boolean(d.data?.isDefault)) ||
    dbNodes[0];
  const defaultRedisNode =
    redisNodes.find((r) => Boolean(r.data?.isDefault)) ||
    redisNodes[0];

  entityNodes.forEach((entity) => {
    if (entityToClusterId.has(entity.id)) return;

    const isRedisEntity =
      entity.type === "redis_schema" ||
      entity.data?.dbType === "redis";

    if (isRedisEntity) {
      if (defaultRedisNode) {
        entityToClusterId.set(entity.id, defaultRedisNode.id);
      }
    } else {
      // Relational / Entity table
      if (defaultDbNode) {
        if (
          dbNodes.length === 1 ||
          Boolean(defaultDbNode.data?.isDefault)
        ) {
          entityToClusterId.set(entity.id, defaultDbNode.id);
        }
      }
    }
  });

  // Populate entities into clusters
  entityNodes.forEach((entity) => {
    const clusterId = entityToClusterId.get(entity.id);
    if (clusterId && clustersMap.has(clusterId)) {
      clustersMap.get(clusterId)!.entities.push(entity);
    } else {
      unassignedCluster.entities.push(entity);
    }
  });

  // 3. Sort clusters: Databases first (default DB first, then left-to-right), Redis instances, Unassigned
  const activeDbClusters: StorageCluster[] = dbNodes
    .slice()
    .sort((a, b) => {
      const isDefA = Boolean(a.data?.isDefault);
      const isDefB = Boolean(b.data?.isDefault);
      if (isDefA && !isDefB) return -1;
      if (!isDefA && isDefB) return 1;
      return a.position.x - b.position.x;
    })
    .map((db) => clustersMap.get(db.id)!)
    .filter(Boolean);

  const activeRedisClusters: StorageCluster[] = redisNodes
    .slice()
    .sort((a, b) => a.position.x - b.position.x)
    .map((redis) => clustersMap.get(redis.id)!)
    .filter(Boolean);

  // 4. Compute isolated layout for each individual cluster with functional grouping
  const dbResults = activeDbClusters.map((c) =>
    layoutIsolatedCluster(c, schemaEdges, existingGroupNodes),
  );
  const redisResults = activeRedisClusters.map((c) =>
    layoutIsolatedCluster(c, schemaEdges, existingGroupNodes),
  );
  const unassignedResult =
    unassignedCluster.entities.length > 0
      ? layoutIsolatedCluster(unassignedCluster, schemaEdges, existingGroupNodes)
      : null;

  // 5. Arrange clusters on the canvas with multi-tier section spacing
  const positionsMap = new Map<string, { x: number; y: number }>();
  const allFinalGroupNodes: LayoutNode[] = [];

  const START_X = 60;
  const START_Y = 60;
  const DB_GAP_X = 260; // Gap between individual database clusters
  const REDIS_GAP_X = 220; // Gap between individual Redis clusters
  const SECTION_GAP_X = 350; // Gap between Database section and Redis section

  // Determine if Redis should wrap to Row 2 if Database section is exceptionally wide (> 3500px)
  const totalDbWidth = dbResults.reduce(
    (sum, r, idx) => sum + r.width + (idx > 0 ? DB_GAP_X : 0),
    0,
  );
  const wrapRedisToNextRow =
    dbResults.length > 0 && redisResults.length > 0 && totalDbWidth > 3500;

  let curX = START_X;
  let curY = START_Y;
  let maxDbHeight = 0;

  // Helper to materialize group nodes and position them on the canvas
  const processClusterResult = (
    res: ClusterLayoutResult,
    clusterOriginX: number,
    clusterOriginY: number,
  ) => {
    if (res.storagePosition && res.cluster.storageNode) {
      positionsMap.set(res.cluster.storageNode.id, {
        x: clusterOriginX + res.storagePosition.x,
        y: clusterOriginY + res.storagePosition.y,
      });
    }

    res.cluster.entities.forEach((ent) => {
      const p = res.entityPositions.get(ent.id);
      if (p) {
        positionsMap.set(ent.id, {
          x: clusterOriginX + p.x,
          y: clusterOriginY + p.y,
        });
      }
    });

    res.groupResults.forEach((gRes) => {
      const groupAbsX = clusterOriginX + gRes.position.x;
      const groupAbsY = clusterOriginY + gRes.position.y;
      const groupId =
        gRes.group.groupNode?.id || `group-${gRes.group.key}-${res.cluster.id}`;

      positionsMap.set(groupId, {
        x: groupAbsX,
        y: groupAbsY,
      });

      const materializedGroupNode: LayoutNode = {
        id: groupId,
        type: "group",
        position: { x: groupAbsX, y: groupAbsY },
        width: gRes.width,
        height: gRes.height,
        style: { width: gRes.width, height: gRes.height },
        data: {
          ...(gRes.group.groupNode?.data || { label: gRes.group.title }),
          label: gRes.group.title,
          description: gRes.group.description,
          badge: gRes.group.badge,
          color: gRes.group.color,
        },
      };

      allFinalGroupNodes.push(materializedGroupNode);

      // Link entities to this group node
      gRes.group.entities.forEach((ent) => {
        ent.data = {
          ...ent.data,
          groupId,
          group: gRes.group.title,
        };
      });
    });
  };

  // Place Database clusters
  dbResults.forEach((res, idx) => {
    if (idx > 0) curX += DB_GAP_X;

    const clusterOriginX = curX;
    const clusterOriginY = curY;

    processClusterResult(res, clusterOriginX, clusterOriginY);

    if (res.height > maxDbHeight) maxDbHeight = res.height;
    curX += res.width;
  });

  // Place Redis clusters
  if (wrapRedisToNextRow) {
    curX = START_X;
    curY = START_Y + maxDbHeight + 260;
  } else if (dbResults.length > 0 && redisResults.length > 0) {
    curX += SECTION_GAP_X;
  }

  redisResults.forEach((res, idx) => {
    if (idx > 0) curX += REDIS_GAP_X;

    const clusterOriginX = curX;
    const clusterOriginY = curY;

    processClusterResult(res, clusterOriginX, clusterOriginY);

    curX += res.width;
  });

  const dbRowEndX = curX;

  // Place Unassigned entities (if any) to the far right
  if (unassignedResult) {
    curX += SECTION_GAP_X;
    const clusterOriginX = curX;
    const clusterOriginY = curY;

    processClusterResult(unassignedResult, clusterOriginX, clusterOriginY);
  }

  // 5.5 Position any remaining empty existing group nodes cleanly so they never overlap active clusters
  const positionedGroupIds = new Set(allFinalGroupNodes.map((g) => g.id));
  const emptyExistingGroups = existingGroupNodes.filter(
    (g) => !positionedGroupIds.has(g.id),
  );

  if (emptyExistingGroups.length > 0) {
    const EMPTY_GROUP_GAP_X = 90;
    let emptyGroupX = curX + (curX > START_X ? SECTION_GAP_X : 0);
    emptyExistingGroups.forEach((eg) => {
      const w = 450;
      const h = 280;
      positionsMap.set(eg.id, {
        x: emptyGroupX,
        y: START_Y,
      });
      allFinalGroupNodes.push({
        ...eg,
        position: { x: emptyGroupX, y: START_Y },
        width: w,
        height: h,
        style: { width: w, height: h },
      });
      emptyGroupX += w + EMPTY_GROUP_GAP_X;
    });
    curX = Math.max(curX, emptyGroupX);
  }

  // 6. Canvas origin margin check
  let globalMinX = Infinity;
  let globalMinY = Infinity;
  positionsMap.forEach((pos) => {
    if (pos.x < globalMinX) globalMinX = pos.x;
    if (pos.y < globalMinY) globalMinY = pos.y;
  });

  const shiftX = globalMinX < 60 ? 60 - globalMinX : 0;
  const shiftY = globalMinY < 60 ? 60 - globalMinY : 0;

  if (shiftX !== 0 || shiftY !== 0) {
    positionsMap.forEach((pos, id) => {
      positionsMap.set(id, {
        x: pos.x + shiftX,
        y: pos.y + shiftY,
      });
    });
    allFinalGroupNodes.forEach((gn) => {
      gn.position = {
        x: gn.position.x + shiftX,
        y: gn.position.y + shiftY,
      };
    });
  }

  // 7. Compose ordered nodes: Groups first (background layer), then storage, then entities, then transformers
  const allFinalNodes: LayoutNode[] = [
    ...allFinalGroupNodes,
    ...storageNodes,
    ...entityNodes,
  ];

  // 8. Apply node position changes (only for nodes whose position actually moved or new group containers)
  if (onNodesChange) {
    const inputNodeMap = new Map<string, LayoutNode>(nodes.map((n) => [n.id, n]));
    const nodeChanges: PositionNodeChange[] = allFinalNodes
      .filter((node) => {
        const inputNode = inputNodeMap.get(node.id);
        if (!inputNode) return true;
        const pos = positionsMap.get(node.id);
        if (!pos) return false;
        return (
          Math.abs(inputNode.position.x - pos.x) > 0.5 ||
          Math.abs(inputNode.position.y - pos.y) > 0.5
        );
      })
      .map((node: LayoutNode) => {
        const pos = positionsMap.get(node.id) ?? node.position;
        const isDb = storageNodeIdSet.has(node.id);
        return {
          id: node.id,
          type: "position",
          position: pos,
          sourcePosition: isDb ? Position.Bottom : Position.Right,
          targetPosition: isDb ? Position.Top : Position.Left,
        };
      });
    if (nodeChanges.length > 0) {
      onNodesChange(nodeChanges);
    }
  }

  // Also update store state directly with created/updated group nodes and dimensions
  try {
    useBackendCanvasStore.setState((state) => {
      const finalDataMap = new Map<string, BackendNodeData>();
      allFinalNodes.forEach((n) => {
        finalDataMap.set(n.id, n.data);
      });

      const finalGroupMap = new Map<string, LayoutNode>();
      allFinalGroupNodes.forEach((gn) => {
        finalGroupMap.set(gn.id, gn);
      });

      const existingNodeMap = new Map<string, BackendNode>();
      state.nodes.forEach((n) => {
        existingNodeMap.set(n.id, n);
      });

      const updatedExistingNodes: BackendNode[] = state.nodes.map((node) => {
        const pos = positionsMap.get(node.id);
        const finalData = finalDataMap.get(node.id);
        const isGroup = node.type === "group";
        const groupLayout = isGroup ? finalGroupMap.get(node.id) : undefined;

        if (!pos && !finalData && !groupLayout) return node;

        const isDb = storageNodeIdSet.has(node.id);

        if (isGroup && groupLayout) {
          return {
            ...node,
            position: pos ?? node.position,
            data: finalData ?? node.data,
            width: groupLayout.width,
            height: groupLayout.height,
            style: {
              ...node.style,
              width: groupLayout.width,
              height: groupLayout.height,
              zIndex: -1,
            },
            zIndex: -1,
          };
        }

        return {
          ...node,
          position: pos ?? node.position,
          data: finalData ?? node.data,
          zIndex: isGroup ? -1 : (node.zIndex ?? 1),
          sourcePosition: isDb ? Position.Bottom : Position.Right,
          targetPosition: isDb ? Position.Top : Position.Left,
        };
      });

      const newGroupNodes: BackendNode[] = allFinalGroupNodes
        .filter((g) => !existingNodeMap.has(g.id))
        .map((g) => ({
          id: g.id,
          type: "group",
          position: positionsMap.get(g.id) ?? g.position,
          data: g.data,
          fractionalIndex: "a0",
          width: g.width,
          height: g.height,
          style: {
            width: g.width ?? 0,
            height: g.height ?? 0,
          },
          zIndex: -1,
        }));

      // Only mark nodes whose coordinates or data actually changed as moved/upserted
      const movedNodeIds = new Set<string>();
      positionsMap.forEach((pos, id) => {
        const existing = existingNodeMap.get(id);
        if (!existing) {
          movedNodeIds.add(id);
          return;
        }
        const hasPosChanged =
          Math.abs(existing.position.x - pos.x) > 0.5 ||
          Math.abs(existing.position.y - pos.y) > 0.5;

        const finalData = finalDataMap.get(id);
        const hasDataChanged =
          Boolean(finalData) &&
          (existing.data?.groupId !== finalData?.groupId ||
            existing.data?.group !== finalData?.group);

        const isGroup = existing.type === "group";
        const groupLayout = isGroup ? finalGroupMap.get(id) : undefined;
        const hasSizeChanged =
          Boolean(groupLayout) &&
          (existing.width !== groupLayout?.width ||
            existing.height !== groupLayout?.height);

        if (hasPosChanged || hasDataChanged || hasSizeChanged) {
          movedNodeIds.add(id);
        }
      });

      // Keep groups first for proper rendering behind entities
      const nextNodes: BackendNode[] = [...newGroupNodes, ...updatedExistingNodes];
      const upserts: BackendNode[] = nextNodes.filter(
        (n) => movedNodeIds.has(n.id) || !existingNodeMap.has(n.id),
      );

      return {
        nodes: nextNodes,
        pendingNodeUpserts: [
          ...state.pendingNodeUpserts.filter((u) => !movedNodeIds.has(u.id)),
          ...upserts,
        ],
      };
    });
  } catch {
    // In headless test environments where store is mocked/not mounted, safely ignore
  }

  setTimeout(() => {
    fitView({ duration: 300, padding: 0.2, maxZoom: 0.85 });
  }, 50);
}
