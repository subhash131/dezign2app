import React from "react";
import { NodeProps, Position, Handle } from "@xyflow/react";
import {
  Database,
  Globe,
  Lock,
  Pencil,
  Settings,
  AlertCircle,
  Unlink,
  LayoutTemplate,
  Layers,
  Maximize2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "next/navigation";
import {
  NodeHeader,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
  LocalTextarea,
} from "../../common";
import {
  parseRouteWithQueryParams,
  parsePageRoute,
  normalizePageRoute,
  arePageRoutesEqual,
  pageRouteToUrl,
  pageRouteToFolderPath,
  WebAppZone,
} from "@workspace/canvas";
import { RealtimeConnection, ClientDeliveryProtocol, Endpoint, PageStateObject, PageSection, StoreActionBinding, SectionComponentBinding, FrontendActionStepDraft, UIEventItem } from "@workspace/canvas/types";
import { SectionList, RealtimeConnectionList, useZoneHandLayout } from "./web-page";
import { NodeDeletionDialog } from "@/app/(canvas)/project/[projectId]/_components/NodeDeletionDialog";

export const WebPageNode = React.memo(({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );
  const router = useRouter();
  const projectId = typeof window !== "undefined"
    ? window.location.pathname.split("/project/")[1]?.split("/")[0] ?? ""
    : "";

  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
  const [pendingRename, setPendingRename] = React.useState<{ oldLabel: string; newLabel: string } | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  // Auto-migrate legacy page-level data.stateObjects into sections[0].stateObjects
  React.useEffect(() => {
    if (data?.stateObjects && data.stateObjects.length > 0) {
      const currentSections = data.sections || [];
      const firstSec = currentSections[0];
      if (firstSec) {
        const existingFieldIds = new Set((firstSec.stateObjects || []).map((s) => s.id));
        const toMigrate = data.stateObjects.filter((s: PageStateObject) => !existingFieldIds.has(s.id));
        const updatedFirst: PageSection = {
          ...firstSec,
          stateObjects: [...(firstSec.stateObjects || []), ...toMigrate],
        };
        updateNode(id, {
          data: {
            ...data,
            sections: [updatedFirst, ...currentSections.slice(1)],
            stateObjects: [],
          },
        });
      } else {
        const defaultSec: PageSection = {
          id: `sec-${Date.now()}`,
          name: "Main",
          renderMode: "client",
          actions: [],
          stateObjects: data.stateObjects,
        };
        updateNode(id, {
          data: {
            ...data,
            sections: [defaultSec],
            stateObjects: [],
          },
        });
      }
    }
  }, [data?.stateObjects, data?.sections, id, updateNode]);

  // Auto-sync canvas edges from state store operations to WebPageNode actions when configured
  React.useEffect(() => {
    if (!data?.sections || data.sections.length === 0) return;
    const { nodes: currentNodes, edges: currentEdges } = useBackendCanvasStore.getState();

    data.sections.forEach((sec) => {
      (sec.actions || []).forEach((act) => {
        const bindings: StoreActionBinding[] =
          Array.isArray(act.storeActionBindings) && act.storeActionBindings.length > 0
            ? act.storeActionBindings
            : act.storeActionBinding
            ? [act.storeActionBinding]
            : [];

        if (bindings.length === 0) return;

        const isPageLoad = act.event === "pageLoad" || act.name === "pageLoad";
        const isSse = act.event === "sse" || act.event === "sseMessage";
        const isWebsocket = act.event === "websocket" || act.event === "ws" || act.event === "websocketMessage";
        const isWebrtc = act.event === "webrtc";
        const targetHandle = isPageLoad
          ? `pageload-in-${act.id}`
          : isSse
          ? `sse-in-${act.id}`
          : isWebsocket
          ? `websocket-in-${act.id}`
          : isWebrtc
          ? `webrtc-in-${act.id}`
          : `event-in-${act.id}`;

        bindings.forEach((b) => {
          if (!b.storeNodeId && !b.storeName) return;
          if (!b.actionId && !b.actionType) return;

          let storeNode = currentNodes.find((n) => n.id === b.storeNodeId && n.type === "state_store");
          if (!storeNode && b.storeName) {
            storeNode = currentNodes.find(
              (n) => n.type === "state_store" && (n.data?.storeName === b.storeName || n.data?.label === b.storeName),
            );
          }
          if (!storeNode) return;

          const actId = b.actionId || "";
          let sourceHandle = "mutate-out";
          if (b.targetFieldId) {
            sourceHandle = `store-field-out-${b.targetFieldId}`;
          } else if (actId.startsWith("setter-")) {
            const fId = b.targetFieldId || actId.replace("setter-", "");
            sourceHandle = `store-field-out-${fId}`;
          } else if (actId.startsWith("append-")) {
            const fId = b.targetFieldId || actId.replace("append-", "");
            sourceHandle = `store-field-out-${fId}`;
          } else if (actId.startsWith("pop-")) {
            const fId = b.targetFieldId || actId.replace("pop-", "");
            sourceHandle = `store-field-out-${fId}`;
          } else if (b.actionType === "populate" || actId === "builtin-populate" || actId === "populate") {
            sourceHandle = "populate-out";
          } else if (b.actionType === "reset" || actId === "builtin-reset" || actId === "reset") {
            sourceHandle = "reset-out";
          } else if (actId && !actId.startsWith("builtin-")) {
            sourceHandle = `store-action-out-${actId}`;
          }

          const edgeExists = currentEdges.some(
            (e) =>
              e.source === storeNode!.id &&
              e.target === id &&
              (e.sourceHandle === sourceHandle ||
                (b.targetFieldId && e.sourceHandle === `store-field-out-${b.targetFieldId}`) ||
                (b.targetFieldId && e.sourceHandle === `setter-out-${b.targetFieldId}`) ||
                (sourceHandle === "mutate-out" && e.sourceHandle?.startsWith("setter-out-"))) &&
              (e.targetHandle === targetHandle || e.targetHandle === `events-${act.id}` || e.targetHandle?.endsWith(`-${act.id}`)),
          );

          if (!edgeExists) {
            const edgeId = `edge-store-action-${b.id || act.id}-${id}-${act.id}`;
            addEdge({
              id: edgeId,
              source: storeNode.id,
              target: id,
              sourceHandle,
              targetHandle,
              type: "connection",
              data: {
                isStoreAction: true,
                isStoreActionBinding: true,
                bindingId: b.id,
                storeName: storeNode.data?.storeName || storeNode.data?.label || b.storeName || "Store",
                actionName: b.actionName || b.actionType || "action",
                actionType: b.actionType,
                targetFieldId: b.targetFieldId,
                targetFieldName: b.targetFieldName,
              },
            });
          }
        });
      });
    });
  }, [data?.sections, id, addEdge]);

  // Auto-sync canvas edges from transformer_ref nodes to WebPageNode actions when configured in actionSteps
  React.useEffect(() => {
    if (!data?.sections || data.sections.length === 0) return;
    const { nodes: currentNodes, edges: currentEdges } = useBackendCanvasStore.getState();

    const sections: PageSection[] = data.sections;
    sections.forEach((sec: PageSection) => {
      (sec.actions || []).forEach((act: UIEventItem) => {
        const transSteps: FrontendActionStepDraft[] = (act.actionSteps || []).filter(
          (step: FrontendActionStepDraft): boolean => step.type === "transform",
        );
        if (transSteps.length === 0) return;

        const isPageLoad = act.event === "pageLoad" || act.name === "pageLoad";
        const isSse = act.event === "sse" || act.event === "sseMessage";
        const isWebsocket =
          act.event === "websocket" || act.event === "ws" || act.event === "websocketMessage";
        const isWebrtc = act.event === "webrtc";
        const targetHandle = isPageLoad
          ? `pageload-in-${act.id}`
          : isSse
          ? `sse-in-${act.id}`
          : isWebsocket
          ? `websocket-in-${act.id}`
          : isWebrtc
          ? `webrtc-in-${act.id}`
          : `event-in-${act.id}`;

        transSteps.forEach((step: FrontendActionStepDraft) => {
          let refNode: BackendNode | undefined = currentNodes.find(
            (n: BackendNode): boolean =>
              n.type === "transformer_ref" &&
              (n.id === step.transformerRefNodeId ||
                (step.transformerNodeId !== undefined &&
                  (n.data?.transformerRef === step.transformerNodeId ||
                    n.data?.transformerRef === step.name ||
                    n.data?.transformerRef === step.transformerName) &&
                  (n.data?.targetWebPageId === id ||
                    n.data?.targetActionId === act.id ||
                    (Array.isArray(n.data?.targetActionIds) && n.data.targetActionIds.includes(act.id))))),
          );

          if (!refNode && step.transformerNodeId) {
            const masterNode = currentNodes.find(
              (n: BackendNode): boolean => n.id === step.transformerNodeId && n.type === "transformer",
            );
            if (masterNode) {
              refNode = currentNodes.find(
                (n: BackendNode): boolean =>
                  n.type === "transformer_ref" &&
                  n.data?.transformerRef === masterNode.id &&
                  (n.data?.targetWebPageId === id ||
                    n.data?.targetActionId === act.id ||
                    (Array.isArray(n.data?.targetActionIds) && n.data.targetActionIds.includes(act.id))),
              );
            }
          }

          if (!refNode) return;

          // Crucial: check that edge is specifically connected to THIS action handle,
          // avoiding false matches across multiple actions using the same refNode
          const edgeForAction = currentEdges.find(
            (e) =>
              e.source === refNode!.id &&
              e.target === id &&
              (e.type === "connection" || !e.type) &&
              (e.targetHandle === targetHandle ||
                e.targetHandle === `event-in-${act.id}` ||
                e.targetHandle === `events-${act.id}` ||
                e.targetHandle?.endsWith(`-${act.id}`)),
          );

          if (edgeForAction) {
            if (edgeForAction.targetHandle !== targetHandle || edgeForAction.sourceHandle !== "transformer-out") {
              useBackendCanvasStore.getState().updateEdge(edgeForAction.id, {
                sourceHandle: "transformer-out",
                targetHandle,
                type: "connection",
              });
            }
          } else {
            const edgeId = `edge-ref-${refNode.id}-${act.id}`;
            const alreadyHasEdgeWithId = currentEdges.some((e) => e.id === edgeId);
            if (!alreadyHasEdgeWithId) {
              addEdge({
                id: edgeId,
                source: refNode.id,
                target: id,
                sourceHandle: "transformer-out",
                targetHandle,
                type: "connection",
                data: {
                  sequenceOrder: step.order || 1,
                  label: String(step.order || 1),
                },
              });
            }
          }
        });
      });
    });
  }, [data?.sections, id, addEdge]);

  // Auto-sync Chat component state variables ("messages") into section.stateObjects (Rendered Store State)
  React.useEffect(() => {
    if (!data?.sections || data.sections.length === 0) return;
    const { nodes: currentNodes } = useBackendCanvasStore.getState();

    let hasChanges = false;
    const nextSections = data.sections.map((sec) => {
      const chatBindings = (sec.componentBindings || []).filter(
        (cb) =>
          cb.componentType === "chat" ||
          (cb.elements || []).some((el) => el.elementType === "chat") ||
          cb.propMappings?.chatMessagesBinding ||
          cb.valueStateName === "messages",
      );

      if (chatBindings.length === 0) return sec;

      let currentStates = [...(sec.stateObjects || [])];
      let secChanged = false;

      chatBindings.forEach((cb) => {
        const messagesVarName =
          cb.propMappings?.chatMessagesBinding ||
          cb.valueStateName ||
          "messages";

        const alreadyExists = currentStates.some((s) => s.name === messagesVarName);
        if (alreadyExists) return;

        const storeId = cb.propMappings?.chatMessagesStoreId || cb.propMappings?.valueStoreId;
        const storeName = cb.propMappings?.chatMessagesStoreName || cb.propMappings?.valueStoreName || cb.valueStoreName;

        let storeNode = currentNodes.find(
          (n) =>
            n.type === "state_store" &&
            ((storeId && n.id === storeId) ||
              (storeName && (n.data?.storeName === storeName || n.data?.label === storeName))),
        );

        if (!storeNode) {
          storeNode = currentNodes.find((n) => {
            if (n.type !== "state_store") return false;
            return (n.data?.fields || []).some((f: any) => f.name === messagesVarName);
          });
        }

        if (storeNode) {
          const storeFields = storeNode.data?.fields || [];
          const field = storeFields.find((f: any) => f.name === messagesVarName);
          const fieldId = field?.id || `f-msg-${Date.now()}`;
          const storeActualName = storeNode.data?.storeName || storeNode.data?.label || storeName || "ChatStore";

          const newChatStateObj: PageStateObject = {
            id: `state-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${fieldId}`,
            name: messagesVarName,
            type: field?.type || "ChatMessage[]",
            defaultValue: field?.defaultValue || [
              { id: "msg-1", role: "assistant", content: "Hello! How can I assist you today?" },
            ],
            storeId: storeNode.id,
            storeName: storeActualName,
            fieldId,
            renderConfig: {
              enabled: true,
              component: "chat",
            },
          };

          currentStates.push(newChatStateObj);
          secChanged = true;
          hasChanges = true;
        }
      });

      return secChanged ? { ...sec, stateObjects: currentStates } : sec;
    });

    if (hasChanges) {
      updateNode(id, {
        data: {
          ...data,
          sections: nextSections,
        },
      });
    }
  }, [data?.sections, id, updateNode]);

  // Narrow selector: only subscribe to webApp and webPage nodes so moving other nodes doesn't re-render this page
  const webPageAndAppNodes = useBackendCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "webApp" || n.type === "webPage")),
  );
  const edges = useBackendCanvasStore((s) => s.edges);

  const {
    cardIndex,
    totalCards,
    hasMultipleCards,
    isStacked,
    toggleZoneHand,
    selectCard,
    moveCard,
    bringCardToFront,
  } = useZoneHandLayout(id, webPageAndAppNodes, edges, updateNode);

  // Find incoming WebApp edge connecting to this page
  const incomingEdge = edges.find((e) => {
    const isTarget = e.target === id;
    const isSource = e.source === id;
    if (!isTarget && !isSource) return false;
    const otherId = isSource ? e.target : e.source;
    const otherNode = webPageAndAppNodes.find((n) => n.id === otherId);
    return otherNode?.type === "webApp";
  });

  const connectedWebAppNode = incomingEdge
    ? webPageAndAppNodes.find(
        (n) =>
          n.type === "webApp" &&
          (n.id === incomingEdge.source || n.id === incomingEdge.target),
      )
    : null;

  const isDisconnected = !connectedWebAppNode;

  // Find section name from handleId
  let connectedZoneName: string | null = null;
  let isZoneProtected = false;
  if (connectedWebAppNode && incomingEdge) {
    const handleId =
      incomingEdge.source === connectedWebAppNode.id
        ? incomingEdge.sourceHandle
        : incomingEdge.targetHandle;
    const defaultZones: WebAppZone[] = [
      { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
      { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
    ];
    const zones: WebAppZone[] =
      connectedWebAppNode.data?.zones && connectedWebAppNode.data.zones.length > 0
        ? connectedWebAppNode.data.zones
        : defaultZones;
    const matchedZone = zones.find(
      (z: WebAppZone) => z.handleId === handleId,
    );
    if (matchedZone) {
      connectedZoneName = matchedZone.name;
      isZoneProtected =
        matchedZone.accessType === "protected" ||
        matchedZone.handleId === "private-in" ||
        matchedZone.name.toLowerCase().includes("private") ||
        matchedZone.name.toLowerCase().includes("protect");
    } else if (handleId === "public-in") {
      connectedZoneName = "Public Section";
      isZoneProtected = false;
    } else if (handleId === "private-in") {
      connectedZoneName = "Private Section";
      isZoneProtected = true;
    }
  }

  const handleRequestRename = React.useCallback(
    (newLabel: string) => {
      const oldLabel = data.label || "";
      const parsed = parseRouteWithQueryParams(newLabel);
      const cleanNew = parsed.route || newLabel.trim();

      // Check if user is trying to rename to "layout"
      if (cleanNew.toLowerCase() === "layout") {
        if (connectedWebAppNode && incomingEdge) {
          const store = useBackendCanvasStore.getState();
          const handleId =
            incomingEdge.source === connectedWebAppNode.id
              ? incomingEdge.sourceHandle
              : incomingEdge.targetHandle;
          const alreadyHasOtherLayout = store.edges.some((e) => {
            if (e.id === incomingEdge.id) return false;
            const isTarget =
              e.target === connectedWebAppNode.id && e.targetHandle === handleId;
            const isSource =
              e.source === connectedWebAppNode.id && e.sourceHandle === handleId;
            if (!isTarget && !isSource) return false;
            const otherNodeId = isSource ? e.target : e.source;
            const otherNode = store.nodes.find((n) => n.id === otherNodeId);
            return (
              otherNode?.id !== id &&
              (Boolean(otherNode?.data?.isLayout) ||
                otherNode?.data?.label?.trim().toLowerCase() === "layout")
            );
          });

          if (alreadyHasOtherLayout) {
            toast.error(
              `Section "${connectedZoneName || "current"}" already has a layout node. Only 1 layout per section is allowed.`,
            );
            return;
          }
        }
        const isSecProtected = connectedWebAppNode
          ? isZoneProtected
          : Boolean(
              connectedZoneName?.toLowerCase().includes("private") ||
                connectedZoneName?.toLowerCase().includes("protect"),
            );
        const defaultSections: PageSection[] = [
          {
            id: `sec-nav-${Date.now()}`,
            name: isSecProtected ? "App Sidebar Navigation" : "Header Navigation",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
            componentBindings: isSecProtected
              ? [
                  {
                    id: `comp-sidebar-${Date.now()}`,
                    name: "AppSidebar",
                    label: "AppSidebar",
                    componentType: "sidebar",
                    variant: "default",
                    propMappings: {
                      sidebarTitle: connectedZoneName || "App Navigation",
                      sidebarNavMode: "static",
                      sidebarCollapsible: "icon",
                      sidebarVariant: "sidebar",
                      sidebarStaticItems: [
                        { id: "nav-1", name: "Dashboard", link: "/dashboard" },
                        { id: "nav-2", name: "Settings", link: "/settings" },
                      ],
                    },
                  },
                ]
              : [
                  {
                    id: `comp-topbar-${Date.now()}`,
                    name: "AppTopbar",
                    label: "AppTopbar",
                    componentType: "topbar",
                    variant: "default",
                    propMappings: {
                      topbarTitle: connectedZoneName || "Dezign App",
                      topbarNavMode: "static",
                      topbarSticky: true,
                      showAuthButtons: true,
                      signInText: "Sign In",
                      signInLink: "/login",
                      registerText: "Register",
                      registerLink: "/register",
                      topbarStaticItems: [
                        { id: "nav-1", name: "Home", link: "/" },
                        { id: "nav-2", name: "Features", link: "/features" },
                        { id: "nav-3", name: "Pricing", link: "/pricing" },
                        { id: "nav-4", name: "About", link: "/about" },
                      ],
                    },
                  },
                ],
          },
          {
            id: `sec-children-${Date.now()}`,
            name: "Page Content ({children})",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
            componentBindings: [],
          },
        ];
        updateNode(id, {
          data: {
            ...data,
            label: "layout",
            isLayout: true,
            layoutSidebarInitialized: true,
            layoutTopbarInitialized: true,
            sections: data.sections && data.sections.length > 0 ? data.sections : defaultSections,
          },
        });
        return;
      }

      // Check if another page in the same WebApp already has this route
      if (cleanNew.toLowerCase() !== "layout" && connectedWebAppNode) {
        const store = useBackendCanvasStore.getState();
        const normalizedNew = normalizePageRoute(cleanNew);
        const existingPageEdges = store.edges.filter(
          (e) => e.source === connectedWebAppNode.id || e.target === connectedWebAppNode.id,
        );
        const duplicatePage = existingPageEdges
          .map((e) => store.nodes.find((n) => n.id === (e.source === connectedWebAppNode.id ? e.target : e.source)))
          .find(
            (other) =>
              other &&
              other.id !== id &&
              other.type === "webPage" &&
              !other.data?.isLayout &&
              other.data?.label?.trim().toLowerCase() !== "layout" &&
              normalizePageRoute(other.data?.label || other.data?.path || "") === normalizedNew,
          );

        if (duplicatePage) {
          toast.error(
            `Route "${normalizedNew}" already exists in this Web App (node "${duplicatePage.data?.label || "Page"}"). Route names must be unique.`,
          );
          return;
        }
      }

      // Merge any extracted path params or query params from the input string
      const existingPathParams = data.pathParams || [];
      const mergedPathParams = [...existingPathParams];
      let pathParamsChanged = false;
      parsed.extractedPathParams.forEach((ep) => {
        if (!mergedPathParams.some((p) => p.name.toLowerCase() === ep.name.toLowerCase())) {
          mergedPathParams.push(ep);
          pathParamsChanged = true;
        }
      });

      const existingQueryParams = data.queryParams || [];
      const mergedQueryParams = [...existingQueryParams];
      let queryParamsChanged = false;
      parsed.extractedQueryParams.forEach((eq) => {
        if (!mergedQueryParams.some((q) => q.name.toLowerCase() === eq.name.toLowerCase())) {
          mergedQueryParams.push(eq);
          queryParamsChanged = true;
        }
      });

      const additionalChanges: Partial<BackendNode["data"]> = {};
      if (pathParamsChanged) additionalChanges.pathParams = mergedPathParams;
      if (queryParamsChanged) additionalChanges.queryParams = mergedQueryParams;

      // If previously was layout, reset isLayout flag when renamed
      const nextIsLayout = Boolean(data.isLayout && cleanNew.toLowerCase() === "layout");

      // If oldLabel and cleanNew point to the exact same route (e.g. "/login" vs "login"), update label directly
      if (arePageRoutesEqual(oldLabel, cleanNew)) {
        updateNode(id, {
          data: {
            ...data,
            label: cleanNew,
            path: pageRouteToUrl(cleanNew),
            pageSlug: pageRouteToFolderPath(cleanNew),
            route: pageRouteToUrl(cleanNew),
            isLayout: nextIsLayout,
            ...additionalChanges,
          },
        });
        return;
      }

      if (
        !oldLabel ||
        oldLabel.trim() === "" ||
        oldLabel === "page-server" ||
        oldLabel === "Untitled" ||
        oldLabel === "Page"
      ) {
        updateNode(id, {
          data: {
            ...data,
            label: cleanNew,
            path: pageRouteToUrl(cleanNew),
            pageSlug: pageRouteToFolderPath(cleanNew),
            route: pageRouteToUrl(cleanNew),
            isLayout: nextIsLayout,
            ...additionalChanges,
          },
        });
        return;
      }

      const cleanOld = parsePageRoute(oldLabel);

      if (cleanOld === cleanNew) {
        if (pathParamsChanged || queryParamsChanged) {
          updateNode(id, { data: { ...data, ...additionalChanges } });
        }
        return;
      }

      if (!cleanOld || cleanOld === "page-server" || cleanOld === "Untitled" || cleanOld === "Page") {
        updateNode(id, {
          data: {
            ...data,
            label: cleanNew,
            path: pageRouteToUrl(cleanNew),
            pageSlug: pageRouteToFolderPath(cleanNew),
            route: pageRouteToUrl(cleanNew),
            isLayout: nextIsLayout,
            ...additionalChanges,
          },
        });
        return;
      }

      setPendingRename({ oldLabel: cleanOld, newLabel: cleanNew });
      setRenameDialogOpen(true);
    },
    [data, id, updateNode, connectedWebAppNode, incomingEdge, connectedZoneName],
  );

  const isCustomOverride = Boolean(
    data.useZoneDefault === false || data.protectionOverride,
  );

  const isProtected = isCustomOverride
    ? (data.accessType && data.accessType !== "public") ||
      Boolean(data.protectionOverride)
    : connectedWebAppNode
    ? isZoneProtected
    : Boolean(
        connectedZoneName?.toLowerCase().includes("private") ||
          connectedZoneName?.toLowerCase().includes("protected") ||
          (data.accessType && data.accessType !== "public"),
      );

  // Auto-sanitize existing labels with spaces to valid Next.js route format (unless layout)
  React.useEffect(() => {
    if (data.label && data.label.toLowerCase() !== "layout" && (data.label.includes(" ") || data.label !== parsePageRoute(data.label))) {
      const parsed = parsePageRoute(data.label);
      if (parsed !== data.label) {
        updateNode(id, {
          data: {
            ...data,
            label: parsed,
            path: pageRouteToUrl(parsed),
            pageSlug: pageRouteToFolderPath(parsed),
            route: pageRouteToUrl(parsed),
          },
        });
      }
    }
  }, [id, data.label, updateNode]);

  // One-time migration: safely migrate any legacy SSE/WS/WebRTC/Polling actions from sections to realtimeConnections
  React.useEffect(() => {
    if (!data.sections || data.sections.length === 0) return;
    const rtEventTypes = new Set(["sse", "websocket", "ws", "webrtc", "polling", "ssemessage", "websocketmessage"]);
    let found = false;
    const migrated: RealtimeConnection[] = [...(data.realtimeConnections || [])];

    const nextSections = data.sections.map((sec) => {
      const remainingActions = sec.actions.filter((act) => {
        const evtLower = (act.event || "").toLowerCase();
        if (rtEventTypes.has(evtLower)) {
          found = true;
          let proto: ClientDeliveryProtocol | "POLLING" = "SSE";
          if (evtLower.includes("ws") || evtLower.includes("websocket")) proto = "WEBSOCKET";
          else if (evtLower.includes("webrtc")) proto = "WEBRTC";
          else if (evtLower.includes("polling")) proto = "POLLING";

          if (!migrated.some((m) => m.id === act.id)) {
            migrated.push({
              id: act.id,
              protocol: proto,
              eventName: act.name || "message",
              description: act.description,
            });
          }
          return false;
        }
        return true;
      });
      return { ...sec, actions: remainingActions };
    });

    if (found) {
      updateNode(id, {
        data: {
          ...data,
          sections: nextSections,
          realtimeConnections: migrated,
        },
      });
    }
  }, [id, data, updateNode]);

  // Auto-clean any default or stale auth headers from page and action events
  React.useEffect(() => {
    let nodeChanged = false;
    let nextHeaders = data.headers;
    let nextSections = data.sections;

    // 1. Clean data.headers unconditionally
    if (nextHeaders && nextHeaders.length > 0) {
      const filtered = nextHeaders.filter(
        (h) =>
          h.name?.toLowerCase() !== "authorization" &&
          h.id !== "auth-bearer-header" &&
          !h.id?.startsWith("auth-"),
      );
      if (filtered.length !== nextHeaders.length) {
        nextHeaders = filtered;
        nodeChanged = true;
      }
    }

    // 2. Clean all actions in sections unconditionally
    if (nextSections && nextSections.length > 0) {
      const updatedSections = nextSections.map((sec) => {
        let secChanged = false;
        const updatedActions = (sec.actions || []).map((act) => {
          if (!act.headers || act.headers.length === 0) return act;
          const hasAuth = act.headers.some(
            (h) =>
              h.name?.toLowerCase() === "authorization" ||
              h.id === "auth-bearer-header" ||
              h.id?.startsWith("auth-"),
          );
          if (!hasAuth) return act;

          secChanged = true;
          return {
            ...act,
            headers: act.headers.filter(
              (h) =>
                h.name?.toLowerCase() !== "authorization" &&
                h.id !== "auth-bearer-header" &&
                !h.id?.startsWith("auth-"),
            ),
          };
        });

        if (secChanged) {
          nodeChanged = true;
          return { ...sec, actions: updatedActions };
        }
        return sec;
      });

      if (nodeChanged) {
        nextSections = updatedSections;
      }
    }

    if (nodeChanged) {
      updateNode(id, {
        data: {
          ...data,
          headers: nextHeaders,
          sections: nextSections,
        },
      });
    }
  }, [id, data, updateNode]);

  const rawLabel = data.label || "";
  const normalizedLabel = parsePageRoute(rawLabel);
  const cleanLabel = normalizedLabel.toLowerCase();
  const isLayout = Boolean(data.isLayout) || cleanLabel === "layout" || rawLabel.trim().toLowerCase() === "layout";

  // Auto-heal legacy / mismatched data.path, data.pageSlug, and data.route to match data.label
  React.useEffect(() => {
    if (data.label && !isLayout && data.label.toLowerCase() !== "layout") {
      const canonicalPath = pageRouteToUrl(data.label);
      const canonicalSlug = pageRouteToFolderPath(data.label);
      if (data.path && !arePageRoutesEqual(data.path, canonicalPath)) {
        updateNode(id, {
          data: {
            ...data,
            path: canonicalPath,
            pageSlug: canonicalSlug,
            route: canonicalPath,
          },
        });
      }
    }
  }, [id, data.label, data.path, isLayout, updateNode]);
  const isLandingPage =
    !isLayout && (data.isRoot === true || cleanLabel === "/");

  const zoneSlug =
    connectedZoneName
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || (isZoneProtected ? "private" : "public");

  const displayRoute = isLayout
    ? `app/(${zoneSlug})/layout.tsx`
    : isLandingPage
      ? "/"
      : data.label
        ? data.label.startsWith("/")
          ? data.label
          : `/${data.label}`
        : "/";

  // Auto-populate navigation components for autogenerated layout nodes (AppSidebar for protected/private, AppTopbar for public)
  React.useEffect(() => {
    if (!isLayout) return;
    if (!data.sections || data.sections.length === 0) return;

    // Check if this layout represents a protected/private section or has a sidebar section
    const isSidebarLayout =
      isProtected ||
      connectedZoneName?.toLowerCase().includes("private") ||
      connectedZoneName?.toLowerCase().includes("protect") ||
      Boolean(data.description && data.description.toLowerCase().includes("sidebar"));

    if (isSidebarLayout) {
      if (data.layoutSidebarInitialized) return;

      const navSection = data.sections.find(
        (sec) =>
          sec.name === "App Sidebar Navigation" ||
          sec.name?.toLowerCase().includes("sidebar") ||
          !sec.name?.toLowerCase().includes("children"),
      );

      if (!navSection) return;

      const existingBindings = navSection.componentBindings || [];
      const hasSidebarComp = existingBindings.some(
        (cb) =>
          cb.componentType === "sidebar" ||
          cb.name?.toLowerCase().includes("sidebar") ||
          cb.label?.toLowerCase().includes("sidebar"),
      );

      if (hasSidebarComp) {
        if (!data.layoutSidebarInitialized) {
          updateNode(id, { data: { ...data, layoutSidebarInitialized: true } });
        }
        return;
      }

      // Determine sibling pages in the same zone for static navigation links
      let navItems: Array<{ id: string; name: string; link: string }> = [];
      if (connectedWebAppNode && incomingEdge) {
        const store = useBackendCanvasStore.getState();
        const handleId =
          incomingEdge.source === connectedWebAppNode.id
            ? incomingEdge.sourceHandle
            : incomingEdge.targetHandle;
        const siblingEdges = store.edges.filter(
          (e) =>
            (e.source === connectedWebAppNode.id && e.sourceHandle === handleId) ||
            (e.target === connectedWebAppNode.id && e.targetHandle === handleId),
        );
        const siblingPages = siblingEdges
          .map((e) => store.nodes.find((n) => n.id === (e.source === connectedWebAppNode.id ? e.target : e.source)))
          .filter((n): n is BackendNode =>
            Boolean(
              n &&
                n.id !== id &&
                n.type === "webPage" &&
                !n.data?.isLayout &&
                n.data?.label?.trim().toLowerCase() !== "layout",
            ),
          );

        navItems = siblingPages.map((p, idx) => {
          const raw = p.data?.label || p.data?.path || `Page ${idx + 1}`;
          const clean = raw.replace(/^\//, "");
          const name = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Home";
          const link = raw.startsWith("/") ? raw : `/${raw}`;
          const { extractedPathParams, extractedQueryParams } = parseRouteWithQueryParams(link);
          const pathParams = extractedPathParams.map((ep) => ({
            name: ep.name,
            value: "",
            mode: "route_param" as const,
            sourceParamName: ep.name,
          }));
          const queryParams = extractedQueryParams.map((eq) => ({
            id: `q-${eq.name}`,
            key: eq.name,
            value: eq.defaultValue || "",
            mode: "static" as const,
          }));
          return {
            id: `nav-${idx + 1}`,
            name,
            link,
            ...(pathParams.length > 0 ? { pathParams } : {}),
            ...(queryParams.length > 0 ? { queryParams } : {}),
          };
        });
      }

      if (navItems.length === 0) {
        navItems = [
          { id: "nav-1", name: "Dashboard", link: "/dashboard" },
          { id: "nav-2", name: "Settings", link: "/settings" },
        ];
      }

      const sidebarBinding: SectionComponentBinding = {
        id: `comp-sidebar-${Date.now()}`,
        name: "AppSidebar",
        label: "AppSidebar",
        componentType: "sidebar",
        variant: "default",
        propMappings: {
          sidebarTitle: connectedZoneName || "App Navigation",
          sidebarNavMode: "static",
          sidebarCollapsible: "icon",
          sidebarVariant: "sidebar",
          sidebarStaticItems: navItems,
        },
      };

      const nextSections = data.sections.map((sec) =>
        sec.id === navSection.id
          ? {
              ...sec,
              componentBindings: [...existingBindings, sidebarBinding],
            }
          : sec,
      );

      updateNode(id, {
        data: {
          ...data,
          sections: nextSections,
          layoutSidebarInitialized: true,
        },
      });
    } else {
      // Public layout: populate AppTopbar with links and signin/register buttons
      if (data.layoutTopbarInitialized) return;

      const navSection = data.sections.find(
        (sec) =>
          sec.name === "Header Navigation" ||
          sec.name?.toLowerCase().includes("header") ||
          sec.name?.toLowerCase().includes("topbar") ||
          sec.name?.toLowerCase().includes("navigation") ||
          !sec.name?.toLowerCase().includes("children"),
      );

      if (!navSection) return;

      const existingBindings = navSection.componentBindings || [];
      const hasTopbarComp = existingBindings.some(
        (cb) =>
          cb.componentType === "topbar" ||
          cb.name?.toLowerCase().includes("topbar") ||
          cb.label?.toLowerCase().includes("topbar"),
      );

      if (hasTopbarComp) {
        if (!data.layoutTopbarInitialized) {
          updateNode(id, { data: { ...data, layoutTopbarInitialized: true } });
        }
        return;
      }

      // Determine sibling pages in the same zone for static navigation links
      let navItems: Array<{ id: string; name: string; link: string }> = [];
      if (connectedWebAppNode && incomingEdge) {
        const store = useBackendCanvasStore.getState();
        const handleId =
          incomingEdge.source === connectedWebAppNode.id
            ? incomingEdge.sourceHandle
            : incomingEdge.targetHandle;
        const siblingEdges = store.edges.filter(
          (e) =>
            (e.source === connectedWebAppNode.id && e.sourceHandle === handleId) ||
            (e.target === connectedWebAppNode.id && e.targetHandle === handleId),
        );
        const siblingPages = siblingEdges
          .map((e) => store.nodes.find((n) => n.id === (e.source === connectedWebAppNode.id ? e.target : e.source)))
          .filter((n): n is BackendNode =>
            Boolean(
              n &&
                n.id !== id &&
                n.type === "webPage" &&
                !n.data?.isLayout &&
                n.data?.label?.trim().toLowerCase() !== "layout",
            ),
          );

        navItems = siblingPages.map((p, idx) => {
          const raw = p.data?.label || p.data?.path || `Page ${idx + 1}`;
          const clean = raw.replace(/^\//, "");
          const name = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Home";
          const link = raw.startsWith("/") ? raw : `/${raw}`;
          return { id: `nav-${idx + 1}`, name, link };
        });
      }

      if (navItems.length === 0) {
        navItems = [
          { id: "nav-1", name: "Home", link: "/" },
          { id: "nav-2", name: "Features", link: "/features" },
          { id: "nav-3", name: "Pricing", link: "/pricing" },
          { id: "nav-4", name: "About", link: "/about" },
        ];
      }

      const topbarBinding: SectionComponentBinding = {
        id: `comp-topbar-${Date.now()}`,
        name: "AppTopbar",
        label: "AppTopbar",
        componentType: "topbar",
        variant: "default",
        propMappings: {
          topbarTitle: connectedZoneName || "Dezign App",
          topbarNavMode: "static",
          topbarSticky: true,
          showAuthButtons: true,
          signInText: "Sign In",
          signInLink: "/login",
          registerText: "Register",
          registerLink: "/register",
          topbarStaticItems: navItems,
        },
      };

      const nextSections = data.sections.map((sec) =>
        sec.id === navSection.id
          ? {
              ...sec,
              componentBindings: [...existingBindings, topbarBinding],
            }
          : sec,
      );

      updateNode(id, {
        data: {
          ...data,
          sections: nextSections,
          layoutTopbarInitialized: true,
        },
      });
    }
  }, [
    isLayout,
    isProtected,
    connectedZoneName,
    data,
    id,
    updateNode,
  ]);

  // Check if multiple layout nodes are attached to the same section or routes collide
  const currentNormalizedRoute = normalizePageRoute(data.label || data.path || "");
  const { isDuplicateLayout, isDuplicateRoute, duplicateRouteNodeLabel } = useBackendCanvasStore(
    useShallow((s) => {
      let dupLayout = false;
      let dupRoute = false;
      let dupRouteLabel: string | null = null;

      if (isLayout && connectedWebAppNode && incomingEdge) {
        const handleId =
          incomingEdge.source === connectedWebAppNode.id
            ? incomingEdge.sourceHandle
            : incomingEdge.targetHandle;
        const otherLayoutEdges = s.edges.filter(
          (e) =>
            e.id !== incomingEdge.id &&
            ((e.source === connectedWebAppNode.id && e.sourceHandle === handleId) ||
              (e.target === connectedWebAppNode.id && e.targetHandle === handleId)),
        );
        dupLayout = otherLayoutEdges.some((e) => {
          const otherNodeId = e.source === connectedWebAppNode.id ? e.target : e.source;
          const otherNode = s.nodes.find((n) => n.id === otherNodeId);
          return (
            otherNode?.id !== id &&
            (Boolean(otherNode?.data?.isLayout) ||
              otherNode?.data?.label?.trim().toLowerCase() === "layout")
          );
        });
      }

      if (!isLayout && connectedWebAppNode) {
        const connectedEdges = s.edges.filter(
          (e) => e.source === connectedWebAppNode.id || e.target === connectedWebAppNode.id,
        );
        const dupNode = connectedEdges
          .map((e) => {
            const otherId = e.source === connectedWebAppNode.id ? e.target : e.source;
            if (otherId === id) return null;
            return s.nodes.find((n) => n.id === otherId);
          })
          .find((other) => {
            if (!other || other.type !== "webPage") return false;
            if (other.data?.isLayout || other.data?.label?.trim().toLowerCase() === "layout") return false;
            return normalizePageRoute(other.data?.label || other.data?.path || "") === currentNormalizedRoute;
          });

        if (dupNode) {
          dupRoute = true;
          dupRouteLabel = dupNode.data?.label || "Page";
        }
      }

      return {
        isDuplicateLayout: dupLayout,
        isDuplicateRoute: dupRoute,
        duplicateRouteNodeLabel: dupRouteLabel,
      };
    }),
  );

  const isLocked = Boolean(data.aiEditing);

  return (
    <div
      onClick={(e) => {
        if (isStacked) {
          e.stopPropagation();
          bringCardToFront();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        zIndex: isStacked
          ? cardIndex === totalCards - 1 && selected
            ? 1000
            : 10 + cardIndex
          : selected
            ? 1000
            : 1,
      }}
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[340px] max-w-[440px] flex flex-col transition-all duration-200 relative",
        isStacked && "w-[380px] shadow-lg backdrop-blur-sm",
        isStacked && (selected || isHovered) && "ring-2 ring-indigo-500/50 shadow-2xl scale-[1.01] border-indigo-500",
        isLocked
          ? "border-violet-500/80 ring-2 ring-violet-500/30"
          : isDisconnected
            ? cn(
                "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
                selected && "ring-2 ring-destructive/60 border-destructive",
              )
            : isDuplicateRoute
              ? cn(
                  "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
                  selected && "ring-2 ring-destructive/60 border-destructive",
                )
            : isLayout
              ? cn(
                  "border-indigo-500/60 ring-1 ring-indigo-500/20",
                  selected && "ring-2 ring-indigo-500/60 border-indigo-500",
                )
              : borderClass,
      )}
    >
      {/* Target handle from WebApp Section */}
      <Handle
        type="target"
        position={Position.Left}
        id="page-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "rounded-full !border-2 !border-background hover:scale-125 transition-all",
          isDisconnected ? "!bg-destructive animate-pulse" : "!bg-indigo-500",
        )}
        style={{ top: "18px" }}
        title={isDisconnected ? "Connect to a WebApp node section handle" : "Connected to WebApp"}
      />

      <NodeHeader
        id={id}
        data={data}
        nodeType="webPage"
        icon={isLayout ? LayoutTemplate : Globe}
        title={isLayout ? "Route Group Layout" : isLandingPage ? "Landing Page" : "Web Page"}
        selected={selected}
        onSave={handleRequestRename}
        rightElement={
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {hasMultipleCards && (
              isStacked ? (
                <div className="flex items-center gap-1 shrink-0">
                  <div className="flex items-center rounded text-[9px] font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 overflow-hidden shrink-0">
                    {cardIndex > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCard("up");
                        }}
                        className="px-1 py-0.5 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-200 transition-colors cursor-pointer"
                        title="Move page up in stack"
                      >
                        <ChevronUp size={10} />
                      </button>
                    )}
                    <span
                      className="px-1.5 py-0.5 flex items-center gap-0.5"
                      title={`Card ${cardIndex + 1} of ${totalCards} in this section (stacked)`}
                    >
                      <Layers size={9} />
                      <span>{cardIndex + 1}/{totalCards}</span>
                    </span>
                    {cardIndex < totalCards - 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCard("down");
                        }}
                        className="px-1 py-0.5 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-200 transition-colors cursor-pointer"
                        title="Move page down in stack"
                      >
                        <ChevronDown size={10} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleZoneHand();
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 text-[9px] font-semibold transition-colors cursor-pointer shrink-0"
                    title="Spread all pages in this section"
                  >
                    <Maximize2 size={9} />
                    <span>Spread</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleZoneHand();
                  }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/25 text-[9px] font-medium transition-colors cursor-pointer shrink-0"
                  title="Stack pages of this section into a hand of cards"
                >
                  <Layers size={9} />
                  <span>Stack</span>
                </button>
              )
            )}
            {isLayout && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                LAYOUT
              </span>
            )}
            {isDisconnected && !isLocked && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 text-[9px] font-semibold shrink-0"
                title="Disconnected: Not attached to any WebApp. Connect to a WebApp node to compile this page."
              >
                <Unlink size={10} className="shrink-0" />
                <span>Disconnected</span>
              </div>
            )}
            {data.pageSourceCode && !isLocked && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                AI-edited
              </span>
            )}
            {isLocked ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateNode(id, { data: { ...data, aiEditing: false } });
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/15 hover:bg-destructive/20 text-violet-600 dark:text-violet-400 hover:text-destructive border border-violet-500/30 text-[10px] font-mono shrink-0 cursor-pointer transition-colors"
                title="Locked: AI is actively editing this page. Click to force unlock."
              >
                <Lock size={10} className="shrink-0" />
                <span className="text-[9px] font-semibold">Locked</span>
              </button>
            ) : isProtected ? (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-mono shrink-0"
                title="Protected Page (Authentication Required)"
              >
                <Lock size={10} className="shrink-0" />
              </div>
            ) : null}
          </div>
        }
      />

      {/* Disconnected error banner */}
          {isDisconnected && (
            <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/25 flex items-center gap-1.5 text-[10px] text-destructive font-medium leading-tight nodrag">
              <AlertCircle size={12} className="shrink-0 text-destructive animate-pulse" />
              <span>Connect to a WebApp node to build</span>
            </div>
          )}

          {/* Duplicate layout warning banner */}
          {isDuplicateLayout && (
            <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/25 flex items-center gap-1.5 text-[10px] text-amber-500 font-medium leading-tight nodrag">
              <AlertCircle size={12} className="shrink-0 text-amber-500 animate-pulse" />
              <span>Duplicate layout: Section already has layout.tsx</span>
            </div>
          )}

          {/* Duplicate route warning banner */}
          {isDuplicateRoute && (
            <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/25 flex items-center gap-1.5 text-[10px] text-destructive font-medium leading-tight nodrag">
              <AlertCircle size={12} className="shrink-0 text-destructive animate-pulse" />
              <span>Duplicate route: Route "{currentNormalizedRoute}" conflicts with "{duplicateRouteNodeLabel || "Page"}"</span>
            </div>
          )}

          {/* Edit UI & Page settings button strip */}
          <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between nodrag">
            <span
              className="text-[10px] text-muted-foreground font-mono truncate"
              title={`Route: ${displayRoute}`}
            >
              {displayRoute}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {/* Page State Store shortcut */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveConfigItem({ type: "webPage", id, nodeId: id, initialTab: "state" });
                }}
                className="p-1 rounded text-muted-foreground hover:text-cyan-500 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                title="Page State & Zustand stores"
              >
                <Database size={12} />
              </button>

              {/* Page config / settings gear */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveConfigItem({ type: "webPage", id, nodeId: id });
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                title="Page settings & configuration"
              >
                <Settings size={12} />
              </button>

              {/* Edit UI (visual page editor) */}
              <button
                type="button"
                disabled={isLocked}
                onClick={(e) => {
                  e.stopPropagation();
                  if (projectId) router.push(`/project/${projectId}/pages/${id}`);
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                  isLocked
                    ? "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60"
                    : "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border border-indigo-500/20 cursor-pointer",
                )}
                title={isLocked ? "Locked: AI is actively editing this page" : "Open visual page editor"}
              >
                {isLocked ? <Lock size={10} /> : <Pencil size={10} />}
                {isLocked ? "Locked" : "Edit UI"}
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
            <LocalTextarea
              className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50 disabled:opacity-60"
              placeholder="description"
              disabled={isLocked}
              value={data.description || ""}
              debounceMs={150}
              onChange={(e) =>
                updateNode(id, { data: { ...data, description: e.target.value } })
              }
            />
          </div>

          {/* Parameters Strip */}
          {(Boolean(data.headers?.length) ||
            Boolean(data.queryParams?.length) ||
            Boolean(data.pathParams?.length) ||
            Boolean(data.requestBody?.rawJson || data.requestBody?.fields?.length)) && (
            <div className="px-3 py-1 bg-secondary/15 border-b flex flex-wrap items-center gap-1.5 nodrag text-[9px]">
              {Boolean(data.headers?.length) && (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-medium border border-blue-500/20">
                  {data.headers!.length} {data.headers!.length === 1 ? "header" : "headers"}
                </span>
              )}
              {Boolean(data.queryParams?.length) && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-medium border border-indigo-500/20">
                  {data.queryParams!.length} {data.queryParams!.length === 1 ? "query param" : "query params"}
                </span>
              )}
              {Boolean(data.requestBody?.rawJson || data.requestBody?.fields?.length) && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-medium border border-emerald-500/20">
                  Body Schema
                </span>
              )}
            </div>
          )}

          {/* Sections & Actions (Each section contains Rendered State & Actions) */}
          <SectionList
            nodeId={id}
            sections={data.sections}
            updateNode={updateNode}
            data={data}
            onTriggerEvent={(triggerInfo) =>
              useBackendCanvasStore.getState().setActiveConfigItem({
                type: "eventTesting",
                id: triggerInfo.event.id,
                nodeId: id,
                targetNodeId: triggerInfo.targetNode.id,
                endpointId: triggerInfo.endpoint.id,
                initialTab: "trigger",
              })
            }
          />

          {/* Real-Time Connections (SSE, WebSocket, WebRTC, Polling) */}
          <RealtimeConnectionList
            nodeId={id}
            connections={data.realtimeConnections}
            updateNode={updateNode}
            data={data}
          />

      {/* Page Rename / File Deletion Confirmation Dialog */}
      {pendingRename && (
        <NodeDeletionDialog
          open={renameDialogOpen}
          onOpenChange={(open) => {
            setRenameDialogOpen(open);
            if (!open) setPendingRename(null);
          }}
          projectId={projectId}
          deletionTarget={{
            type: "pageRename",
            nodeId: id,
            oldLabel: pendingRename.oldLabel,
            newLabel: pendingRename.newLabel,
            onConfirm: () => {
              const newL = pendingRename.newLabel;
              updateNode(id, {
                data: {
                  ...data,
                  label: newL,
                  path: pageRouteToUrl(newL),
                  pageSlug: pageRouteToFolderPath(newL),
                  route: pageRouteToUrl(newL),
                },
              });
              setPendingRename(null);
            },
          }}
        />
      )}
    </div>
  );
});

