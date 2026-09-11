import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import {
  Waves,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  AlertTriangle,
  Server,
  Layers,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  NodeHeader,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
  generateId,
} from "../../common";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";
import { computeKafkaTopology, type KafkaBrokerConfig } from "@workspace/canvas";
import { BrokerList } from "./kafka";
import { Label } from "@workspace/ui/components/label";

type ClusterMode = NonNullable<KafkaBrokerConfig["clusterMode"]>;
type Compression = NonNullable<KafkaBrokerConfig["compression"]>;
type ProducerAcks = NonNullable<KafkaBrokerConfig["producerAcks"]>;

function isClusterMode(val: string): val is ClusterMode {
  return val === "kraft" || val === "zookeeper";
}

function isCompression(val: string): val is Compression {
  return (
    val === "None" ||
    val === "Gzip" ||
    val === "Snappy" ||
    val === "LZ4" ||
    val === "Zstd"
  );
}

function isProducerAcks(val: string): val is ProducerAcks {
  return val === "all" || val === "1" || val === "0";
}

export const KafkaNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [showReliability, setShowReliability] = useState(false);
  const [showClusterConfig, setShowClusterConfig] = useState(false);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");

  // Initialize kafkaBroker if not defined
  const broker = data.kafkaBroker || {};
  const brokerCount = broker.brokerCount ?? 3;
  const defaultPartitions = broker.partitions ?? 3;
  const defaultReplication = broker.replication ?? 2;

  // Compute live distributed topology across brokers
  const topology = computeKafkaTopology(data.topics || [], broker);

  const updateBroker = <
    K extends keyof NonNullable<BackendNode["data"]["kafkaBroker"]>,
  >(
    key: K,
    value: NonNullable<BackendNode["data"]["kafkaBroker"]>[K],
  ) => {
    updateNode(id, {
      data: {
        ...data,
        kafkaBroker: {
          ...broker,
          [key]: value,
        },
      },
    });
  };

  const handleAddTopic = () => {
    const trimmed = newTopicName.trim();
    const finalName =
      trimmed || `topic-${(data.topics?.length || 0) + 1}`;

    const newTopic = {
      id: generateId(),
      name: finalName,
      partitions: defaultPartitions,
      replication: Math.min(brokerCount, defaultReplication),
    };

    updateNode(id, {
      data: {
        ...data,
        topics: [...(data.topics || []), newTopic],
      },
    });

    setNewTopicName("");
    setIsAddingTopic(false);
  };

  const handleDeleteTopic = (topicId: string) => {
    updateNode(id, {
      data: {
        ...data,
        topics: (data.topics || []).filter((t) => t.id !== topicId),
      },
    });
  };

  const handleConfigureTopic = () => {
    setActiveConfigItem({ type: "kafka", id, nodeId: id });
  };

  const handleAdjustBrokerCount = (delta: number) => {
    const next = Math.max(1, Math.min(9, brokerCount + delta));
    updateBroker("brokerCount", next);
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[360px] flex flex-col transition-all duration-300 relative",
        borderClass,
      )}
    >
      <NodeHeader
        id={id}
        data={data}
        icon={Waves}
        title="Kafka Cluster"
        colorClass="bg-teal-500/10 text-teal-700 dark:text-teal-400"
        selected={selected}
        badges={
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30">
            {brokerCount} {brokerCount === 1 ? "Broker" : "Brokers"}
          </span>
        }
        rightElement={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveConfigItem({ type: "kafka", id, nodeId: id });
            }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            title="Kafka Cluster Configuration"
          >
            <Settings size={13} />
          </button>
        }
      />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Kafka cluster description..."
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Quick Action & Cluster Summary Bar */}
      <div className="px-3 py-1.5 border-b bg-muted/25 flex items-center justify-between gap-2 nodrag">
        {/* Add Topic Action */}
        {isAddingTopic ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              autoFocus
              className="h-6 text-[10px] px-2 py-0 bg-background"
              placeholder="Topic name..."
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTopic();
                if (e.key === "Escape") {
                  setIsAddingTopic(false);
                  setNewTopicName("");
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddTopic}
              className="h-6 px-2 text-[10px] rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-700 dark:text-teal-300 font-semibold"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingTopic(false);
                setNewTopicName("");
              }}
              className="h-6 px-1.5 text-[10px] rounded hover:bg-secondary text-muted-foreground"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingTopic(true)}
            className="flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer"
          >
            <Plus size={11} />
            <span>Add Topic</span>
          </button>
        )}

        {/* Broker count stepper */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-muted-foreground/80">
            Brokers:
          </span>
          <div className="flex items-center border rounded overflow-hidden bg-background">
            <button
              type="button"
              disabled={brokerCount <= 1}
              onClick={() => handleAdjustBrokerCount(-1)}
              className="px-1.5 py-0.5 text-[9px] hover:bg-secondary disabled:opacity-30 cursor-pointer"
              title="Decrease broker count"
            >
              -
            </button>
            <span className="px-1.5 text-[9px] font-mono font-semibold">
              {brokerCount}
            </span>
            <button
              type="button"
              disabled={brokerCount >= 9}
              onClick={() => handleAdjustBrokerCount(1)}
              className="px-1.5 py-0.5 text-[9px] hover:bg-secondary disabled:opacity-30 cursor-pointer"
              title="Increase broker count"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Warnings banner if any */}
      {topology.warnings.length > 0 && (
        <div className="px-2.5 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[9px] text-amber-600 dark:text-amber-400 flex items-center gap-1 nodrag">
          <AlertTriangle size={11} className="shrink-0 text-amber-500" />
          <span className="truncate">{topology.warnings[0]}</span>
        </div>
      )}

      {/* Broker Blocks & Nested Topics */}
      <BrokerList
        nodeId={id}
        brokers={topology.brokers}
        onDeleteTopic={handleDeleteTopic}
        onConfigureTopic={handleConfigureTopic}
      />

      {/* Reliability Settings (Collapsible) */}
      <div className="flex flex-col nodrag border-b">
        <div
          className="px-3 py-1.5 flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/40 transition-colors select-none"
          onClick={() => setShowReliability(!showReliability)}
        >
          {showReliability ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
          <span>Reliability Policies</span>
        </div>
        {showReliability && (
          <div className="p-3 flex flex-col gap-3 bg-secondary/5 border-t">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Delivery Guarantee
              </span>
              <Select
                value={data.delivery || "At Least Once"}
                onValueChange={(val) =>
                  updateNode(id, { data: { ...data, delivery: val } })
                }
              >
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="At Most Once" className="text-xs">
                    At Most Once
                  </SelectItem>
                  <SelectItem value="At Least Once" className="text-xs">
                    At Least Once
                  </SelectItem>
                  <SelectItem value="Exactly Once" className="text-xs">
                    Exactly Once
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Ordering
              </span>
              <Select
                value={data.ordering || "Ordered"}
                onValueChange={(val) =>
                  updateNode(id, { data: { ...data, ordering: val } })
                }
              >
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Unordered" className="text-xs">
                    Unordered
                  </SelectItem>
                  <SelectItem value="Ordered" className="text-xs">
                    Ordered (per partition)
                  </SelectItem>
                  <SelectItem value="Global Order" className="text-xs">
                    Global Order
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Retention
              </span>
              <Select
                value={data.retention || "7 days"}
                onValueChange={(val) =>
                  updateNode(id, { data: { ...data, retention: val } })
                }
              >
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 hour" className="text-xs">
                    1 hour
                  </SelectItem>
                  <SelectItem value="1 day" className="text-xs">
                    1 day
                  </SelectItem>
                  <SelectItem value="7 days" className="text-xs">
                    7 days
                  </SelectItem>
                  <SelectItem value="Forever" className="text-xs">
                    Forever
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Cluster Configuration (Collapsible) */}
      <div className="flex flex-col nodrag">
        <div
          className="px-3 py-1.5 flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/40 transition-colors select-none"
          onClick={() => setShowClusterConfig(!showClusterConfig)}
        >
          {showClusterConfig ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
          <span>Cluster Settings</span>
        </div>
        {showClusterConfig && (
          <div className="px-3 py-2 flex flex-col gap-3 border-t text-[10px] text-muted-foreground bg-secondary/5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">
                Cluster Mode
              </Label>
              <Select
                value={broker.clusterMode || "kraft"}
                onValueChange={(val) => {
                  if (isClusterMode(val)) updateBroker("clusterMode", val);
                }}
              >
                <SelectTrigger className="h-6 w-28 text-[10px] px-2 py-0 nodrag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kraft" className="text-[10px]">
                    KRaft (Modern)
                  </SelectItem>
                  <SelectItem value="zookeeper" className="text-[10px]">
                    ZooKeeper (Legacy)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">
                Default Partitions
              </Label>
              <Input
                type="number"
                min={1}
                className="h-6 text-[10px] w-16 text-right bg-background nodrag"
                placeholder="3"
                value={broker.partitions || ""}
                onChange={(e) =>
                  updateBroker(
                    "partitions",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">
                Replication Factor
              </Label>
              <Input
                type="number"
                min={1}
                max={brokerCount}
                className="h-6 text-[10px] w-16 text-right bg-background nodrag"
                placeholder="2"
                value={broker.replication || ""}
                onChange={(e) =>
                  updateBroker(
                    "replication",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">
                Compression
              </Label>
              <Select
                value={broker.compression || "None"}
                onValueChange={(val) => {
                  if (isCompression(val)) updateBroker("compression", val);
                }}
              >
                <SelectTrigger className="h-6 w-24 text-[10px] px-2 py-0 nodrag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None" className="text-[10px]">
                    None
                  </SelectItem>
                  <SelectItem value="Gzip" className="text-[10px]">
                    Gzip
                  </SelectItem>
                  <SelectItem value="Snappy" className="text-[10px]">
                    Snappy
                  </SelectItem>
                  <SelectItem value="LZ4" className="text-[10px]">
                    LZ4
                  </SelectItem>
                  <SelectItem value="Zstd" className="text-[10px]">
                    Zstd
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">
                Producer Acks
              </Label>
              <Select
                value={broker.producerAcks || "all"}
                onValueChange={(val) => {
                  if (isProducerAcks(val)) updateBroker("producerAcks", val);
                }}
              >
                <SelectTrigger className="h-6 w-24 text-[10px] px-2 py-0 nodrag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[10px]">
                    all (-1)
                  </SelectItem>
                  <SelectItem value="1" className="text-[10px]">
                    1 (Leader)
                  </SelectItem>
                  <SelectItem value="0" className="text-[10px]">
                    0 (None)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
