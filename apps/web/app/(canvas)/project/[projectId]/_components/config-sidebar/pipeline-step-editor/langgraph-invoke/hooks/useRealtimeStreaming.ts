"use client";

import { useMemo, useEffect, useRef, useCallback } from "react";
import { BackendNode, BackendEdge, Endpoint, KafkaTopic, RedisStream } from "@workspace/canvas/types";
import { PipelineStepDraft, StepBinding, AvailableSource, LangGraphStreamMode } from "../../types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ensurePageRefConnection } from "../../utils";
import { upsertDerivedConnection, removeDerivedConnection } from "../../pushToClientUtils";
import { ensureWsPackageInService } from "@/lib/stores/backendCanvas/packageTypesSync";
import {
  stepSourceToAccessor,
  getArgBinding,
  resolveInvokingPage,
  resolveConnectedPageRefNode,
} from "../utils";

export interface UseRealtimeStreamingParams {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  allEdges?: BackendEdge[];
  availableSources: AvailableSource[];
  serviceNodeId?: string;
  endpoint?: Endpoint;
  onChange: (updated: PipelineStepDraft) => void;
  syncAgentInputChannels: (
    bindings: StepBinding[],
    mappingRecord: Record<string, string>,
    threadIdSource?: string,
  ) => void;
  mapping: Record<string, string>;
}

export function useRealtimeStreaming({
  step,
  allNodes,
  allEdges = [],
  availableSources,
  serviceNodeId,
  endpoint,
  onChange,
  syncAgentInputChannels,
  mapping,
}: UseRealtimeStreamingParams) {
  const stepRef = useRef(step);
  stepRef.current = step;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastStreamingSyncKeyRef = useRef<string>("");

  // 1. Kafka Broker Nodes & Selected Broker
  const kafkaBrokerNodes = useMemo(() => {
    return allNodes.filter((n) => n.type === "kafka" || n.type === "eventstream");
  }, [allNodes]);

  // 1b. Target Web Page & Push to Client (PageRef) Node resolution
  const allWebPages = useMemo(() => {
    return allNodes.filter((n) => n.type === "webPage");
  }, [allNodes]);

  // Detect which WebPage node invokes/connects to this endpoint
  const invokingPage = useMemo(() => {
    return resolveInvokingPage(allNodes, allEdges, serviceNodeId, endpoint);
  }, [allEdges, allNodes, endpoint, serviceNodeId]);

  // Default target page: the invoking page, or root page, or first webPage
  const defaultTargetPage = useMemo(() => {
    return (
      invokingPage ||
      allWebPages.find((p) => p.data?.isRoot === true || p.data?.label === "/") ||
      allWebPages[0]
    );
  }, [invokingPage, allWebPages]);

  const selectedTargetPageId =
    step.clientDeliveryTargetPageId || defaultTargetPage?.id || "";

  // Connected push to client (page_ref) node on canvas
  const connectedPageRefNode = useMemo(() => {
    return resolveConnectedPageRefNode(
      allNodes,
      allEdges,
      serviceNodeId,
      endpoint,
      step.clientDeliveryPageRefNodeId,
    );
  }, [allEdges, allNodes, endpoint, serviceNodeId, step.clientDeliveryPageRefNodeId]);

  const ssePageRefNode = connectedPageRefNode;

  const handleConnectPushToClientNode = useCallback(
    (targetPageIdToConnect?: string) => {
      if (!serviceNodeId) return;
      const targetPageId =
        targetPageIdToConnect || selectedTargetPageId || defaultTargetPage?.id;
      if (!targetPageId) return;

      const store = useBackendCanvasStore.getState();
      const prevTargetPageId = step.clientDeliveryTargetPageId;
      if (prevTargetPageId && prevTargetPageId !== targetPageId) {
        removeDerivedConnection(store, prevTargetPageId, step.id);
      }

      const conn = ensurePageRefConnection({
        targetPageId,
        pageRefNodeId: step.clientDeliveryPageRefNodeId,
        serviceNodeId,
        endpointId: endpoint?.id,
        stepId: step.id,
      });

      const nextTargetPageId = conn?.targetPageId || targetPageId;
      const nextRefId = conn?.pageRefNodeId || step.clientDeliveryPageRefNodeId;
      const nextStep = {
        ...step,
        clientDeliveryTargetPageId: nextTargetPageId,
        clientDeliveryPageRefNodeId: nextRefId,
      };

      if (conn?.pageRefNodeId) {
        onChange(nextStep);
      }

      if (step.langGraphStreamingEnabled) {
        const proto = step.langGraphStreamingProtocol || "sse";
        if (proto === "sse" || proto === "websocket") {
          const sourceItemName = endpoint ? endpoint.name || "Endpoint" : undefined;
          const sourceItemId = endpoint ? endpoint.id : undefined;
          upsertDerivedConnection(
            store,
            nextTargetPageId,
            nextStep,
            serviceNodeId,
            sourceItemName,
            sourceItemId,
            "endpoint",
          );
        }
      }
    },
    [
      serviceNodeId,
      selectedTargetPageId,
      defaultTargetPage,
      step,
      endpoint,
      onChange,
    ],
  );

  // Auto-connect push to client (page_ref) node and sync derived realtime connection when streaming is enabled
  useEffect(() => {
    if (!step.langGraphStreamingEnabled || !serviceNodeId) return;
    const proto = step.langGraphStreamingProtocol || "sse";
    if (proto === "sse" || proto === "websocket") {
      const targetPageId = step.clientDeliveryTargetPageId || defaultTargetPage?.id;
      if (targetPageId) {
        const syncKey = `${step.id}:${step.langGraphStreamingEnabled}:${proto}:${targetPageId}:${step.clientDeliveryPageRefNodeId || ""}:${endpoint?.id || ""}`;
        if (lastStreamingSyncKeyRef.current === syncKey) {
          return;
        }
        lastStreamingSyncKeyRef.current = syncKey;

        const store = useBackendCanvasStore.getState();
        const conn = ensurePageRefConnection({
          targetPageId,
          pageRefNodeId: step.clientDeliveryPageRefNodeId,
          serviceNodeId,
          endpointId: endpoint?.id,
          stepId: step.id,
        });
        const resolvedTargetPageId = conn?.targetPageId || targetPageId;
        const resolvedPageRefNodeId = conn?.pageRefNodeId || step.clientDeliveryPageRefNodeId;

        if (
          conn?.pageRefNodeId &&
          (conn.pageRefNodeId !== step.clientDeliveryPageRefNodeId ||
            conn.targetPageId !== step.clientDeliveryTargetPageId)
        ) {
          onChangeRef.current({
            ...stepRef.current,
            clientDeliveryTargetPageId: resolvedTargetPageId,
            clientDeliveryPageRefNodeId: resolvedPageRefNodeId,
          });
        }

        const sourceItemName = endpoint ? endpoint.name || "Endpoint" : undefined;
        const sourceItemId = endpoint ? endpoint.id : undefined;
        upsertDerivedConnection(
          store,
          resolvedTargetPageId,
          {
            ...stepRef.current,
            clientDeliveryTargetPageId: resolvedTargetPageId,
            clientDeliveryPageRefNodeId: resolvedPageRefNodeId,
          },
          serviceNodeId,
          sourceItemName,
          sourceItemId,
          "endpoint",
        );
      }
    }
  }, [
    step.id,
    step.langGraphStreamingEnabled,
    step.langGraphStreamingProtocol,
    step.clientDeliveryTargetPageId,
    step.clientDeliveryPageRefNodeId,
    defaultTargetPage?.id,
    serviceNodeId,
    endpoint?.id,
    endpoint?.name,
  ]);

  const selectedKafkaBrokerNode = useMemo(() => {
    if (step.langGraphStreamingKafkaNodeId) {
      const found = kafkaBrokerNodes.find((n) => n.id === step.langGraphStreamingKafkaNodeId);
      if (found) return found;
    }
    return kafkaBrokerNodes[0];
  }, [kafkaBrokerNodes, step.langGraphStreamingKafkaNodeId]);

  // Extract Kafka topics available on the selected Kafka broker
  const availableKafkaTopics = useMemo(() => {
    if (!selectedKafkaBrokerNode?.data?.topics) return [];
    const topics: string[] = [];
    selectedKafkaBrokerNode.data.topics.forEach((t: KafkaTopic) => {
      const name = t.name || t.id;
      if (name && !topics.includes(name)) topics.push(name);
    });
    return topics;
  }, [selectedKafkaBrokerNode]);

  // 2. Redis Nodes & Selected Redis Node
  const redisNodes = useMemo(() => {
    return allNodes.filter(
      (n) => n.type === "redis-streams" || n.type === "redis-pubsub" || n.type === "redis-cache",
    );
  }, [allNodes]);

  const selectedRedisNode = useMemo(() => {
    if (step.langGraphStreamingRedisNodeId) {
      const found = redisNodes.find((n) => n.id === step.langGraphStreamingRedisNodeId);
      if (found) return found;
    }
    return redisNodes[0];
  }, [redisNodes, step.langGraphStreamingRedisNodeId]);

  // Extract Redis streams available on the selected Redis node
  const availableRedisStreams = useMemo(() => {
    if (!selectedRedisNode?.data?.streams) return [];
    const streams: string[] = [];
    selectedRedisNode.data.streams.forEach((s: RedisStream) => {
      const name = s.name || s.id;
      if (name && !streams.includes(name)) streams.push(name);
    });
    return streams;
  }, [selectedRedisNode]);

  const isStreaming = step.langGraphStreamingEnabled ?? false;
  const streamingProtocol = step.langGraphStreamingProtocol || "sse";
  const outputMode = step.langGraphOutputMode || "full_state";
  const streamingFields = step.langGraphStreamingFields || [];
  const outputFields = step.langGraphOutputFields || [];

  const handleArgBindingChange = useCallback(
    (
      argName: string,
      updated: StepBinding,
      fieldKey:
        | "langGraphStreamingKafkaKey"
        | "langGraphStreamingRoom"
        | "langGraphStreamingRedisKey",
    ) => {
      const currentBindings = step.inputBindings || [];
      const otherBindings = currentBindings.filter((b) => b.argName !== argName);
      const nextBindings: StepBinding[] = [...otherBindings, { argName, source: updated.source }];
      const accessor = stepSourceToAccessor(updated.source, availableSources);
      const nextStep = {
        ...step,
        inputBindings: nextBindings,
        [fieldKey]: accessor,
      };
      onChange(nextStep);
      syncAgentInputChannels(nextBindings, mapping);

      if (
        fieldKey === "langGraphStreamingRoom" &&
        step.langGraphStreamingEnabled &&
        (step.langGraphStreamingProtocol === "websocket" || streamingProtocol === "websocket")
      ) {
        const targetPageId = step.clientDeliveryTargetPageId || defaultTargetPage?.id;
        if (targetPageId) {
          const store = useBackendCanvasStore.getState();
          const sourceItemName = endpoint ? endpoint.name || "Endpoint" : undefined;
          const sourceItemId = endpoint ? endpoint.id : undefined;
          upsertDerivedConnection(
            store,
            targetPageId,
            nextStep,
            serviceNodeId,
            sourceItemName,
            sourceItemId,
            "endpoint",
          );
        }
      }
    },
    [step, availableSources, onChange, syncAgentInputChannels, mapping, streamingProtocol, defaultTargetPage?.id, endpoint, serviceNodeId],
  );

  const handleResetArgBinding = useCallback(
    (
      argName: string,
      fieldKey:
        | "langGraphStreamingKafkaKey"
        | "langGraphStreamingRoom"
        | "langGraphStreamingRedisKey",
    ) => {
      const currentBindings = step.inputBindings || [];
      const nextBindings = currentBindings.filter((b) => b.argName !== argName);
      const nextStep = { ...step, inputBindings: nextBindings };
      delete nextStep[fieldKey];
      onChange(nextStep);
      syncAgentInputChannels(nextBindings, mapping);

      if (
        fieldKey === "langGraphStreamingRoom" &&
        step.langGraphStreamingEnabled &&
        (step.langGraphStreamingProtocol === "websocket" || streamingProtocol === "websocket")
      ) {
        const targetPageId = step.clientDeliveryTargetPageId || defaultTargetPage?.id;
        if (targetPageId) {
          const store = useBackendCanvasStore.getState();
          const sourceItemName = endpoint ? endpoint.name || "Endpoint" : undefined;
          const sourceItemId = endpoint ? endpoint.id : undefined;
          upsertDerivedConnection(
            store,
            targetPageId,
            nextStep,
            serviceNodeId,
            sourceItemName,
            sourceItemId,
            "endpoint",
          );
        }
      }
    },
    [step, onChange, syncAgentInputChannels, mapping, streamingProtocol, defaultTargetPage?.id, endpoint, serviceNodeId],
  );

  const handleToggleStreaming = useCallback(
    (enabled: boolean) => {
      let nextStep: PipelineStepDraft = {
        ...step,
        langGraphStreamingEnabled: enabled,
        langGraphStreamingProtocol: enabled ? (step.langGraphStreamingProtocol || streamingProtocol || "sse") : undefined,
      };
      const proto = nextStep.langGraphStreamingProtocol || streamingProtocol || "sse";
      if (enabled && serviceNodeId && proto === "websocket") {
        ensureWsPackageInService({ serviceNodeId });
      }
      const store = useBackendCanvasStore.getState();
      const sourceItemName = endpoint ? endpoint.name || "Endpoint" : undefined;
      const sourceItemId = endpoint ? endpoint.id : undefined;

      if (enabled && serviceNodeId && (proto === "sse" || proto === "websocket")) {
        const targetPageId = nextStep.clientDeliveryTargetPageId || defaultTargetPage?.id;
        if (targetPageId) {
          const conn = ensurePageRefConnection({
            targetPageId,
            pageRefNodeId: nextStep.clientDeliveryPageRefNodeId,
            serviceNodeId,
            endpointId: endpoint?.id,
            stepId: step.id,
          });
          const resolvedPageId = conn?.targetPageId || targetPageId;
          const resolvedRefId = conn?.pageRefNodeId || nextStep.clientDeliveryPageRefNodeId;
          nextStep = {
            ...nextStep,
            clientDeliveryTargetPageId: resolvedPageId,
            clientDeliveryPageRefNodeId: resolvedRefId,
          };
          upsertDerivedConnection(
            store,
            resolvedPageId,
            nextStep,
            serviceNodeId,
            sourceItemName,
            sourceItemId,
            "endpoint",
          );
        }
      } else if (!enabled && step.clientDeliveryTargetPageId) {
        removeDerivedConnection(store, step.clientDeliveryTargetPageId, step.id);
      }
      onChange(nextStep);
    },
    [step, streamingProtocol, serviceNodeId, endpoint, defaultTargetPage?.id, onChange],
  );

  const handleProtocolChange = useCallback(
    (proto: "raw" | "sse" | "websocket" | "kafka" | "redis_stream") => {
      const nextStep = {
        ...step,
        langGraphStreamingProtocol: proto,
        clientDeliveryProtocol: proto === "websocket" ? ("WEBSOCKET" as const) : ("SSE" as const),
      };
      onChange(nextStep);
      if (proto === "websocket" && serviceNodeId) {
        ensureWsPackageInService({ serviceNodeId });
      }
      const store = useBackendCanvasStore.getState();
      const targetPageId = step.clientDeliveryTargetPageId || defaultTargetPage?.id;
      const sourceItemName = endpoint ? endpoint.name || "Endpoint" : undefined;
      const sourceItemId = endpoint ? endpoint.id : undefined;

      if (step.langGraphStreamingEnabled && targetPageId) {
        if (proto === "sse" || proto === "websocket") {
          upsertDerivedConnection(
            store,
            targetPageId,
            nextStep,
            serviceNodeId,
            sourceItemName,
            sourceItemId,
            "endpoint",
          );
        } else {
          removeDerivedConnection(store, targetPageId, step.id);
        }
      }
    },
    [step, serviceNodeId, defaultTargetPage?.id, endpoint, onChange],
  );

  const handleToggleStreamMode = useCallback(
    (mode: LangGraphStreamMode) => {
      const current: LangGraphStreamMode[] =
        step.langGraphStreamModes && step.langGraphStreamModes.length > 0
          ? [...step.langGraphStreamModes]
          : ["messages"];
      const exists = current.includes(mode);
      let next: LangGraphStreamMode[];
      if (exists) {
        next = current.filter((m) => m !== mode);
        if (next.length === 0) next = ["messages"];
      } else {
        next = [...current, mode];
      }
      onChange({
        ...step,
        langGraphStreamModes: next,
      });
    },
    [step, onChange],
  );

  const handleToggleIncludeReasoning = useCallback(
    (enabled: boolean) => {
      onChange({
        ...step,
        langGraphStreamIncludeReasoning: enabled,
      });
    },
    [step, onChange],
  );

  const handleToggleIncludeSubgraphs = useCallback(
    (enabled: boolean) => {
      onChange({
        ...step,
        langGraphStreamSubgraphs: enabled,
      });
    },
    [step, onChange],
  );

  const handleKafkaBrokerChange = useCallback(
    (brokerId: string, firstTopic?: string) => {
      onChange({
        ...step,
        langGraphStreamingKafkaNodeId: brokerId,
        langGraphStreamingKafkaTopic: firstTopic || step.langGraphStreamingKafkaTopic || "",
      });
    },
    [step, onChange],
  );

  const handleKafkaTopicChange = useCallback(
    (topic: string) => {
      onChange({
        ...step,
        langGraphStreamingKafkaTopic: topic,
      });
    },
    [step, onChange],
  );

  const handleRedisNodeChange = useCallback(
    (redisId: string, firstStream?: string) => {
      onChange({
        ...step,
        langGraphStreamingRedisNodeId: redisId,
        langGraphStreamingRedisKey: firstStream || step.langGraphStreamingRedisKey || "",
      });
    },
    [step, onChange],
  );

  const handleRedisKeyChange = useCallback(
    (key: string) => {
      onChange({
        ...step,
        langGraphStreamingRedisKey: key,
      });
    },
    [step, onChange],
  );

  const handleOutputModeChange = useCallback(
    (mode: "full_state" | "last_message" | "specific_fields") => {
      onChange({
        ...step,
        langGraphOutputMode: mode,
      });
    },
    [step, onChange],
  );

  const handleToggleStreamingField = useCallback(
    (channelKey: string) => {
      const nextFields = streamingFields.includes(channelKey)
        ? streamingFields.filter((k) => k !== channelKey)
        : [...streamingFields, channelKey];
      onChange({
        ...step,
        langGraphStreamingFields: nextFields,
      });
    },
    [streamingFields, step, onChange],
  );

  const handleToggleOutputField = useCallback(
    (channelKey: string) => {
      const nextFields = outputFields.includes(channelKey)
        ? outputFields.filter((k) => k !== channelKey)
        : [...outputFields, channelKey];
      onChange({
        ...step,
        langGraphOutputFields: nextFields,
      });
    },
    [outputFields, step, onChange],
  );

  const trackTokenUsage = Boolean(step.langGraphTrackTokenUsage);

  const handleToggleTrackTokenUsage = useCallback(
    (enabled: boolean) => {
      onChange({
        ...step,
        langGraphTrackTokenUsage: enabled,
      });
    },
    [step, onChange],
  );

  const kafkaKeyBinding = useMemo(() => {
    return getArgBinding(
      step,
      availableSources,
      "partition_key",
      step.langGraphStreamingKafkaKey,
      step.langGraphThreadIdSource || "body.thread_id",
    );
  }, [step, availableSources]);

  const hasCustomKafkaKey = useMemo(() => {
    return Boolean(
      step.langGraphStreamingKafkaKey ||
        (step.inputBindings || []).some((b) => b.argName === "partition_key"),
    );
  }, [step.langGraphStreamingKafkaKey, step.inputBindings]);

  const redisStreamKeyBinding = useMemo(() => {
    return getArgBinding(
      step,
      availableSources,
      "stream_key",
      step.langGraphStreamingRedisKey,
      step.langGraphThreadIdSource
        ? `stream:agent:\${${step.langGraphThreadIdSource}}`
        : "stream:agent:default",
    );
  }, [step, availableSources]);

  const hasCustomRedisStreamKey = useMemo(() => {
    return Boolean(
      step.langGraphStreamingRedisKey ||
        (step.inputBindings || []).some((b) => b.argName === "stream_key"),
    );
  }, [step.langGraphStreamingRedisKey, step.inputBindings]);

  const roomBinding = useMemo(() => {
    return getArgBinding(
      step,
      availableSources,
      "room_id",
      step.langGraphStreamingRoom,
      step.langGraphThreadIdSource || "body.thread_id",
    );
  }, [step, availableSources]);

  const hasCustomRoom = useMemo(() => {
    return Boolean(
      step.langGraphStreamingRoom ||
        (step.inputBindings || []).some((b) => b.argName === "room_id"),
    );
  }, [step.langGraphStreamingRoom, step.inputBindings]);

  return {
    kafkaBrokerNodes,
    selectedKafkaBrokerNode,
    availableKafkaTopics,
    redisNodes,
    selectedRedisNode,
    availableRedisStreams,
    allWebPages,
    invokingPage,
    defaultTargetPage,
    selectedTargetPageId,
    connectedPageRefNode,
    ssePageRefNode,
    isStreaming,
    streamingProtocol,
    outputMode,
    streamingFields,
    outputFields,
    handleConnectPushToClientNode,
    handleToggleStreaming,
    handleProtocolChange,
    handleToggleStreamMode,
    handleToggleIncludeReasoning,
    handleToggleIncludeSubgraphs,
    handleKafkaBrokerChange,
    handleKafkaTopicChange,
    handleRedisNodeChange,
    handleRedisKeyChange,
    handleOutputModeChange,
    handleToggleStreamingField,
    handleToggleOutputField,
    handleRoomBindingChange: (updated: StepBinding) =>
      handleArgBindingChange("room_id", updated, "langGraphStreamingRoom"),
    handleResetRoomBinding: () =>
      handleResetArgBinding("room_id", "langGraphStreamingRoom"),
    handleKafkaKeyBindingChange: (updated: StepBinding) =>
      handleArgBindingChange("partition_key", updated, "langGraphStreamingKafkaKey"),
    handleResetKafkaKeyBinding: () =>
      handleResetArgBinding("partition_key", "langGraphStreamingKafkaKey"),
    handleRedisKeyBindingChange: (updated: StepBinding) =>
      handleArgBindingChange("stream_key", updated, "langGraphStreamingRedisKey"),
    handleResetRedisKeyBinding: () =>
      handleResetArgBinding("stream_key", "langGraphStreamingRedisKey"),
    kafkaKeyBinding,
    hasCustomKafkaKey,
    redisStreamKeyBinding,
    hasCustomRedisStreamKey,
    roomBinding,
    hasCustomRoom,
    trackTokenUsage,
    handleToggleTrackTokenUsage,
  };
}

