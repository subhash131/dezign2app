"use client";

import React from "react";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { BackendNode, BackendEdge, Endpoint } from "@workspace/canvas/types";
import { PipelineStepDraft, AvailableSource } from "./types";
import {
  stepSourceToAccessor,
  accessorToStepSource,
  isDedicatedChannel,
  AgentSelectorSection,
  SessionThreadIdSection,
  ConversationMessagesSection,
  StateChannelPayloadSection,
  StreamingAndOutputSection,
  useAgentTargeting,
  useSessionThreadId,
  useConversationMessages,
  useStateChannelPayload,
  useRealtimeStreaming,
} from "./langgraph-invoke";

export { stepSourceToAccessor, accessorToStepSource, isDedicatedChannel };

export interface LangGraphInvokeStepSectionProps {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  allEdges?: BackendEdge[];
  availableSources?: AvailableSource[];
  serviceNodeId?: string;
  onChange: (updated: PipelineStepDraft) => void;
  endpoint?: Endpoint;
  onEndpointChange?: (changes: Partial<Endpoint>) => void;
  children?: React.ReactNode;
}

export const LangGraphInvokeStepSection: React.FC<
  LangGraphInvokeStepSectionProps
> = ({
  step,
  allNodes,
  allEdges = [],
  availableSources = [],
  serviceNodeId,
  onChange,
  endpoint,
  onEndpointChange,
  children,
}) => {
  const params = useParams();
  const rawProjectId = params?.projectId;
  const projectId =
    typeof rawProjectId === "string"
      ? rawProjectId
      : Array.isArray(rawProjectId)
        ? rawProjectId[0]
        : "";

  // 1. Agent selection, public contract input channels & canvas store syncing
  const {
    availableAgents,
    selectedAgentNode,
    inputChannels,
    stateChannels,
    declaredChannels,
    syncAgentInputChannels,
    handleSelectAgent,
    handleOpenStudio,
  } = useAgentTargeting({
    step,
    allNodes,
    endpoint,
    projectId,
    onChange,
  });

  // 2. Session checkpointer memory & thread ID management
  const {
    hasMemory,
    checkpointerWarning,
    endpointHasThreadId,
    threadBinding,
    handleThreadBindingChange,
    handleAddThreadIdToRequestBody,
    handleUseHeaderThreadId,
  } = useSessionThreadId({
    step,
    selectedAgentNode,
    allNodes,
    allEdges,
    endpoint,
    onEndpointChange,
    availableSources,
    onChange,
    syncAgentInputChannels,
  });

  // 3. State Channel Payload mapping and custom bindings
  const {
    mapping,
    newKey,
    setNewKey,
    newCustomBinding,
    setNewCustomBinding,
    mappedDeclaredChannels,
    customKeys,
    unmappedDeclaredChannels,
    getBindingForChannel,
    handleBindingChange,
    handleRemoveMapping,
    handleAddChannel,
    handleAutoMap,
    handleAddCustomField,
  } = useStateChannelPayload({
    step,
    declaredChannels,
    stateChannels,
    inputChannels,
    hasMemory,
    availableSources,
    selectedAgentNode,
    onChange,
    syncAgentInputChannels,
  });

  // 4. Conversation & Messages configuration (single vs bulk, system prompt, AI message prompt)
  const conversationMessages = useConversationMessages({
    step,
    mapping,
    availableSources,
    onChange,
  });

  // 5. Realtime Streaming & Output delivery
  const realtimeStreaming = useRealtimeStreaming({
    step,
    allNodes,
    allEdges,
    availableSources,
    serviceNodeId,
    endpoint,
    onChange,
    syncAgentInputChannels,
    mapping,
  });

  if (availableAgents.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold">No LangGraph Agent Found</span>
        </div>
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          There are no LangGraph agent nodes currently present on this canvas.
          Add a LangGraph node from the canvas sidebar to connect it to this
          pipeline step.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Target Agent Selector */}
      <AgentSelectorSection
        availableAgents={availableAgents}
        selectedAgentNode={selectedAgentNode}
        inputChannels={inputChannels}
        stateChannels={stateChannels}
        projectId={projectId}
        onSelectAgent={handleSelectAgent}
        onOpenStudio={handleOpenStudio}
      />

      {/* Memory Checkpointer Thread ID Section */}
      <SessionThreadIdSection
        hasMemory={hasMemory}
        selectedAgentNode={selectedAgentNode}
        checkpointerWarning={checkpointerWarning}
        threadIdSource={step.langGraphThreadIdSource}
        threadBinding={threadBinding}
        availableSources={availableSources}
        serviceNodeId={serviceNodeId}
        endpointHasThreadId={endpointHasThreadId}
        canEditEndpoint={Boolean(onEndpointChange)}
        projectId={projectId}
        onThreadBindingChange={handleThreadBindingChange}
        onAddThreadIdToRequestBody={handleAddThreadIdToRequestBody}
        onUseHeaderThreadId={handleUseHeaderThreadId}
      />

      {/* Dedicated Conversation & Messages Input Section */}
      <ConversationMessagesSection
        effectiveMessagesMode={conversationMessages.effectiveMessagesMode}
        userMessageBinding={conversationMessages.userMessageBinding}
        systemMessageBinding={conversationMessages.systemMessageBinding}
        aiMessageBinding={conversationMessages.aiMessageBinding}
        bulkMessagesBinding={conversationMessages.bulkMessagesBinding}
        hasSystemPrompt={conversationMessages.hasSystemPrompt}
        hasAiMessage={conversationMessages.hasAiMessage}
        availableSources={availableSources}
        serviceNodeId={serviceNodeId}
        onMessagesModeChange={conversationMessages.handleMessagesModeChange}
        onUserMessageBindingChange={conversationMessages.handleUserMessageBindingChange}
        onSystemMessageBindingChange={conversationMessages.handleSystemMessageBindingChange}
        onAiMessageBindingChange={conversationMessages.handleAiMessageBindingChange}
        onBulkMessagesBindingChange={conversationMessages.handleBulkMessagesBindingChange}
        onAddSystemPrompt={conversationMessages.handleAddSystemPrompt}
        onRemoveSystemPrompt={conversationMessages.handleRemoveSystemPrompt}
        onAddAiMessage={conversationMessages.handleAddAiMessage}
        onRemoveAiMessage={conversationMessages.handleRemoveAiMessage}
      />

      {/* State Channels Mapping */}
      <StateChannelPayloadSection
        mappedDeclaredChannels={mappedDeclaredChannels}
        customKeys={customKeys}
        unmappedDeclaredChannels={unmappedDeclaredChannels}
        hasMemory={hasMemory}
        availableSources={availableSources}
        serviceNodeId={serviceNodeId}
        getBindingForChannel={getBindingForChannel}
        onBindingChange={handleBindingChange}
        onRemoveMapping={handleRemoveMapping}
        onAutoMap={handleAutoMap}
        onAddChannel={handleAddChannel}
        newKey={newKey}
        onNewKeyChange={setNewKey}
        newCustomBinding={newCustomBinding}
        onNewCustomBindingChange={setNewCustomBinding}
        onAddCustomField={handleAddCustomField}
      />

      {/* Streaming & Output Delivery Section */}
      <StreamingAndOutputSection
        isStreaming={realtimeStreaming.isStreaming}
        streamingProtocol={realtimeStreaming.streamingProtocol}
        outputMode={realtimeStreaming.outputMode}
        streamingFields={realtimeStreaming.streamingFields}
        outputFields={realtimeStreaming.outputFields}
        stateChannels={stateChannels}
        kafkaBrokerNodes={realtimeStreaming.kafkaBrokerNodes}
        selectedKafkaBrokerNode={realtimeStreaming.selectedKafkaBrokerNode}
        availableKafkaTopics={realtimeStreaming.availableKafkaTopics}
        kafkaTopic={step.langGraphStreamingKafkaTopic}
        kafkaKeyBinding={realtimeStreaming.kafkaKeyBinding}
        hasCustomKafkaKey={realtimeStreaming.hasCustomKafkaKey}
        redisNodes={realtimeStreaming.redisNodes}
        selectedRedisNode={realtimeStreaming.selectedRedisNode}
        availableRedisStreams={realtimeStreaming.availableRedisStreams}
        redisStreamKey={step.langGraphStreamingRedisKey}
        redisStreamKeyBinding={realtimeStreaming.redisStreamKeyBinding}
        hasCustomRedisStreamKey={realtimeStreaming.hasCustomRedisStreamKey}
        roomBinding={realtimeStreaming.roomBinding}
        hasCustomRoom={realtimeStreaming.hasCustomRoom}
        threadIdSource={step.langGraphThreadIdSource}
        availableSources={availableSources}
        serviceNodeId={serviceNodeId}
        streamModes={
          step.langGraphStreamModes && step.langGraphStreamModes.length > 0
            ? step.langGraphStreamModes
            : ["messages"]
        }
        includeReasoning={step.langGraphStreamIncludeReasoning !== false}
        includeSubgraphs={Boolean(step.langGraphStreamSubgraphs)}
        ssePageRefNode={realtimeStreaming.ssePageRefNode}
        allWebPages={realtimeStreaming.allWebPages}
        invokingPage={realtimeStreaming.invokingPage}
        selectedTargetPageId={realtimeStreaming.selectedTargetPageId}
        connectedPageRefNode={realtimeStreaming.connectedPageRefNode}
        onTargetPageChange={(newPageId) => realtimeStreaming.handleConnectPushToClientNode(newPageId)}
        onConnectPushToClient={() => realtimeStreaming.handleConnectPushToClientNode()}
        onToggleStreaming={realtimeStreaming.handleToggleStreaming}
        onProtocolChange={realtimeStreaming.handleProtocolChange}
        onToggleStreamMode={realtimeStreaming.handleToggleStreamMode}
        onToggleIncludeReasoning={realtimeStreaming.handleToggleIncludeReasoning}
        onToggleIncludeSubgraphs={realtimeStreaming.handleToggleIncludeSubgraphs}
        onKafkaBrokerChange={realtimeStreaming.handleKafkaBrokerChange}
        onKafkaTopicChange={realtimeStreaming.handleKafkaTopicChange}
        onRedisNodeChange={realtimeStreaming.handleRedisNodeChange}
        onRedisKeyChange={realtimeStreaming.handleRedisKeyChange}
        onOutputModeChange={realtimeStreaming.handleOutputModeChange}
        onToggleStreamingField={realtimeStreaming.handleToggleStreamingField}
        onToggleOutputField={realtimeStreaming.handleToggleOutputField}
        onRoomBindingChange={realtimeStreaming.handleRoomBindingChange}
        onResetRoomBinding={realtimeStreaming.handleResetRoomBinding}
        onKafkaKeyBindingChange={realtimeStreaming.handleKafkaKeyBindingChange}
        onResetKafkaKeyBinding={realtimeStreaming.handleResetKafkaKeyBinding}
        onRedisKeyBindingChange={realtimeStreaming.handleRedisKeyBindingChange}
        onResetRedisKeyBinding={realtimeStreaming.handleResetRedisKeyBinding}
        trackTokenUsage={realtimeStreaming.trackTokenUsage}
        onToggleTrackTokenUsage={realtimeStreaming.handleToggleTrackTokenUsage}
      />

      {children}
    </div>
  );
};
