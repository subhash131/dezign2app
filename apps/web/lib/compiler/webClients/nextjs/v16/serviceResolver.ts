import { BackendNode, BackendEdge } from "@/types/canvas";

/**
 * Checks if a ServiceNode with techStack: "nextjs" is associated with a specific WebAppNode.
 */
export function isServiceAssociatedWithWebApp(
  srvNode: BackendNode,
  webAppNode: BackendNode | undefined,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  webClientNodes: BackendNode[] = [],
): boolean {
  if (srvNode.type !== "service" || srvNode.data?.techStack !== "nextjs") {
    return false;
  }
  if (!webAppNode) {
    return false;
  }

  // 1. Direct targetWebAppId matching
  if (srvNode.data?.targetWebAppId) {
    return srvNode.data.targetWebAppId === webAppNode.id;
  }

  // 2. Direct edge to webAppNode
  const hasWebAppEdge = (allEdges || []).some(
    (e) =>
      (e.source === webAppNode.id && e.target === srvNode.id) ||
      (e.target === webAppNode.id && e.source === srvNode.id),
  );
  if (hasWebAppEdge) return true;

  // 3. Edge to any page belonging to this webApp
  const webClientNodeIds = new Set(webClientNodes.map((p) => p.id));
  const hasPageEdge = (allEdges || []).some(
    (e) =>
      (webClientNodeIds.has(e.source) && e.target === srvNode.id) ||
      (webClientNodeIds.has(e.target) && e.source === srvNode.id),
  );
  if (hasPageEdge) return true;

  // 4. Fallback: If only 1 webApp in graph, associate it with this webApp
  const allWebApps = (allNodes || []).filter((node) => node.type === "webApp");
  if (allWebApps.length <= 1) return true;

  return false;
}

/**
 * Checks if a ServiceNode with techStack: "nextjs" is associated with ANY WebAppNode on the canvas.
 */
export function isServiceAssociatedWithAnyWebApp(
  srvNode: BackendNode,
  webAppNodes: BackendNode[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): boolean {
  if (srvNode.type !== "service" || srvNode.data?.techStack !== "nextjs") {
    return false;
  }
  if (webAppNodes.length === 0) {
    return false;
  }

  // 1. Direct targetWebAppId matching
  if (
    srvNode.data?.targetWebAppId &&
    webAppNodes.some((w) => w.id === srvNode.data?.targetWebAppId)
  ) {
    return true;
  }

  // 2. Direct edge to any webAppNode
  const hasWebAppEdge = (allEdges || []).some(
    (e) =>
      (webAppNodes.some((w) => w.id === e.source) && e.target === srvNode.id) ||
      (webAppNodes.some((w) => w.id === e.target) && e.source === srvNode.id),
  );
  if (hasWebAppEdge) return true;

  // 3. Edge to any page node in the graph
  const webPageNodes = allNodes.filter((n) => n.type === "webPage");
  const webPageNodeIds = new Set(webPageNodes.map((p) => p.id));
  const hasPageEdge = (allEdges || []).some(
    (e) =>
      (webPageNodeIds.has(e.source) && e.target === srvNode.id) ||
      (webPageNodeIds.has(e.target) && e.source === srvNode.id),
  );
  if (hasPageEdge) return true;

  // 4. Fallback: If only 1 webApp in graph, associate with it
  if (webAppNodes.length === 1) return true;

  return false;
}
