"use client";

import React, { useMemo } from "react";
import {
  BackendNode,
  BackendEdge,
  KafkaTopic,
} from "@workspace/canvas/types";
import { toFolderName, toPascalCase, toVarName } from "@/lib/compiler/utils";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Radio, Layers, Code2, Settings, Sparkles, Send } from "lucide-react";
import { PipelineStepDraft, ExpectedArg, StepBinding } from "./types";

export interface KafkaPublishStepSectionProps {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  expectedArgs?: ExpectedArg[];
  showAdvancedSettings: boolean;
  onToggleAdvancedSettings: () => void;
  onChange: (updated: PipelineStepDraft) => void;
  onAutoMapArguments?: () => void;
  children?: React.ReactNode;
}

export interface UnifiedBrokerResource {
  id: string;
  name: string;
  kind: "topic" | "queue" | "stream" | "channel" | "message";
  description?: string;
  schema?: string;
  payloadSchema?: {
    fields?: Array<{ name?: string; type?: string; required?: boolean; description?: string }>;
    rawJson?: string;
  };
}

export const KafkaPublishStepSection = ({
  step,
  allNodes,
  allEdges,
  expectedArgs,
  showAdvancedSettings,
  onToggleAdvancedSettings,
  onChange,
  onAutoMapArguments,
  children,
}: KafkaPublishStepSectionProps) => {
  // 1. Identify all messaging broker nodes
  const brokerNodes = useMemo(
    () =>
      allNodes.filter(
        (n) =>
          n.type === "kafka" ||
          n.type === "eventstream" ||
          n.type === "sqs" ||
          n.type === "redis-streams" ||
          n.type === "redis-pubsub" ||
          n.type === "queue" ||
          n.type === "pubsub",
      ),
    [allNodes],
  );

  // Selected broker node
  const selectedBrokerNode = useMemo(() => {
    if (step.brokerNodeId) {
      return brokerNodes.find((b) => b.id === step.brokerNodeId);
    }
    return brokerNodes[0];
  }, [brokerNodes, step.brokerNodeId]);

  // 2. Extract topics / messaging resources for the selected broker
  const availableResources = useMemo((): UnifiedBrokerResource[] => {
    if (!selectedBrokerNode) return [];

    const data = selectedBrokerNode.data || {};
    const resources: UnifiedBrokerResource[] = [];

    type ResourceItemLike = { id?: string; name: string; description?: string; schema?: string };

    // Kafka Topics
    if (data.topics && Array.isArray(data.topics)) {
      data.topics.forEach((t: KafkaTopic) => {
        resources.push({
          id: t.id || t.name,
          name: t.name,
          kind: "topic",
          description: t.description,
          schema: t.schema,
          payloadSchema: t.payloadSchema,
        });
      });
    }

    // SQS Queues
    if (data.queues && Array.isArray(data.queues)) {
      data.queues.forEach((q: ResourceItemLike) => {
        resources.push({
          id: q.id || q.name,
          name: q.name,
          kind: "queue",
          description: q.description,
        });
      });
    }

    // Redis Streams
    if (data.streams && Array.isArray(data.streams)) {
      data.streams.forEach((s: ResourceItemLike) => {
        resources.push({
          id: s.id || s.name,
          name: s.name,
          kind: "stream",
          description: s.description,
        });
      });
    }

    // Redis PubSub Channels
    if (data.channels && Array.isArray(data.channels)) {
      data.channels.forEach((c: ResourceItemLike) => {
        resources.push({
          id: c.id || c.name,
          name: c.name,
          kind: "channel",
          description: c.description,
        });
      });
    }

    // Messages / Event Channels
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((m: ResourceItemLike) => {
        if (!resources.some((r) => r.name === m.name)) {
          resources.push({
            id: m.id || m.name,
            name: m.name,
            kind: "message",
            description: m.description,
          });
        }
      });
    }

    return resources;
  }, [selectedBrokerNode]);

  // Selected messaging resource (topic / queue / stream)
  const selectedResource = useMemo(() => {
    return availableResources.find(
      (r) =>
        r.id === step.messagingResourceId ||
        r.name === step.messagingResourceId ||
        r.name === step.functionRef?.name?.replace(/^publish/i, ""),
    );
  }, [availableResources, step.messagingResourceId, step.functionRef?.name]);

  // 3. Publisher functions available for this broker/topic
  const publisherOptions = useMemo(() => {
    const brokerLabel = selectedBrokerNode?.data?.label || "kafka";
    const packageFolder = toFolderName(brokerLabel);
    const options: Array<{
      id: string;
      name: string;
      importPath: string;
      signature: string;
      description: string;
      isGeneric?: boolean;
    }> = [];

    if (selectedResource) {
      const pascalResource = toPascalCase(selectedResource.name);
      const isKafka = selectedBrokerNode?.type === "kafka" || selectedBrokerNode?.type === "eventstream";

      if (isKafka) {
        options.push({
          id: `publish-${selectedResource.name}`,
          name: `publish${pascalResource}`,
          importPath: `@workspace/${packageFolder}/publishers`,
          signature: `publish${pascalResource}(payload: Record<string, unknown>, key?: string): Promise<void>`,
          description: `Dedicated publisher for topic "${selectedResource.name}"`,
        });
      } else {
        options.push({
          id: `publish-${selectedResource.name}`,
          name: `send${pascalResource}Message`,
          importPath: `@workspace/${packageFolder}/publishers`,
          signature: `send${pascalResource}Message(message: Record<string, unknown>): Promise<void>`,
          description: `Publisher for ${selectedResource.kind} "${selectedResource.name}"`,
        });
      }
    }

    // Generic publishKafkaEvent
    options.push({
      id: "publishKafkaEvent",
      name: "publishKafkaEvent",
      importPath: `@workspace/${packageFolder}/publishers`,
      signature: "publishKafkaEvent(topic: string, payload: Record<string, unknown>, key?: string): Promise<void>",
      description: "Generic dynamic Kafka producer function",
      isGeneric: true,
    });

    return options;
  }, [selectedBrokerNode, selectedResource]);

  const selectedPublisherOption = useMemo(() => {
    return (
      publisherOptions.find(
        (p) =>
          p.name === step.functionRef?.name ||
          p.id === step.operationId ||
          p.id === step.functionRef?.name,
      ) || publisherOptions[0]
    );
  }, [publisherOptions, step.functionRef?.name, step.operationId]);

  // Handle selecting a Broker node
  const handleSelectBroker = (brokerId: string) => {
    const broker = brokerNodes.find((b) => b.id === brokerId);
    if (!broker) return;

    const brokerLabel = broker.data?.label || "kafka";
    const packageFolder = toFolderName(brokerLabel);
    const topics: KafkaTopic[] = broker.data?.topics || [];
    const firstTopic = topics[0];

    const firstTopicSchemaFields = firstTopic?.payloadSchema?.fields || [];
    const fnName = firstTopic ? `publish${toPascalCase(firstTopic.name)}` : "publishKafkaEvent";
    const varName = firstTopic ? `publish${toPascalCase(firstTopic.name)}Result` : "publishResult";

    const initialBindings: StepBinding[] =
      firstTopicSchemaFields.length > 0
        ? firstTopicSchemaFields.map((f: { name: string }) => ({
            argName: f.name,
            source: { kind: "req_body", field: f.name },
          }))
        : fnName === "publishKafkaEvent"
        ? [
            {
              argName: "topic",
              source: {
                kind: "inline",
                value: firstTopic?.name || "events",
              },
            },
            {
              argName: "payload",
              source: { kind: "req_body", field: "" },
            },
          ]
        : [
            {
              argName: "payload",
              source: { kind: "req_body", field: "" },
            },
          ];

    onChange({
      ...step,
      brokerNodeId: broker.id,
      messagingResourceId: firstTopic?.id || firstTopic?.name,
      operationId: firstTopic ? `publish-${firstTopic.name}` : "publishKafkaEvent",
      functionRef: {
        name: fnName,
        importPath: `@workspace/${packageFolder}/publishers`,
      },
      name: varName,
      outputVariable: varName,
      inputBindings: (step.inputBindings || []).length > 0 ? step.inputBindings : initialBindings,
    });
  };

  // Handle selecting a Topic / Messaging Resource
  const handleSelectTopic = (resourceId: string) => {
    if (resourceId === "__custom__") {
      const brokerLabel = selectedBrokerNode?.data?.label || "kafka";
      const packageFolder = toFolderName(brokerLabel);
      onChange({
        ...step,
        messagingResourceId: undefined,
        operationId: "publishKafkaEvent",
        functionRef: {
          name: "publishKafkaEvent",
          importPath: `@workspace/${packageFolder}/publishers`,
        },
        name: "publishKafkaResult",
        outputVariable: "publishKafkaResult",
      });
      return;
    }

    const res = availableResources.find((r) => r.id === resourceId || r.name === resourceId);
    if (!res) return;

    const brokerLabel = selectedBrokerNode?.data?.label || "kafka";
    const packageFolder = toFolderName(brokerLabel);
    const pascalName = toPascalCase(res.name);
    const fnName = `publish${pascalName}`;
    const varName = `${toVarName(fnName)}Result`;

    const resSchemaFields = res.payloadSchema?.fields || [];
    const fallbackBindings: StepBinding[] =
      resSchemaFields.length > 0
        ? resSchemaFields.map((f) => ({
            argName: f.name || "payload",
            source: { kind: "req_body", field: f.name || "" },
          }))
        : [
            {
              argName: "payload",
              source: { kind: "req_body", field: "" },
            },
          ];

    const initialBindings: StepBinding[] =
      (step.inputBindings || []).length > 0
        ? step.inputBindings!
        : fallbackBindings;

    onChange({
      ...step,
      messagingResourceId: res.id,
      operationId: `publish-${res.name}`,
      functionRef: {
        name: fnName,
        importPath: `@workspace/${packageFolder}/publishers`,
        signature: `publish${pascalName}(payload: Record<string, unknown>, key?: string): Promise<void>`,
      },
      name: varName,
      outputVariable: varName,
      inputBindings: initialBindings,
    });
  };

  // Handle selecting a Publisher Function
  const handleSelectPublisherFunction = (fnId: string) => {
    const opt = publisherOptions.find((o) => o.id === fnId || o.name === fnId);
    if (!opt) return;

    const isGeneric = opt.name === "publishKafkaEvent";
    const varName = isGeneric ? "publishKafkaResult" : `${toVarName(opt.name)}Result`;

    let bindings = [...(step.inputBindings || [])];
    if (isGeneric && !bindings.some((b) => b.argName === "topic")) {
      bindings = [
        {
          argName: "topic",
          source: {
            kind: "inline",
            value: selectedResource?.name || "events",
          },
        },
        ...bindings,
      ];
    }

    onChange({
      ...step,
      operationId: opt.id,
      functionRef: {
        name: opt.name,
        importPath: opt.importPath,
        signature: opt.signature,
      },
      name: varName,
      outputVariable: varName,
      inputBindings: bindings,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-2.5 rounded-lg border border-orange-500/25 bg-orange-500/[0.04]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400">
          <Radio size={13} />
          <span>Kafka & Event Messaging Publisher</span>
        </div>
        {selectedPublisherOption && (
          <span className="text-[10px] font-mono text-orange-300 bg-orange-500/15 border border-orange-500/25 px-1.5 py-0.2 rounded font-medium">
            {selectedPublisherOption.name}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {/* 1. Broker selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Radio size={10} /> Event Broker
          </Label>
          <Select
            value={selectedBrokerNode?.id || brokerNodes[0]?.id || "__none__"}
            onValueChange={handleSelectBroker}
          >
            <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono w-full">
              <SelectValue placeholder="Select Event Broker..." />
            </SelectTrigger>
            <SelectContent>
              {brokerNodes.length === 0 ? (
                <SelectItem value="__none__" className="text-xs text-muted-foreground">
                  No event brokers on canvas
                </SelectItem>
              ) : (
                brokerNodes
                  .filter((b) => Boolean(b && b.id && b.id.trim()))
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs font-mono">
                      📡 {b.data?.label || "Event Broker"} ({b.type})
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* 2. Topic / Resource selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Layers size={10} /> Topic / Messaging Channel
          </Label>
          <Select
            value={selectedResource?.id || (step.messagingResourceId ? step.messagingResourceId : "__custom__")}
            onValueChange={handleSelectTopic}
          >
            <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono w-full">
              <SelectValue placeholder="Select Topic..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__custom__" className="text-xs font-mono text-primary font-semibold">
                ✨ Dynamic / Generic Topic (publishKafkaEvent)
              </SelectItem>
              {availableResources
                .filter((res) => Boolean(res && res.id && res.id.trim()))
                .map((res) => (
                  <SelectItem key={res.id} value={res.id} className="text-xs font-mono">
                    🏷️ {res.name}
                    <span className="text-[9px] text-muted-foreground ml-1.5 uppercase">
                      ({res.kind})
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. Publisher Function selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Code2 size={10} /> Publisher Function
          </Label>
          <Select
            value={selectedPublisherOption?.id || selectedPublisherOption?.name || "publishKafkaEvent"}
            onValueChange={handleSelectPublisherFunction}
          >
            <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono w-full">
              <SelectValue placeholder="Choose Publisher Function..." />
            </SelectTrigger>
            <SelectContent>
              {publisherOptions
                .filter((opt) => Boolean(opt && opt.id && opt.id.trim()))
                .map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs font-mono">
                    <span className="font-semibold text-orange-300">{opt.name}</span>
                    <span className="text-[9px] text-muted-foreground ml-1.5">
                      — {opt.description}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Expected arguments preview & quick mapping button */}
      {expectedArgs && expectedArgs.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-orange-500/15">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>Expected args:</span>
              <div className="flex flex-wrap gap-1">
                {expectedArgs.map((arg) => (
                  <span
                    key={arg.name}
                    className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-background/80 border border-border/50 text-foreground/80"
                    title={`Type: ${arg.type}${arg.required ? " (required)" : ""}`}
                  >
                    {arg.name}
                    <span className="text-muted-foreground/60 text-[8px] ml-0.5">
                      :{arg.type}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 transition-colors"
                onClick={onAutoMapArguments}
                title="Smart map missing payload/message and key from request body and prior steps"
              >
                <Sparkles size={10} />
                Auto-map arguments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Argument Bindings */}
      {children}

      {/* Advanced function settings toggle */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-orange-500/15">
        <button
          type="button"
          className="flex items-center gap-1 text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors self-start"
          onClick={onToggleAdvancedSettings}
        >
          <Settings size={10} />
          <span>{showAdvancedSettings ? "Hide" : "Show"} Advanced Import & Function Overrides</span>
        </button>

        {showAdvancedSettings && (
          <div className="grid grid-cols-2 gap-2 p-2 rounded bg-muted/20 border border-border/40">
            <div className="flex flex-col gap-1">
              <Label className="text-[9px] text-muted-foreground">Compiled Function Name</Label>
              <Input
                className="h-6 text-[11px] font-mono bg-background/60 border-border/60"
                value={step.functionRef?.name ?? ""}
                onChange={(e) =>
                  onChange({
                    ...step,
                    functionRef: {
                      ...(step.functionRef ?? { importPath: "" }),
                      name: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[9px] text-muted-foreground">Compiled Import Path</Label>
              <Input
                className="h-6 text-[11px] font-mono bg-background/60 border-border/60"
                value={step.functionRef?.importPath ?? ""}
                onChange={(e) =>
                  onChange({
                    ...step,
                    functionRef: {
                      ...(step.functionRef ?? { name: "" }),
                      importPath: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
