import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  WebAppZone,
  ConditionNode,
  Endpoint,
  AnyMessagingResource,
  RealtimeConnection,
  PipelineStep,
  RealtimeProtocol,
  computeMediaMode,
  resolveWebRtcCapabilitiesFromStep,
} from "@workspace/canvas";
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
  const defaultUnauthorizedPage = authNode?.data?.redirects?.unauthorizedUrl || "/unauthorized";
  const defaultPricingPage = authNode?.data?.redirects?.pricingUrl || "/pricing";

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
        redirects: {
          "no-auth": defaultSignInPage,
          "wrong-role": defaultUnauthorizedPage,
          "wrong-plan": defaultPricingPage,
          "no-access": defaultPricingPage,
          default: defaultSignInPage,
        },
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
    const isLayout =
      Boolean(node.data?.isLayout) ||
      cleanLabel === "layout" ||
      rawLabel.trim().toLowerCase() === "layout";
    const isRoot =
      !isLayout && (node.data.isRoot === true || cleanLabel === "/");
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

    // Trace zone hierarchy: from root parent down to matchedZone
    const zoneAncestors: WebAppZone[] = [];
    if (matchedZone) {
      let curr: WebAppZone | undefined = matchedZone;
      const seen = new Set<string>();
      while (curr && !seen.has(curr.id)) {
        seen.add(curr.id);
        zoneAncestors.unshift(curr);
        const parentZoneId: string | undefined = curr.parentId;
        curr = parentZoneId ? appZones.find((z) => z.id === parentZoneId) : undefined;
      }
    }

    let accessType: "public" | "private" | "role-gated" | "payment-gated" | "org-gated" = "public";
    let redirectTo = node.data.redirectTo || defaultSignInPage;
    let allowedOrgRoles: string[] = node.data.allowedOrgRoles || [];
    let requiredPlans: string[] = node.data.requiredPlans || [];

    if (zoneAncestors.length > 0) {
      const rootAncestor = zoneAncestors[0];
      const isPublicRoot =
        rootAncestor !== undefined &&
        (rootAncestor.accessType === "public" || rootAncestor.id === "zone-public");
      if (isPublicRoot && zoneAncestors.length === 1) {
        accessType = "public";
      } else {
        accessType = "private";
        for (const ancestor of zoneAncestors) {
          if (ancestor.rule?.redirects) {
            redirectTo =
              ancestor.rule.redirects["no-auth"] ||
              ancestor.rule.redirects["default"] ||
              defaultSignInPage;
          }

          if (ancestor.rule?.conditions) {
            const extractConditions = (condNode: ConditionNode | undefined): void => {
              if (!condNode) return;
              if (condNode.kind === "leaf" && condNode.condition) {
                const cond = condNode.condition;
                if (cond.type === "orgRole" && Array.isArray(cond.values)) {
                  allowedOrgRoles = [...allowedOrgRoles, ...cond.values];
                  accessType = "org-gated";
                  redirectTo =
                    ancestor.rule?.redirects?.["wrong-role"] ||
                    ancestor.rule?.redirects?.["no-access"] ||
                    ancestor.rule?.redirects?.["default"] ||
                    defaultUnauthorizedPage;
                }
                if (cond.type === "orgRole" && Array.isArray(cond.values)) {
                  accessType = "role-gated";
                  redirectTo =
                    ancestor.rule?.redirects?.["wrong-role"] ||
                    ancestor.rule?.redirects?.["no-access"] ||
                    ancestor.rule?.redirects?.["default"] ||
                    defaultUnauthorizedPage;
                }
                if ((cond.type === "plan" || cond.type === "subscriptionStatus") && Array.isArray(cond.values)) {
                  requiredPlans = [...requiredPlans, ...cond.values];
                  accessType = "payment-gated";
                  redirectTo =
                    ancestor.rule?.redirects?.["wrong-plan"] ||
                    ancestor.rule?.redirects?.["no-access"] ||
                    ancestor.rule?.redirects?.["default"] ||
                    defaultPricingPage;
                }
              } else if (condNode.kind === "group" && Array.isArray(condNode.children)) {
                condNode.children.forEach(extractConditions);
              }
            };
            extractConditions(ancestor.rule.conditions);
          }
        }
      }
    } else {
      accessType = node.data.accessType || "public";
    }

    const zoneToGroupSlug = (z: WebAppZone) => {
      if (z.id === "zone-public" || z.accessType === "public") return "public";
      if (z.id === "zone-private") return "private";
      return labelToSlug(z.name, 0);
    };

    let routeGroupHierarchy: string[] = [];
    if (zoneAncestors.length > 0) {
      routeGroupHierarchy = zoneAncestors.map(zoneToGroupSlug);
    } else if (node.data.routeGroup) {
      routeGroupHierarchy = [node.data.routeGroup];
    } else {
      routeGroupHierarchy = [accessType !== "public" ? "private" : "public"];
    }

    const routeGroup =
      node.data.routeGroup ||
      routeGroupHierarchy[routeGroupHierarchy.length - 1] ||
      (accessType !== "public" ? "private" : "public");

    const routeGroupPath = routeGroupHierarchy.map((g) => `(${g})`).join("/");

    // Resolve real-time connections (SSE, WebSockets, etc.)
    const rawConnections: RealtimeConnection[] =
      node.data?.realtimeConnections || [];

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
        let isTargetPage = step.clientDeliveryTargetPageId === node.id;
        if (!isTargetPage && step.clientDeliveryPageRefNodeId) {
          const pr = allNodes.find(
            (n) =>
              n.id === step.clientDeliveryPageRefNodeId &&
              n.type === "page_ref" &&
              (n.data?.targetPageId === node.id || n.data?.pageRefId === node.id),
          );
          if (pr) isTargetPage = true;
        }
        if (!isTargetPage) {
          const edgeToPageRef = allEdges.find(
            (e) =>
              e.source === srcNodeId &&
              (!sourceItemId || !e.sourceHandle || e.sourceHandle.includes(sourceItemId)) &&
              allNodes.some(
                (n) =>
                  n.id === e.target &&
                  n.type === "page_ref" &&
                  (n.data?.targetPageId === node.id || n.data?.pageRefId === node.id),
              ),
          );
          if (edgeToPageRef) isTargetPage = true;
        }

        const isLangGraphStreaming =
          step.type === "langgraph_invoke" &&
          step.langGraphStreamingEnabled &&
          (step.langGraphStreamingProtocol === "sse" ||
            step.langGraphStreamingProtocol === "websocket" ||
            !step.langGraphStreamingProtocol) &&
          isTargetPage;

        if (
          (step.type === "push_to_client" && isTargetPage) ||
          isLangGraphStreaming
        ) {
          const srcNode = allNodes.find((n) => n.id === srcNodeId);
          const stepProtocol = isLangGraphStreaming
            ? (step.langGraphStreamingProtocol === "websocket" ? "WEBSOCKET" : "SSE")
            : step.clientDeliveryProtocol;
          const deliveryProto: RealtimeProtocol =
            stepProtocol === "WEBSOCKET"
              ? "WEBSOCKET"
              : stepProtocol === "WEBRTC"
              ? "WEBRTC"
              : stepProtocol === "API_PUSH"
              ? "API_PUSH"
              : "SSE";

          const isStepRtc = deliveryProto === "WEBRTC";
          const stepCaps = isStepRtc
            ? resolveWebRtcCapabilitiesFromStep(step)
            : undefined;

          derivedConnections.push({
            id: step.id,
            protocol: deliveryProto,
            eventName:
              step.clientDeliveryEventName ||
              (isLangGraphStreaming
                ? deliveryProto === "WEBSOCKET"
                  ? "agent_stream"
                  : (sourceItemName || "message")
                : sourceItemName || "message"),
            room: step.clientDeliveryRoom || step.langGraphStreamingRoom,
            mediaMode: isStepRtc
              ? (stepCaps ? computeMediaMode(stepCaps) : (step.clientDeliveryMediaMode || "data"))
              : undefined,
            enableDataChannel: stepCaps ? stepCaps.enableDataChannel : (step.clientDeliveryEnableDataChannel !== false),
            enableMic: stepCaps ? stepCaps.enableMic : false,
            enableSpeaker: stepCaps ? stepCaps.enableSpeaker : false,
            enableCamera: stepCaps ? stepCaps.enableCamera : false,
            enableScreenShare: stepCaps ? stepCaps.enableScreenShare : false,
            enableRemoteVideo: stepCaps ? stepCaps.enableRemoteVideo : false,
            iceServerUrl: step.clientDeliveryIceServer,
            description: sourceItemName || step.name,
            sourceServiceNodeId: srcNodeId,
            sourceServiceLabel: srcNode?.data?.label || srcNode?.type || "Service",
            sourceEventId: sourceItemId,
            sourceItemName,
            sourceItemType,
            isLangGraph: isLangGraphStreaming,
            langGraphStreamModes: isLangGraphStreaming ? step.langGraphStreamModes : undefined,
            langGraphStreamingFields: isLangGraphStreaming ? step.langGraphStreamingFields : undefined,
            langGraphStreamIncludeReasoning: isLangGraphStreaming ? step.langGraphStreamIncludeReasoning : undefined,
            langGraphTargetNodeId: isLangGraphStreaming ? step.langGraphTargetNodeId : undefined,
            pathParamBindings: step.clientDeliveryPathParamBindings,
            queryParamBindings: step.clientDeliveryQueryParamBindings,
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
          checkPipelineSteps(ep.pipelineSteps, ep.nodeId, ep.name || "Endpoint", ep.id, "endpoint");
        }
      });
    }

    if (events && Array.isArray(events)) {
      events.forEach((ev) => {
        if (ev.pipelineSteps && ev.nodeId) {
          checkPipelineSteps(ev.pipelineSteps, ev.nodeId, ev.name || "Event", ev.id, "event");
        }
      });
    }

    // Also check embedded endpoints/consumedEvents in service nodes on canvas that may not be in top-level array
    allNodes.forEach((n) => {
      if (n.type === "service" && Array.isArray(n.data?.endpoints)) {
        n.data.endpoints.forEach((ep) => {
          if (!endpoints?.some((e) => e.id === ep.id) && ep.pipelineSteps) {
            checkPipelineSteps(ep.pipelineSteps, n.id, ep.name || "Endpoint", ep.id, "endpoint");
          }
        });
      }
      if (n.type === "service" && Array.isArray(n.data?.consumedEvents)) {
        n.data.consumedEvents.forEach((ev) => {
          if (!events?.some((e) => e.id === ev.id) && ev.pipelineSteps) {
            checkPipelineSteps(ev.pipelineSteps, n.id, ev.name || "Event", ev.id, "event");
          }
        });
      }
    });

    // Merge manual and derived connections, avoiding duplicate IDs or duplicate service assignments
    const derivedIds = new Set(derivedConnections.map((d) => d.id));
    const derivedServiceIds = new Set(
      derivedConnections.map((d) => d.sourceServiceNodeId).filter(Boolean),
    );

    // Filter raw connections: remove any that match derived IDs OR are manual connections
    // whose target service is already covered by an active pipeline derived connection on this page
    const filteredRaw = rawConnections.filter((c) => {
      if (derivedIds.has(c.id)) return false;
      if (c.sourceServiceNodeId && derivedServiceIds.has(c.sourceServiceNodeId)) {
        return false;
      }
      // Check if manual connection edge links to a service that is already covered by derived connections
      const edgeToPage = allEdges.find(
        (e) =>
          e.target === node.id &&
          (e.targetHandle === `rtc-in-${c.id}` ||
            e.targetHandle?.endsWith(c.id) ||
            e.targetHandle === "page-in"),
      );
      if (edgeToPage) {
        const src = allNodes.find((n) => n.id === edgeToPage.source);
        const resolvedSrcId =
          src?.type === "service"
            ? src.id
            : src?.type === "page_ref"
            ? allEdges.find((e) => e.target === src.id)?.source
            : undefined;
        if (resolvedSrcId && derivedServiceIds.has(resolvedSrcId)) {
          return false;
        }
      }
      // If derived connections exist and there's only one service, deduplicate manual RTC conns for the same service
      if (derivedConnections.length > 0 && derivedServiceIds.size === 1 && c.protocol === "WEBRTC") {
        return false;
      }
      return true;
    });

    const allCombined = [...derivedConnections, ...filteredRaw];

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
            const endpoints = Array.isArray(n.data?.endpoints) ? n.data.endpoints : [];
            const consumedEvents = Array.isArray(n.data?.consumedEvents) ? n.data.consumedEvents : [];
            const hasMatch =
              endpoints.some((ep) =>
                JSON.stringify(ep.pipelineSteps || []).includes(conn.id),
              ) ||
              consumedEvents.some((ev) =>
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

      const rawProtocol = String(conn.protocol || "SSE").toUpperCase();
      const protocol: RealtimeProtocol =
        rawProtocol === "WS" || rawProtocol === "WEBSOCKET"
          ? "WEBSOCKET"
          : rawProtocol === "WEBRTC"
          ? "WEBRTC"
          : rawProtocol === "POLLING"
          ? "POLLING"
          : rawProtocol === "API_PUSH"
          ? "API_PUSH"
          : "SSE";

      const port = serviceNode ? getServicePort(serviceNode) : undefined;
      let streamUrl: string | undefined = conn.streamUrl;
      if (port && !streamUrl) {
        if (protocol === "WEBSOCKET" || protocol === "WEBRTC") {
          streamUrl = `ws://localhost:${port}/ws`;
        } else {
          streamUrl = `http://localhost:${port}/events`;
        }
      }

      const isRtc = protocol === "WEBRTC";
      const isExplicitDataMode = isRtc && conn.mediaMode === "data";

      const enableDataChannel = isRtc
        ? (conn.enableDataChannel !== undefined ? conn.enableDataChannel : true)
        : false;
      const enableMic = isRtc && !isExplicitDataMode
        ? (conn.enableMic !== undefined
            ? Boolean(conn.enableMic)
            : conn.enableAudio !== undefined
            ? Boolean(conn.enableAudio)
            : Boolean(conn.mediaMode === "audio" || conn.mediaMode === "audio-video"))
        : false;
      const enableSpeaker = isRtc && !isExplicitDataMode
        ? (conn.enableSpeaker !== undefined
            ? Boolean(conn.enableSpeaker)
            : Boolean(conn.mediaMode === "audio" || conn.mediaMode === "audio-video"))
        : false;
      const enableCamera = isRtc && !isExplicitDataMode
        ? (conn.enableCamera !== undefined
            ? Boolean(conn.enableCamera)
            : conn.enableVideo !== undefined
            ? Boolean(conn.enableVideo)
            : Boolean(conn.mediaMode === "video" || conn.mediaMode === "audio-video"))
        : false;
      const enableScreenShare = isRtc && !isExplicitDataMode ? Boolean(conn.enableScreenShare) : false;
      const enableRemoteVideo = isRtc && !isExplicitDataMode
        ? (conn.enableRemoteVideo !== undefined
            ? Boolean(conn.enableRemoteVideo)
            : conn.enableVideo !== undefined
            ? Boolean(conn.enableVideo)
            : Boolean(conn.mediaMode === "video" || conn.mediaMode === "audio-video"))
        : false;

      const hasAnyAudio = Boolean(enableMic || enableSpeaker);
      const hasAnyVideo = Boolean(enableCamera || enableScreenShare || enableRemoteVideo);
      const computedMediaMode = isRtc
        ? (!hasAnyAudio && !hasAnyVideo
            ? "data"
            : hasAnyAudio && hasAnyVideo
            ? "audio-video"
            : hasAnyAudio
            ? "audio"
            : "video")
        : undefined;

      return {
        id: conn.id,
        connectionId: conn.id,
        protocol,
        eventName: conn.eventName,
        room: conn.room,
        mediaMode: computedMediaMode,
        enableDataChannel,
        enableMic,
        enableSpeaker,
        enableCamera,
        enableScreenShare,
        enableRemoteVideo,
        peerRole: isRtc ? (conn.peerRole || "peer") : undefined,
        iceServerUrl: isRtc ? conn.iceServerUrl : undefined,
        sourceServiceNodeId: serviceNode?.id || conn.sourceServiceNodeId,
        sourceServiceName: serviceNode?.data?.label || conn.sourceServiceLabel || "Service",
        sourceEventId: conn.sourceEventId,
        description: conn.description,
        sourceServicePort: port,
        streamUrl,
        storeActionBinding: conn.storeActionBinding,
        storeActionBindings: conn.storeActionBindings,
        actionSteps: conn.actionSteps,
        isLangGraph: conn.isLangGraph,
        langGraphStreamModes: conn.langGraphStreamModes,
        langGraphStreamingFields: conn.langGraphStreamingFields,
        langGraphStreamIncludeReasoning: conn.langGraphStreamIncludeReasoning,
        langGraphTargetNodeId: conn.langGraphTargetNodeId,
        pathParamBindings: conn.pathParamBindings,
        queryParamBindings: conn.queryParamBindings,
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
      isLayout,
      routeGroup,
      routeGroupHierarchy,
      routeGroupPath,
      accessType,
      allowedRoles: node.data.allowedRoles,
      requiredPlans: requiredPlans.length > 0 ? Array.from(new Set(requiredPlans)) : undefined,
      allowedOrgRoles: allowedOrgRoles.length > 0 ? Array.from(new Set(allowedOrgRoles)) : undefined,
      redirectTo,
      isAuthPage: node.data.isAuthPage,
      appSlug: node.data.appSlug || effectiveAppSlug,
      appName: node.data.appName,
      realtimeConnections: resolvedRealtime.length > 0 ? resolvedRealtime : undefined,
      pathParams: node.data?.pathParams,
      queryParams: node.data?.queryParams,
      isDynamic: Boolean(
        node.data?.pathParams?.length ||
        (routePath && /(?:\/|^):[a-zA-Z0-9_-]+|\[[a-zA-Z0-9_.-]+\]/.test(routePath)) ||
        resolvedRealtime.some(
          (c) =>
            (c.pathParamBindings && Object.keys(c.pathParamBindings).length > 0) ||
            (c.queryParamBindings && Object.keys(c.queryParamBindings).length > 0),
        ),
      ),
    });
  });

  return pagesInfo;
}
