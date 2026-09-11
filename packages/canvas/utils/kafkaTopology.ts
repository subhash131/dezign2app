import type { KafkaTopic, KafkaBrokerConfig } from "../schemas";

export interface PartitionPlacement {
  partitionIndex: number;
  isLeader: boolean;
}

export interface BrokerTopicPlacement {
  topicId: string;
  topicName: string;
  description?: string;
  payloadSchema?: KafkaTopic["payloadSchema"];
  partitions: PartitionPlacement[];
  leaderCount: number;
  replicaCount: number;
}

export interface BrokerNodeModel {
  id: number;
  name: string;
  port: number;
  leaderCount: number;
  replicaCount: number;
  topics: BrokerTopicPlacement[];
}

export interface KafkaClusterTopology {
  brokerCount: number;
  brokers: BrokerNodeModel[];
  totalPartitions: number;
  totalLeaders: number;
  totalReplicas: number;
  topics: KafkaTopic[];
  defaultPartitions: number;
  defaultReplication: number;
  clusterMode: "kraft" | "zookeeper";
  warnings: string[];
}

/**
 * Computes the distributed partition placement across all brokers in a Kafka cluster.
 * Uses Kafka's standard round-robin partition leadership and follower replica algorithm:
 * - Leader(p) = (p % N) + 1
 * - Replica(p, r) = ((p + r) % N) + 1  for r = 1..R-1
 */
export function computeKafkaTopology(
  topics: KafkaTopic[] = [],
  brokerConfig: Partial<KafkaBrokerConfig> = {},
): KafkaClusterTopology {
  const rawBrokerCount = Number(brokerConfig.brokerCount);
  const brokerCount =
    Number.isFinite(rawBrokerCount) && rawBrokerCount > 0
      ? Math.max(1, Math.min(9, Math.floor(rawBrokerCount)))
      : 3;

  const basePort = Number(brokerConfig.port) || 9092;
  const defaultPartitions = Number(brokerConfig.partitions) || 3;
  const defaultReplication = Number(brokerConfig.replication) || 2;
  const clusterMode =
    brokerConfig.clusterMode === "zookeeper" ? "zookeeper" : "kraft";

  const warnings: string[] = [];

  // Initialize brokers
  const brokerMap = new Map<number, BrokerNodeModel>();
  for (let b = 1; b <= brokerCount; b++) {
    brokerMap.set(b, {
      id: b,
      name: `Broker ${b}`,
      port: basePort + (b - 1),
      leaderCount: 0,
      replicaCount: 0,
      topics: [],
    });
  }

  let totalPartitions = 0;
  let totalLeaders = 0;
  let totalReplicas = 0;

  topics.forEach((t) => {
    const rawP = Number(t.partitions);
    const numPartitions =
      Number.isFinite(rawP) && rawP > 0 ? Math.floor(rawP) : defaultPartitions;

    const rawR = Number(t.replication);
    const requestedReplication =
      Number.isFinite(rawR) && rawR > 0
        ? Math.floor(rawR)
        : defaultReplication;

    const replicationFactor = Math.min(brokerCount, requestedReplication);
    if (requestedReplication > brokerCount) {
      warnings.push(
        `Topic "${t.name}" requested replication factor ${requestedReplication}, which exceeds broker count (${brokerCount}). Clamped to ${brokerCount}.`,
      );
    }

    totalPartitions += numPartitions;

    // Track which broker gets which partition for this topic
    const topicByBroker = new Map<number, PartitionPlacement[]>();
    for (let b = 1; b <= brokerCount; b++) {
      topicByBroker.set(b, []);
    }

    for (let p = 0; p < numPartitions; p++) {
      // Leader placement: (p % brokerCount) + 1
      const leaderBrokerId = (p % brokerCount) + 1;
      topicByBroker.get(leaderBrokerId)?.push({
        partitionIndex: p,
        isLeader: true,
      });
      totalLeaders++;

      // Follower replicas placement: ((p + r) % brokerCount) + 1
      for (let r = 1; r < replicationFactor; r++) {
        const replicaBrokerId = ((p + r) % brokerCount) + 1;
        topicByBroker.get(replicaBrokerId)?.push({
          partitionIndex: p,
          isLeader: false,
        });
        totalReplicas++;
      }
    }

    // Attach to brokers
    for (let b = 1; b <= brokerCount; b++) {
      const parts = topicByBroker.get(b) || [];
      if (parts.length > 0) {
        // Sort partitions by partitionIndex
        parts.sort((a, b) => a.partitionIndex - b.partitionIndex);

        const leaderCount = parts.filter((p) => p.isLeader).length;
        const replicaCount = parts.filter((p) => !p.isLeader).length;

        const broker = brokerMap.get(b)!;
        broker.leaderCount += leaderCount;
        broker.replicaCount += replicaCount;
        broker.topics.push({
          topicId: t.id,
          topicName: t.name,
          description: t.description,
          payloadSchema: t.payloadSchema,
          partitions: parts,
          leaderCount,
          replicaCount,
        });
      }
    }
  });

  const brokers = Array.from(brokerMap.values());

  return {
    brokerCount,
    brokers,
    totalPartitions,
    totalLeaders,
    totalReplicas,
    topics,
    defaultPartitions,
    defaultReplication,
    clusterMode,
    warnings,
  };
}
