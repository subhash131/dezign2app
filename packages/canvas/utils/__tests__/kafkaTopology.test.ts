import { describe, it, expect } from "vitest";
import { computeKafkaTopology } from "../kafkaTopology";
import type { KafkaTopic } from "../../schemas";

describe("computeKafkaTopology", () => {
  it("computes default 3-broker topology with balanced partitions", () => {
    const topics: KafkaTopic[] = [
      {
        id: "topic-1",
        name: "orders",
        partitions: 3,
        replication: 2,
      },
    ];

    const topology = computeKafkaTopology(topics, {
      brokerCount: 3,
      partitions: 3,
      replication: 2,
    });

    expect(topology.brokerCount).toBe(3);
    expect(topology.brokers).toHaveLength(3);
    expect(topology.totalPartitions).toBe(3);
    expect(topology.totalLeaders).toBe(3);
    expect(topology.totalReplicas).toBe(3);
    expect(topology.warnings).toHaveLength(0);

    // Broker 1: Leader for P0, Replica for P2
    const b1 = topology.brokers[0]!;
    expect(b1.id).toBe(1);
    expect(b1.port).toBe(9092);
    expect(b1.topics).toHaveLength(1);
    expect(b1.topics[0]!.partitions).toEqual([
      { partitionIndex: 0, isLeader: true },
      { partitionIndex: 2, isLeader: false },
    ]);

    // Broker 2: Leader for P1, Replica for P0
    const b2 = topology.brokers[1]!;
    expect(b2.id).toBe(2);
    expect(b2.port).toBe(9093);
    expect(b2.topics[0]!.partitions).toEqual([
      { partitionIndex: 0, isLeader: false },
      { partitionIndex: 1, isLeader: true },
    ]);

    // Broker 3: Leader for P2, Replica for P1
    const b3 = topology.brokers[2]!;
    expect(b3.id).toBe(3);
    expect(b3.port).toBe(9094);
    expect(b3.topics[0]!.partitions).toEqual([
      { partitionIndex: 1, isLeader: false },
      { partitionIndex: 2, isLeader: true },
    ]);
  });

  it("handles multiple topics with different partition counts", () => {
    const topics: KafkaTopic[] = [
      { id: "t-1", name: "orders", partitions: 3, replication: 2 },
      { id: "t-2", name: "payments", partitions: 2, replication: 2 },
    ];

    const topology = computeKafkaTopology(topics, { brokerCount: 3 });
    expect(topology.totalPartitions).toBe(5);
    expect(topology.totalLeaders).toBe(5);

    // Check that every topic partition has exactly 1 leader
    for (const topic of topics) {
      let leaderCount = 0;
      for (const broker of topology.brokers) {
        const bt = broker.topics.find((t) => t.topicId === topic.id);
        if (bt) {
          leaderCount += bt.partitions.filter((p) => p.isLeader).length;
        }
      }
      expect(leaderCount).toBe(topic.partitions);
    }
  });

  it("clamps replication factor and warns when replication > brokerCount", () => {
    const topics: KafkaTopic[] = [
      { id: "t-1", name: "high-rep", partitions: 2, replication: 5 },
    ];

    const topology = computeKafkaTopology(topics, { brokerCount: 3 });
    expect(topology.warnings.length).toBeGreaterThan(0);
    expect(topology.warnings[0]).toContain("exceeds broker count");

    // All 3 brokers should be involved, no broker gets duplicate replicas
    for (const broker of topology.brokers) {
      const bt = broker.topics.find((t) => t.topicId === "t-1");
      expect(bt).toBeDefined();
    }
  });

  it("handles standalone 1-broker cluster cleanly", () => {
    const topics: KafkaTopic[] = [
      { id: "t-1", name: "events", partitions: 4, replication: 1 },
    ];

    const topology = computeKafkaTopology(topics, { brokerCount: 1 });
    expect(topology.brokerCount).toBe(1);
    expect(topology.brokers[0]!.leaderCount).toBe(4);
    expect(topology.brokers[0]!.replicaCount).toBe(0);
  });
});
