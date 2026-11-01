import {
  BackendNode,
  BackendEdge,
  Endpoint,
  PageSection,
  UIEventItem,
  FrontendActionStepDraft,
  RealtimeConnection,
} from "@/types/canvas";
import { ConnectionContext } from "../types";
import { buildInitialBindingsFromEndpoint } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/web-page-event-config/action-flow/utils";
import {
  isStorageRefNode,
  findTargetWebAppsForPage,
  syncServiceBaseUrlToWebApp,
} from "../utils";
import { toast } from "sonner";
import { toVarName } from "@/lib/compiler/utils";

/**
 * Handles WebPage action/event connections:
 * When an edge is drawn from a WebPage action handle (events-*, event-in-*, pageload-in-*)
 * to a Service endpoint, Storage bucket, or Transformer node, automatically configures the corresponding
 * request or transform step in the action's `actionSteps`!
 */
export function handleWebPageActionConnect({
  set,
  get,
  connection,
  sourceNode,
  targetNode,
  newEdge,
}: ConnectionContext): boolean {
  const isSourceWebPage = sourceNode.type === "webPage";
  const isTargetWebPage = targetNode.type === "webPage";

  if (!isSourceWebPage && !isTargetWebPage) return false;

  const webPageNode = isSourceWebPage ? sourceNode : targetNode;
  const otherNode = isSourceWebPage ? targetNode : sourceNode;
  const webHandle = isSourceWebPage
    ? (connection.sourceHandle ?? "")
    : (connection.targetHandle ?? "");
  const otherHandle = isSourceWebPage
    ? (connection.targetHandle ?? "")
    : (connection.sourceHandle ?? "");

  const isActionHandle =
    webHandle.startsWith("events-") ||
    webHandle.startsWith("event-in-") ||
    webHandle.startsWith("pageload-in-") ||
    webHandle.startsWith("action-in-") ||
    webHandle.startsWith("rtc-out-") ||
    webHandle.startsWith("rtc-in-");

  if (!isActionHandle) return false;

  const actionId = webHandle.replace(
    /^(?:events-|event-in-|pageload-in-|action-in-|rtc-out-|rtc-in-)/,
    "",
  );

  const isServiceTarget =
    otherNode.type === "service" ||
    otherNode.type === "serverless" ||
    otherNode.type === "worker" ||
    otherNode.type === "api_gateway" ||
    otherNode.type === "langgraph" ||
    otherNode.type === "external" ||
    Boolean(otherNode.data?.endpoints && otherNode.data.endpoints.length > 0) ||
    Boolean(otherNode.data?.routeGroups && otherNode.data.routeGroups.length > 0);

  const isStorageTarget =
    isStorageRefNode(otherNode.type) || otherNode.type === "storage";

  const isTransformerTarget =
    otherNode.type === "transformer" || otherNode.type === "transformer_ref";

  const isBrowserStorageTarget = otherNode.type === "browser_storage";

  if (!isServiceTarget && !isStorageTarget && !isTransformerTarget && !isBrowserStorageTarget) return false;

  // 1. Determine if this WebPage is on a protected route
  const currentNodes = get().nodes;
  const currentEdges = get().edges;
  const webAppNode = currentNodes.find((n) => n.type === "webApp");
  const isConnectedToPrivateZone = currentEdges.some((e) => {
    if (
      (e.source === webAppNode?.id && e.target === webPageNode.id) ||
      (e.target === webAppNode?.id && e.source === webPageNode.id)
    ) {
      const zoneHandle =
        e.source === webAppNode?.id ? e.sourceHandle : e.targetHandle;
      return (
        zoneHandle === "private-in" ||
        zoneHandle?.toLowerCase().includes("private") ||
        zoneHandle?.toLowerCase().includes("protect")
      );
    }
    return false;
  });

  const isProtected =
    Boolean(webPageNode.data?.requireAuth) || isConnectedToPrivateZone;

  let configuredStep: FrontendActionStepDraft | null = null;
  let targetDesc = "";

  if (isServiceTarget) {
    const cleanedHandleId = otherHandle
      .replace(/^(?:routeEndpoints|endpoints|endpoint)-(?:in|out)-/, "")
      .replace(/^func-(?:in-)?/, "");

    const allEndpoints = get().endpoints;
    const storeEndpoints = allEndpoints.filter(
      (e) => e.nodeId === otherNode.id,
    );
    const directEndpoints: Endpoint[] = otherNode.data?.endpoints || [];
    const routeGroupEndpoints: Endpoint[] = (otherNode.data?.routeGroups || []).flatMap(
      (g) => g.endpoints || [],
    );

    const candidateEndpoints: Endpoint[] = [];
    const seenEndpointIds = new Set<string>();

    for (const ep of [...storeEndpoints, ...directEndpoints, ...routeGroupEndpoints]) {
      if (ep.id && !seenEndpointIds.has(ep.id)) {
        seenEndpointIds.add(ep.id);
        candidateEndpoints.push(ep);
      }
    }

    let endpoint: Endpoint | undefined = candidateEndpoints.find(
      (e) =>
        e.id === cleanedHandleId ||
        e.name === cleanedHandleId ||
        `/${e.name}` === cleanedHandleId ||
        e.name === `/${cleanedHandleId}` ||
        (Boolean(cleanedHandleId) &&
          (e.id.includes(cleanedHandleId) || cleanedHandleId.includes(e.id))),
    );

    if (!endpoint && candidateEndpoints.length > 0) {
      endpoint = candidateEndpoints[0];
    }

    if (!endpoint) {
      const fallbackId = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fallbackName = `/api/${actionId || "action"}`;
      const newEp: Endpoint = {
        id: fallbackId,
        name: fallbackName,
        type: "POST",
        summary: `Endpoint for ${actionId || "action"}`,
      };
      endpoint = newEp;
      get().updateNode(otherNode.id, {
        data: {
          ...otherNode.data,
          endpoints: [...directEndpoints, newEp],
        },
      });
    }

    targetDesc = `${endpoint.type || "POST"} ${endpoint.name || "endpoint"}`;
    const requestBindings = buildInitialBindingsFromEndpoint(
      endpoint,
      isProtected,
    );

    configuredStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order: 1, // Will be updated to actual sequence index below
      type: "api_call",
      name: endpoint.name
        ? `${endpoint.type || "POST"} ${endpoint.name}`
        : `Call Endpoint`,
      edgeId: newEdge.id,
      serviceNodeId: otherNode.id,
      endpointId: endpoint.id,
      requestBindings,
    };
  } else if (isStorageTarget) {
    const opName =
      otherHandle.replace(/^func-(?:in-)?/, "") || "uploadObject";
    const storageNodeId =
      otherNode.data?.storageNodeId ||
      (otherNode.type === "storage" ? otherNode.id : undefined);
    const bucketId =
      otherNode.data?.bucketId ||
      otherNode.data?.bucketName ||
      "default-bucket";
    const bucketName =
      otherNode.data?.bucketName || otherNode.data?.label || bucketId;

    targetDesc = `storage bucket ${bucketName}`;
    configuredStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order: 1,
      type: "storage_put",
      name: `Upload to ${bucketName}`,
      edgeId: newEdge.id,
      storageNodeId,
      storageRefNodeId: otherNode.id,
      bucketId,
      bucketName,
      presignedUrlSource: { stepId: "", fieldPath: "presignedUrl" },
      fileSource: { kind: "user_input", key: "file" },
      contentType: "application/octet-stream",
    };
  } else if (isTransformerTarget) {
    const trName =
      otherNode.data?.label || otherNode.data?.functionName || "transformer";
    const cleanFn = toVarName(trName);
    const defaultVar = `${cleanFn}Result`;
    const isGlobal =
      otherNode.data?.scope === "global" || otherNode.type === "transformer_ref";
    const masterId =
      otherNode.type === "transformer_ref"
        ? otherNode.data?.transformerRef || otherNode.id
        : otherNode.id;

    targetDesc = `transformer ${trName}`;
    configuredStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order: 1,
      type: "transform",
      name: defaultVar,
      outputVariable: defaultVar,
      transformerNodeId: masterId,
      transformerRefNodeId:
        otherNode.type === "transformer_ref" ? otherNode.id : undefined,
      transformerName: trName,
      edgeId: newEdge.id,
      functionRef: {
        name: cleanFn,
        importPath: isGlobal
          ? "@workspace/transformers"
          : `../transformers/${cleanFn}`,
        isGlobal,
        inputSchema: otherNode.data?.inputSchema,
        returnSchema: otherNode.data?.returnSchema,
      },
      transformBindings: (otherNode.data?.inputSchema || []).map(
        (field: { name: string }) => ({
          argName: field.name,
          source: { kind: "literal", value: "" },
        }),
      ),
    };
  } else if (isBrowserStorageTarget) {
    const sName =
      otherNode.data?.storageName || otherNode.data?.label || "BrowserStorage";
    const keys = otherNode.data?.keys || [];
    const firstKey = keys[0]?.name || "auth_token";
    const engine = otherNode.data?.storageEngine || "localStorage";

    targetDesc = `browser storage ${sName}`;
    configuredStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order: 1,
      type: "browser_storage",
      name: `${engine}.${firstKey}`,
      edgeId: newEdge.id,
      browserStorageNodeId: otherNode.id,
      storageEngine: engine,
      storageOperation: "set",
      storageKey: firstKey,
      storageValueSource: { kind: "literal", value: "" },
    };
  }

  if (!configuredStep) return false;

  let foundAction = false;
  let actionName = "";
  let calculatedStepNumber = 1;

  const stepTemplate: FrontendActionStepDraft = configuredStep;

  // Update in sections -> actions
  const sections: PageSection[] = webPageNode.data?.sections || [];
  const updatedSections = sections.map((sec) => ({
    ...sec,
    actions: (sec.actions || []).map((act) => {
      if (act.id === actionId) {
        foundAction = true;
        actionName = act.name || "Action";
        const existingSteps: FrontendActionStepDraft[] = act.actionSteps || [];
        const existingIdx = existingSteps.findIndex(
          (s) =>
            s.edgeId === newEdge.id ||
            (stepTemplate.type === "api_call" &&
              s.serviceNodeId === stepTemplate.serviceNodeId &&
              s.endpointId === stepTemplate.endpointId) ||
            (stepTemplate.type === "storage_put" &&
              s.storageRefNodeId === stepTemplate.storageRefNodeId &&
              s.bucketId === stepTemplate.bucketId) ||
            (stepTemplate.type === "transform" &&
              (s.transformerRefNodeId === stepTemplate.transformerRefNodeId ||
                s.transformerNodeId === stepTemplate.transformerNodeId)),
        );

        calculatedStepNumber =
          existingIdx >= 0
            ? (existingSteps[existingIdx]?.order ?? 1)
            : existingSteps.length + 1;

        const stepToApply: FrontendActionStepDraft = {
          ...stepTemplate,
          order: calculatedStepNumber,
          id: existingIdx >= 0 ? (existingSteps[existingIdx]?.id ?? stepTemplate.id) : stepTemplate.id,
        };

        const nextSteps =
          existingIdx >= 0
            ? existingSteps.map((s, i) =>
                i === existingIdx ? stepToApply : s,
              )
            : [...existingSteps, stepToApply];

        return {
          ...act,
          actionSteps: nextSteps,
          ...(stepToApply.type === "storage_put"
            ? {
                storageOperationBinding: {
                  storageNodeId: stepToApply.storageNodeId,
                  bucketId: stepToApply.bucketId!,
                  operationName: "uploadObject",
                  refNodeId: stepToApply.storageRefNodeId,
                },
              }
            : {}),
        };
      }
      return act;
    }),
  }));

  // Also check webPageNode.data?.events
  const events: UIEventItem[] = webPageNode.data?.events || [];
  const updatedEvents = events.map((evt) => {
    if (evt.id === actionId) {
      foundAction = true;
      actionName = evt.name || "Event";
      const existingSteps: FrontendActionStepDraft[] = evt.actionSteps || [];
      const existingIdx = existingSteps.findIndex(
        (s) =>
          s.edgeId === newEdge.id ||
          (stepTemplate.type === "api_call" &&
            s.serviceNodeId === stepTemplate.serviceNodeId &&
            s.endpointId === stepTemplate.endpointId) ||
          (stepTemplate.type === "storage_put" &&
            s.storageRefNodeId === stepTemplate.storageRefNodeId &&
            s.bucketId === stepTemplate.bucketId) ||
          (stepTemplate.type === "transform" &&
            (s.transformerRefNodeId === stepTemplate.transformerRefNodeId ||
              s.transformerNodeId === stepTemplate.transformerNodeId)),
      );

      calculatedStepNumber =
        existingIdx >= 0
          ? (existingSteps[existingIdx]?.order ?? 1)
          : existingSteps.length + 1;

      const stepToApply: FrontendActionStepDraft = {
        ...stepTemplate,
        order: calculatedStepNumber,
        id: existingIdx >= 0 ? (existingSteps[existingIdx]?.id ?? stepTemplate.id) : stepTemplate.id,
      };

      const nextSteps =
        existingIdx >= 0
          ? existingSteps.map((s, i) =>
              i === existingIdx ? stepToApply : s,
            )
          : [...existingSteps, stepToApply];

      return {
        ...evt,
        actionSteps: nextSteps,
      };
    }
    return evt;
  });

  const realtimeConnections: RealtimeConnection[] = webPageNode.data?.realtimeConnections || [];
  let updatedRealtime = realtimeConnections;
  if (!foundAction && realtimeConnections.some((c) => c.id === actionId)) {
    updatedRealtime = realtimeConnections.map((c) => {
      if (c.id === actionId) {
        foundAction = true;
        actionName = c.eventName || c.description || "Realtime connection";
        const existingSteps: FrontendActionStepDraft[] = c.actionSteps || [];
        const existingIdx = existingSteps.findIndex(
          (s) =>
            s.edgeId === newEdge.id ||
            (stepTemplate.type === "api_call" &&
              s.serviceNodeId === stepTemplate.serviceNodeId &&
              s.endpointId === stepTemplate.endpointId) ||
            (stepTemplate.type === "storage_put" &&
              s.storageRefNodeId === stepTemplate.storageRefNodeId &&
              s.bucketId === stepTemplate.bucketId) ||
            (stepTemplate.type === "transform" &&
              (s.transformerRefNodeId === stepTemplate.transformerRefNodeId ||
                s.transformerNodeId === stepTemplate.transformerNodeId)) ||
            (stepTemplate.type === "browser_storage" &&
              s.browserStorageNodeId === stepTemplate.browserStorageNodeId),
        );

        calculatedStepNumber =
          existingIdx >= 0
            ? (existingSteps[existingIdx]?.order ?? 1)
            : existingSteps.length + 1;

        const stepToApply: FrontendActionStepDraft = {
          ...stepTemplate,
          order: calculatedStepNumber,
          id: existingIdx >= 0 ? (existingSteps[existingIdx]?.id ?? stepTemplate.id) : stepTemplate.id,
        };

        const nextSteps =
          existingIdx >= 0
            ? existingSteps.map((s, i) =>
                i === existingIdx ? stepToApply : s,
              )
            : [...existingSteps, stepToApply];

        return {
          ...c,
          actionSteps: nextSteps,
        };
      }
      return c;
    });
  }

  if (foundAction) {
    get().updateNode(webPageNode.id, {
      data: {
        ...webPageNode.data,
        sections: updatedSections,
        ...(events.length > 0 ? { events: updatedEvents } : {}),
        realtimeConnections: updatedRealtime,
      },
    });

    // Ensure newEdge data has sequenceOrder and label set in both edges and pendingEdgeUpserts
    const updatedEdge: BackendEdge = {
      ...newEdge,
      data: {
        ...newEdge.data,
        sequenceOrder: calculatedStepNumber,
        label: String(calculatedStepNumber),
      },
    };

    const allEdges = get().edges;
    set({
      edges: allEdges.map((e) => (e.id === newEdge.id ? updatedEdge : e)),
      pendingEdgeUpserts: get().pendingEdgeUpserts.map((e) =>
        e.id === newEdge.id ? updatedEdge : e,
      ),
    });

    if (isServiceTarget) {
      const targetWebApps = findTargetWebAppsForPage(
        webPageNode.id,
        get().nodes,
        get().edges,
      );
      for (const webApp of targetWebApps) {
        syncServiceBaseUrlToWebApp({
          webAppNode: webApp,
          serviceNode: otherNode,
          updateNode: get().updateNode,
        });
      }
    }

    toast.success(
      `Configured request step for "${actionName}" calling ${targetDesc}`,
    );
    return true;
  }

  return false;
}
