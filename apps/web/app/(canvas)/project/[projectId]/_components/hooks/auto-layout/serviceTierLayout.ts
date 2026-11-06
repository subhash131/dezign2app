import dagre from "@dagrejs/dagre";
import type { LayoutNode, LayoutEdge } from "./types";

export interface ComputeTierRanksParams {
  mainGraphNodes: LayoutNode[];
  flowEdges: LayoutEdge[];
  direction?: string;
}

export interface ComputeTierRanksResult {
  assignedRankMap: Map<string, number>;
  intraRankEdgeIds: Set<string>;
}

/**
 * Computes topological tier levels for main flow nodes:
 * - Client / Entry tier (WebApp, WebPage, Gateway, Start): Level 0 (or sequential ranks if chained, e.g. WebApp -> WebPage).
 * - All server/service nodes directly invoked by Client: Level 1 (Service Tier 1).
 * - If a Level 1 server invokes another Level 1 server, both remain at Level 1 (intra-level invocation, not pushed to Level 2).
 * - Servers invoked by Level 1 servers (not directly invoked by client): Level 2.
 * - In general, service tier is the shortest-path distance from the Client tier.
 */
export function computeTierRanks({
  mainGraphNodes,
  flowEdges,
  direction = "LR",
}: ComputeTierRanksParams): ComputeTierRanksResult {
  const assignedRankMap = new Map<string, number>();
  const intraRankEdgeIds = new Set<string>();

  if (mainGraphNodes.length === 0) {
    return { assignedRankMap, intraRankEdgeIds };
  }

  const isClientNode = (n: LayoutNode) =>
    n.type === "webApp" ||
    n.type === "webPage" ||
    n.type === "gateway" ||
    n.type === "api_gateway" ||
    n.type === "start" ||
    n.type === "START" ||
    n.type === "payments" ||
    n.type === "auth";

  const clientNodes = mainGraphNodes.filter(isClientNode);
  const clientNodeIdSet = new Set(clientNodes.map((n) => n.id));
  const nonClientNodes = mainGraphNodes.filter((n) => !clientNodeIdSet.has(n.id));
  const nonClientIdSet = new Set(nonClientNodes.map((n) => n.id));

  // 1. Compute relative ranks among Client nodes (e.g. WebApp -> WebPage)
  let maxClientRank = -1;
  if (clientNodes.length > 0) {
    const clientGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    clientGraph.setGraph({ rankdir: direction });
    clientNodes.forEach((n) => {
      clientGraph.setNode(n.id, { width: 100, height: 100 });
    });
    flowEdges.forEach((e) => {
      if (clientNodeIdSet.has(e.source) && clientNodeIdSet.has(e.target)) {
        clientGraph.setEdge(e.source, e.target);
      }
    });
    dagre.layout(clientGraph);

    clientNodes.forEach((n) => {
      const dNode = clientGraph.node(n.id) as { rank?: number } | undefined;
      const r = typeof dNode?.rank === "number" ? dNode.rank : 0;
      assignedRankMap.set(n.id, r);
      if (r > maxClientRank) maxClientRank = r;
    });
  }

  // 2. Identify Tier 1 non-client (server) nodes:
  // Any server node with a direct or bridged incoming edge from ANY client node is Tier 1.
  const serverTierMap = new Map<string, number>();

  flowEdges.forEach((e) => {
    if (clientNodeIdSet.has(e.source) && nonClientIdSet.has(e.target)) {
      serverTierMap.set(e.target, 1);
    }
  });

  // If there are no client nodes in the graph, non-client nodes with in-degree 0 act as Tier 1
  if (clientNodes.length === 0) {
    const inDegrees = new Map<string, number>();
    nonClientNodes.forEach((n) => inDegrees.set(n.id, 0));
    flowEdges.forEach((e) => {
      if (nonClientIdSet.has(e.source) && nonClientIdSet.has(e.target)) {
        inDegrees.set(e.target, (inDegrees.get(e.target) ?? 0) + 1);
      }
    });
    nonClientNodes.forEach((n) => {
      if ((inDegrees.get(n.id) ?? 0) === 0) {
        serverTierMap.set(n.id, 1);
      }
    });
  }

  // 3. BFS traversal to assign tiers to downstream server nodes:
  // - Queue initialized with all Tier 1 servers.
  // - For each u -> v: if v has no tier assigned, v gets tier = tier(u) + 1.
  // - If v already has a tier (e.g. tier 1 from client, or tier k), its tier is NOT overwritten!
  //   This guarantees that if a Tier 1 server invokes another Tier 1 server,
  //   the invoked server stays at Tier 1 (does not get pushed to Tier 2).
  const queue: string[] = Array.from(serverTierMap.keys());
  const adj = new Map<string, string[]>();
  nonClientNodes.forEach((n) => adj.set(n.id, []));

  flowEdges.forEach((e) => {
    if (nonClientIdSet.has(e.source) && nonClientIdSet.has(e.target)) {
      adj.get(e.source)?.push(e.target);
    }
  });

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currTier = serverTierMap.get(currId)!;
    const targets = adj.get(currId) || [];
    for (const tgtId of targets) {
      if (!serverTierMap.has(tgtId)) {
        serverTierMap.set(tgtId, currTier + 1);
        queue.push(tgtId);
      }
    }
  }

  // Handle any disconnected or unreachable non-client components
  nonClientNodes.forEach((n) => {
    if (!serverTierMap.has(n.id)) {
      serverTierMap.set(n.id, 1);
    }
  });

  // 4. Map server tiers to global ranks (offset by maxClientRank + 1)
  const baseServiceRank = maxClientRank + 1;
  nonClientNodes.forEach((n) => {
    const tier = serverTierMap.get(n.id) ?? 1;
    assignedRankMap.set(n.id, baseServiceRank + (tier - 1));
  });

  // 5. Identify intra-rank edges
  flowEdges.forEach((e) => {
    const srcRank = assignedRankMap.get(e.source);
    const tgtRank = assignedRankMap.get(e.target);
    if (srcRank !== undefined && tgtRank !== undefined && srcRank === tgtRank) {
      intraRankEdgeIds.add(e.id);
    }
  });

  return { assignedRankMap, intraRankEdgeIds };
}
