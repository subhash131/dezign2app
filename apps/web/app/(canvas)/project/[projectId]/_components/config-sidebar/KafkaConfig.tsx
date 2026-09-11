import React, { useState } from "react";
import {
  Waves,
  Server,
  Network,
  Plus,
  Trash,
  Sparkles,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Cpu,
} from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { cn } from "@workspace/ui/lib/utils";
import {
  computeKafkaTopology,
  BrokerNodeModel,
  BrokerTopicPlacement,
  PartitionPlacement,
  KafkaTopic,
  KafkaBrokerConfig,
} from "@workspace/canvas";
import { generateId } from "../backend-nodes/graph-nodes/common";
import { BackendNode } from "@/types/canvas";

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

export interface KafkaConfigProps {
  id: string;
  nodeId: string;
}

export const KafkaConfig: React.FC<KafkaConfigProps> = ({ id, nodeId }) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const targetNode = nodes.find((n) => n.id === (nodeId || id));

  const [activeTab, setActiveTab] = useState<string>("topology");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicPartitions, setNewTopicPartitions] = useState("");
  const [newTopicReplication, setNewTopicReplication] = useState("");

  if (!targetNode) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Kafka cluster node not found.
      </div>
    );
  }

  const data = targetNode.data;
  const broker = data.kafkaBroker || {};
  const brokerCount = broker.brokerCount ?? 3;
  const defaultPartitions = broker.partitions ?? 3;
  const defaultReplication = broker.replication ?? 2;
  const clusterMode = broker.clusterMode || "kraft";

  const topics = data.topics || [];
  const topology = computeKafkaTopology(topics, broker);

  const updateBroker = <
    K extends keyof NonNullable<BackendNode["data"]["kafkaBroker"]>,
  >(
    key: K,
    value: NonNullable<BackendNode["data"]["kafkaBroker"]>[K],
  ) => {
    updateNode(targetNode.id, {
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
    if (!trimmed) return;

    const parsedP = newTopicPartitions ? Number(newTopicPartitions) : undefined;
    const parsedR = newTopicReplication ? Number(newTopicReplication) : undefined;

    const newTopic: KafkaTopic = {
      id: generateId(),
      name: trimmed,
      partitions: parsedP,
      replication: parsedR,
    };

    updateNode(targetNode.id, {
      data: {
        ...data,
        topics: [...topics, newTopic],
      },
    });

    setNewTopicName("");
    setNewTopicPartitions("");
    setNewTopicReplication("");
  };

  const handleDeleteTopic = (topicId: string) => {
    updateNode(targetNode.id, {
      data: {
        ...data,
        topics: topics.filter((t: KafkaTopic) => t.id !== topicId),
      },
    });
  };

  const handleUpdateTopic = (
    topicId: string,
    changes: Partial<KafkaTopic>,
  ) => {
    updateNode(targetNode.id, {
      data: {
        ...data,
        topics: topics.map((t: KafkaTopic) =>
          t.id === topicId ? { ...t, ...changes } : t,
        ),
      },
    });
  };

  return (
    <div className="flex flex-col gap-5 text-xs pb-12">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <Waves size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-foreground">
                {data.label || "Kafka Cluster"}
              </h2>
              <Badge
                variant="outline"
                className="font-mono text-[9px] bg-teal-500/10 text-teal-600 border-teal-500/20"
              >
                {brokerCount} {brokerCount === 1 ? "Broker" : "Brokers"}
              </Badge>
              <Badge
                variant="outline"
                className="font-mono text-[9px] uppercase"
              >
                {clusterMode}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Distributed event streaming platform & cluster topology
            </p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {topology.warnings.length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">Replication Configuration Note</span>
            <span>{topology.warnings[0]}</span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 w-full h-8 text-[10px]">
          <TabsTrigger value="topology" className="flex items-center gap-1">
            <Network size={11} />
            <span>Topology</span>
          </TabsTrigger>
          <TabsTrigger value="cluster" className="flex items-center gap-1">
            <Cpu size={11} />
            <span>Cluster</span>
          </TabsTrigger>
          <TabsTrigger value="topics" className="flex items-center gap-1">
            <Layers size={11} />
            <span>Topics ({topics.length})</span>
          </TabsTrigger>
          <TabsTrigger value="reliability" className="flex items-center gap-1">
            <ShieldCheck size={11} />
            <span>Policies</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Topology */}
        <TabsContent value="topology" className="flex flex-col gap-4 mt-4">
          {/* Workload Balance Metrics Card */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-secondary/25 border border-border/40 text-center">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                Partitions
              </span>
              <span className="text-lg font-bold text-foreground">
                {topology.totalPartitions}
              </span>
            </div>
            <div className="flex flex-col border-x border-border/40">
              <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                Leaders
              </span>
              <span className="text-lg font-bold text-teal-600 dark:text-teal-400">
                {topology.totalLeaders}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                Replicas
              </span>
              <span className="text-lg font-bold text-muted-foreground">
                {topology.totalReplicas}
              </span>
            </div>
          </div>

          {/* Full Interactive Cluster Tree */}
          <div className="flex flex-col border rounded-xl overflow-hidden bg-card/60">
            <div className="px-3 py-2 bg-secondary/30 border-b flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                <Server size={14} className="text-teal-500" />
                <span>Cluster Broker Distribution</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                Round-Robin Sharding
              </span>
            </div>

            <div className="divide-y divide-border/30">
              {topology.brokers.map((broker: BrokerNodeModel) => (
                <div key={broker.id} className="p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-foreground">
                        {broker.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        port {broker.port}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                        {broker.leaderCount} Leader{broker.leaderCount === 1 ? "" : "s"}
                      </span>
                      {broker.replicaCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-muted-foreground bg-secondary border border-border/40">
                          {broker.replicaCount} Replica{broker.replicaCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Topics on this broker */}
                  {broker.topics.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic pl-3 border-l-2 border-border/40">
                      No partitions hosted on this broker
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 pl-3 border-l-2 border-teal-500/40">
                      {broker.topics.map((t: BrokerTopicPlacement) => (
                        <div
                          key={t.topicId}
                          className="flex items-center justify-between text-[11px] bg-background/50 px-2 py-1 rounded border border-border/30"
                        >
                          <span className="font-medium text-foreground">
                            {t.topicName}
                          </span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {t.partitions.map((p: PartitionPlacement) => (
                              <span
                                key={p.partitionIndex}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-mono flex items-center gap-0.5",
                                  p.isLeader
                                    ? "bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 font-semibold"
                                    : "bg-secondary/70 text-muted-foreground border border-border/40",
                                )}
                              >
                                P{p.partitionIndex}
                                {p.isLeader ? (
                                  <Sparkles size={8} className="text-teal-600 dark:text-teal-400" />
                                ) : (
                                  <RefreshCw size={8} className="opacity-60" />
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Cluster Architecture */}
        <TabsContent value="cluster" className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Cluster Label</Label>
            <Input
              className="h-7 text-xs bg-background"
              value={data.label || ""}
              onChange={(e) =>
                updateNode(targetNode.id, {
                  data: { ...data, label: e.target.value },
                })
              }
              placeholder="e.g. Main Kafka Cluster"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Number of Brokers</Label>
              <Input
                type="number"
                min={1}
                max={9}
                className="h-7 text-xs bg-background font-mono"
                value={brokerCount}
                onChange={(e) =>
                  updateBroker(
                    "brokerCount",
                    Math.max(1, Math.min(9, Number(e.target.value) || 1)),
                  )
                }
              />
              <span className="text-[10px] text-muted-foreground">
                Cluster node instances (1-9)
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Consensus Mode</Label>
              <Select
                value={clusterMode}
                onValueChange={(val) => {
                  if (isClusterMode(val)) updateBroker("clusterMode", val);
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kraft" className="text-xs">
                    KRaft (Modern, No ZK)
                  </SelectItem>
                  <SelectItem value="zookeeper" className="text-xs">
                    ZooKeeper (Legacy)
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                Metadata management
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Default Partitions</Label>
              <Input
                type="number"
                min={1}
                className="h-7 text-xs bg-background font-mono"
                value={defaultPartitions}
                onChange={(e) =>
                  updateBroker(
                    "partitions",
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
              />
              <span className="text-[10px] text-muted-foreground">
                Per-topic default
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">
                Default Replication Factor
              </Label>
              <Input
                type="number"
                min={1}
                max={brokerCount}
                className="h-7 text-xs bg-background font-mono"
                value={defaultReplication}
                onChange={(e) =>
                  updateBroker(
                    "replication",
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
              />
              <span className="text-[10px] text-muted-foreground">
                Must be ≤ broker count
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Base Port</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-background font-mono"
                value={broker.port ?? 9092}
                onChange={(e) =>
                  updateBroker("port", Number(e.target.value) || 9092)
                }
              />
              <span className="text-[10px] text-muted-foreground">
                Broker 1 port (e.g. 9092, 9093...)
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Producer ACKs</Label>
              <Select
                value={broker.producerAcks || "all"}
                onValueChange={(val) => {
                  if (isProducerAcks(val)) updateBroker("producerAcks", val);
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    all (-1) — Full ISR Quorum
                  </SelectItem>
                  <SelectItem value="1" className="text-xs">
                    1 — Leader ACK only
                  </SelectItem>
                  <SelectItem value="0" className="text-xs">
                    0 — Fire and Forget
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                Durability guarantee
              </span>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Topics */}
        <TabsContent value="topics" className="flex flex-col gap-4 mt-4">
          {/* Add topic form */}
          <div className="p-3 rounded-lg bg-secondary/20 border border-border/40 flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-foreground">
              Add New Topic
            </span>
            <div className="flex items-center gap-2">
              <Input
                className="h-7 text-xs bg-background flex-1"
                placeholder="Topic name (e.g. order-events)"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTopic();
                }}
              />
              <Input
                type="number"
                min={1}
                className="h-7 w-16 text-xs bg-background text-right"
                placeholder={`P: ${defaultPartitions}`}
                value={newTopicPartitions}
                onChange={(e) => setNewTopicPartitions(e.target.value)}
                title="Partition count override"
              />
              <Input
                type="number"
                min={1}
                max={brokerCount}
                className="h-7 w-16 text-xs bg-background text-right"
                placeholder={`R: ${defaultReplication}`}
                value={newTopicReplication}
                onChange={(e) => setNewTopicReplication(e.target.value)}
                title="Replication factor override"
              />
              <Button
                size="sm"
                className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleAddTopic}
              >
                <Plus size={12} className="mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* Topics list */}
          <div className="flex flex-col divide-y divide-border/30 border rounded-lg overflow-hidden bg-card/50">
            {topics.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs italic">
                No topics defined yet. Create your first topic above.
              </div>
            ) : (
              topics.map((t: KafkaTopic) => (
                <div
                  key={t.id}
                  className="p-3 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-xs text-foreground">
                      {t.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.description || "No description provided"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        P:
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        className="h-6 w-12 text-[10px] text-center bg-background px-1"
                        value={t.partitions ?? defaultPartitions}
                        onChange={(e) =>
                          handleUpdateTopic(t.id, {
                            partitions: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        R:
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={brokerCount}
                        className="h-6 w-12 text-[10px] text-center bg-background px-1"
                        value={t.replication ?? defaultReplication}
                        onChange={(e) =>
                          handleUpdateTopic(t.id, {
                            replication: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteTopic(t.id)}
                      title="Delete topic"
                    >
                      <Trash size={12} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* Tab 4: Reliability & Policies */}
        <TabsContent value="reliability" className="flex flex-col gap-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">
                Delivery Guarantee
              </Label>
              <Select
                value={data.delivery || "At Least Once"}
                onValueChange={(val) =>
                  updateNode(targetNode.id, { data: { ...data, delivery: val } })
                }
              >
                <SelectTrigger className="h-7 text-xs bg-background">
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

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Ordering</Label>
              <Select
                value={data.ordering || "Ordered"}
                onValueChange={(val) =>
                  updateNode(targetNode.id, { data: { ...data, ordering: val } })
                }
              >
                <SelectTrigger className="h-7 text-xs bg-background">
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
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Retention</Label>
              <Select
                value={data.retention || "7 days"}
                onValueChange={(val) =>
                  updateNode(targetNode.id, { data: { ...data, retention: val } })
                }
              >
                <SelectTrigger className="h-7 text-xs bg-background">
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

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Compression</Label>
              <Select
                value={broker.compression || "None"}
                onValueChange={(val) => {
                  if (isCompression(val)) updateBroker("compression", val);
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None" className="text-xs">
                    None
                  </SelectItem>
                  <SelectItem value="Gzip" className="text-xs">
                    Gzip
                  </SelectItem>
                  <SelectItem value="Snappy" className="text-xs">
                    Snappy
                  </SelectItem>
                  <SelectItem value="LZ4" className="text-xs">
                    LZ4
                  </SelectItem>
                  <SelectItem value="Zstd" className="text-xs">
                    Zstd
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Batch Size</Label>
              <Input
                className="h-7 text-xs bg-background font-mono"
                placeholder="e.g. 16KB"
                value={broker.batchSize || ""}
                onChange={(e) => updateBroker("batchSize", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">TTL</Label>
              <Input
                className="h-7 text-xs bg-background font-mono"
                placeholder="e.g. 7 days"
                value={broker.ttl || ""}
                onChange={(e) => updateBroker("ttl", e.target.value)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
