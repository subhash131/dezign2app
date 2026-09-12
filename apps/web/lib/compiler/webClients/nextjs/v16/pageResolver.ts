import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  WebAppZone,
  ConditionNode,
  Endpoint,
  AnyMessagingResource,
  RealtimeConnection,
  PipelineStep,
} from "@workspace/canvas/types";
import { PageInfo, LinkedRealtimeConnectionInfo } from "./types";
import { labelToSlug, slugToComponentName } from "./slugUtils";
import { getServicePort } from "./endpointResolver";

/**
 * Resolves WebClient nodes and WebApp zone configurations into PageInfo metadata
 */
export function resolvePagesInfo(
  webClientNodes: BackendNode[],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  effectiveAppSlug: string = "web-app",
  webAppNode?: BackendNode,
  authNode?: BackendNode,
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
): PageInfo[] {
  const pagesInfo: PageInfo[] = [];
  const usedSlugs = new Set<string>();

  const targetWebAppNode =
    webAppNode ||
    allNodes.find(
      (n) =>
        n.type === "webApp" &&
        (n.data?.appSlug?.toLowerCase().replace(/[^a-z0-9]+/g, "-") === effectiveAppSlug ||
          n.data?.label?.toLowerCase().replace(/[^a-z0-9]+/g, "-") === effectiveAppSlug),
    ) ||
    allNodes.find((n) => n.type === "webApp");

  const defaultSignInPage = authNode?.data?.redirects?.signInPageUrl || "/login";

  const defaultZones: WebAppZone[] = [
    {
      id: "zone-public",
      name: "Public Section",
      handleId: "public-in",
      accessType: "public",
      rule: {
        id: "rule-public",
        scope: "zone",
        conditions: { kind: "leaf", condition: { type: "auth", op: "signedOut" } },
        redirects: { default: defaultSignInPage },
      },
    },
    {
      id: "zone-private",
      name: "Private Section",
      handleId: "private-in",
      accessType: "protected",
      rule: {
        id: "rule-private",
        scope: "zone",
        conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
        redirects: { "no-auth": defaultSignInPage, default: defaultSignInPage },
      },
    },
  ];

  const appZones: WebAppZone[] =
    targetWebAppNode && Array.isArray(targetWebAppNode.data?.zones) && targetWebAppNode.data.zones.length > 0
      ? targetWebAppNode.data.zones
      : defaultZones;

  webClientNodes.forEach((node, idx) => {
    const rawLabel = node.data.label || `Page ${idx + 1}`;
    let slug = labelToSlug(rawLabel, idx);

    if (usedSlugs.has(slug)) {
      slug = `${slug}-${idx + 1}`;
    }
    usedSlugs.add(slug);

    const cleanLabel = rawLabel.trim().toLowerCase();
    const isRoot =
      node.data.isRoot === true ||
      cleanLabel === "/";
    const routePath = isRoot ? "/" : `/${slug}`;
    const componentName = isRoot ? "HomePage" : slugToComponentName(slug);

    // Find edge connecting a webApp node handle to this webClient node handle
    const connectedEdge = allEdges.find((e) => {
      const isTarget = e.target === node.id;
      const isSource = e.source === node.id;
      if (!isTarget && !isSource) return false;
      const otherId = isSource ? e.target : e.source;
      return targetWebAppNode ? otherId === targetWebAppNode.id : allNodes.some((n) => n.id === otherId && n.type === "webApp");
    });

    let matchedZone: WebAppZone | undefined = undefined;
    if (connectedEdge && targetWebAppNode) {
      const sectionHandleId =
        connectedEdge.source === targetWebAppNode.id
          ? connectedEdge.sourceHandle
          : connectedEdge.targetHandle;
      matchedZone = appZones.find((z) => z.handleId === sectionHandleId);
    }

    if (!matchedZone && node.data.zoneId) {
      matchedZone = appZones.find((z) => z.id === node.data.zoneId);
    }

    let accessType: "public" | "private" | "role-gated" | "payment-gated" | "org-gated" = "public";
    let redirectTo = node.data.redirectTo || defaultSignInPage;
    let allowedOrgRoles: string[] = node.data.allowedOrgRoles || [];
    let requiredPlans: string[] = node.data.requiredPlans || [];

    if (matchedZone) {
      const isPublicZone = matchedZone.accessType === "public" || matchedZone.id === "zone-public";
      if (isPublicZone) {
        accessType = "public";
      } else {
        accessType = "private";
        if (matchedZone.rule?.redirects) {
          redirectTo =
            matchedZone.rule.redirects["no-auth"] ||
            matchedZone.rule.redirects["default"] ||
            defaultSignInPage;
        }

        if (matchedZone.rule?.conditions) {
          const extractConditions = (condNode: ConditionNode | undefined): void => {
            if (!condNode) return;
            if (condNode.kind === "leaf" && condNode.condition) {
              const cond = condNode.condition;
              if (cond.type === "orgRole" && Array.isArray(cond.values)) {
                allowedOrgRoles = [...allowedOrgRoles, ...cond.values];
              }
              if ((cond.type === "plan" || cond.type === "subscriptionStatus") && Array.isArray(cond.values)) {
                requiredPlans = [...requiredPlans, ...cond.values];
              }
            } else if (condNode.kind === "group" && Array.isArray(condNode.children)) {
              condNode.children.forEach(extractConditions);
            }
          };
          extractConditions(matchedZone.rule.conditions);
        }
      }
    } else {
      accessType = node.data.accessType || "public";
    }

    const routeGroup =
      node.data.routeGroup ||
      (accessType !== "public" ? "private" : "public");

    // Resolve real-time connections (SSE, WebSockets, etc.)
    const rawConnections: RealtimeConnection[] =
      (node.data?.realtimeConnections as RealtimeConnection[]) || [];

    const derivedConnections: RealtimeConnection[] = [];
    const checkPipelineSteps = (
      steps: PipelineStep[] | undefined,
      srcNodeId: string,
      sourceItemName?: string,
      sourceItemId?: string,
      sourceItemType?: "endpoint" | "event",
    ) => {
      if (!steps) return;
      for (const step of steps) {
        if (
          step.type === "push_to_client" &&
          step.clientDeliveryTargetPageId === node.id
        ) {
          const srcNode = allNodes.find((n) => n.id === srcNodeId);
          derivedConnections.push({
            id: step.id,
            protocol: (step.clientDeliveryProtocol as any) || "SSE",
            eventName: step.clientDeliveryEventName || sourceItemName || "message",
            room: step.clientDeliveryRoom,
            description: sourceItemName || step.name,
            sourceServiceNodeId: srcNodeId,
            sourceServiceLabel: (srcNode?.data?.label as string) || srcNode?.type || "Service",
            sourceEventId: sourceItemId,
            sourceItemName,
            sourceItemType,
          });
        }
        if (step.thenSteps) checkPipelineSteps(step.thenSteps, srcNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.elseSteps) checkPipelineSteps(step.elseSteps, srcNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.trySteps) checkPipelineSteps(step.trySteps, srcNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.catchSteps) checkPipelineSteps(step.catchSteps, srcNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.loopBody) checkPipelineSteps(step.loopBody, srcNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.switchCases) {
          step.switchCases.forEach((c) => checkPipelineSteps(c.steps, srcNodeId, sourceItemName, sourceItemId, sourceItemType));
        }
        if (step.switchDefault) checkPipelineSteps(step.switchDefault, srcNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.parallelBranches) {
          step.parallelBranches.forEach((b) => checkPipelineSteps(b.steps, srcNodeId, sourceItemName, sourceItemId, sourceItemType));
        }
      }
    };

    if (endpoints && Array.isArray(endpoints)) {
      endpoints.forEach((ep) => {
        if (ep.pipelineSteps && ep.nodeId) {
          checkPipelineSteps(ep.pipelineSteps as PipelineStep[], ep.nodeId, ep.name || "Endpoint", ep.id, "endpoint");
        }
      });
    }

    if (events && Array.isArray(events)) {
      events.forEach((ev) => {
        if (ev.pipelineSteps && ev.nodeId) {
          checkPipelineSteps(ev.pipelineSteps as PipelineStep[], ev.nodeId, ev.name || "Event", ev.id, "event");
        }
      });
    }

    // Merge manual and derived connections, avoiding duplicate IDs
    const derivedIds = new Set(derivedConnections.map((d) => d.id));
    const allCombined = [
      ...derivedConnections,
      ...rawConnections.filter((c) => !derivedIds.has(c.id)),
    ];

    const resolvedRealtime: LinkedRealtimeConnectionInfo[] = allCombined.map((conn) => {
      let serviceNode: BackendNode | undefined = undefined;
      if (conn.sourceServiceNodeId) {
        serviceNode = allNodes.find((n) => n.id === conn.sourceServiceNodeId);
      }

      if (!serviceNode) {
        const rtcEdge = allEdges.find(
          (e) =>
            e.target === node.id &&
            (e.targetHandle === `rtc-in-${conn.id}` ||
              e.targetHandle?.endsWith(conn.id) ||
              e.targetHandle === "page-in"),
        );
        if (rtcEdge) {
          const directSrc = allNodes.find((n) => n.id === rtcEdge.source);
          if (directSrc?.type === "service") {
            serviceNode = directSrc;
          } else if (directSrc?.type === "page_ref") {
            const upEdge = allEdges.find((e) => e.target === directSrc.id);
            if (upEdge) {
              serviceNode = allNodes.find((n) => n.id === upEdge.source && n.type === "service");
            }
          }
        }
      }

      if (!serviceNode) {
        for (const n of allNodes) {
          if (n.type === "service") {
            const hasMatch =
              (n.data?.endpoints as any[])?.some((ep) =>
                JSON.stringify(ep.pipelineSteps || []).includes(conn.id),
              ) ||
              (n.data?.consumedEvents as any[])?.some((ev) =>
                JSON.stringify(ev.pipelineSteps || []).includes(conn.id),
              );
            if (hasMatch) {
              serviceNode = n;
              break;
            }
          }
        }
      }

      if (!serviceNode) {
        const services = allNodes.filter((n) => n.type === "service");
        if (services.length === 1) {
          serviceNode = services[0];
        }
      }

      const port = serviceNode ? getServicePort(serviceNode) : undefined;
      const streamUrl = port ? `http://localhost:${port}/events` : undefined;

      return {
        connectionId: conn.id,
        protocol: conn.protocol || "SSE",
        eventName: conn.eventName,
        room: conn.room,
        sourceServiceNodeId: serviceNode?.id || conn.sourceServiceNodeId,
        sourceServiceName: serviceNode?.data?.label || conn.sourceServiceLabel || "Service",
        sourceEventId: conn.sourceEventId,
        description: conn.description,
        sourceServicePort: port,
        streamUrl,
      };
    });

    pagesInfo.push({
      nodeId: node.id,
      label: rawLabel,
      description: node.data.description,
      slug,
      routePath,
      componentName,
      isRoot,
      routeGroup,
      accessType,
      allowedRoles: node.data.allowedRoles,
      requiredPlans: requiredPlans.length > 0 ? Array.from(new Set(requiredPlans)) : undefined,
      allowedOrgRoles: allowedOrgRoles.length > 0 ? Array.from(new Set(allowedOrgRoles)) : undefined,
      redirectTo,
      isAuthPage: node.data.isAuthPage,
      appSlug: node.data.appSlug || effectiveAppSlug,
      appName: node.data.appName,
      realtimeConnections: resolvedRealtime.length > 0 ? resolvedRealtime : undefined,
    });
  });

  return pagesInfo;
}
