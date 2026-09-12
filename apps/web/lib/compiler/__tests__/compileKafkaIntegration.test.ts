import { describe, it, expect } from "vitest";
import { generateProducers } from "../generators/producerGenerator";
import { generateConsumers } from "../generators/consumerGenerator";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { AnyMessagingResource } from "@workspace/canvas/types";

describe("compileKafkaIntegration", () => {
  const kafkaNode: BackendNode = {
    id: "kafka-broker",
    type: "kafka",
    position: { x: 300, y: 100 },
    fractionalIndex: "a1",
    data: {
      label: "generic cluster",
      topics: [
        {
          id: "topic-1",
          name: "message.sent",
          description: "Message sent event topic",
        },
      ],
    },
  };

  const conversationsService: BackendNode = {
    id: "service-conv",
    type: "service",
    position: { x: 100, y: 100 },
    fractionalIndex: "a0",
    data: {
      label: "conversations",
      port: "8080",
      publishedEvents: [
        {
          id: "ev-pub-1",
          name: "message.sent",
          brokerNodeId: "kafka-broker",
          messagingResourceId: "topic-1",
        },
      ],
    },
  };

  const notificationService: BackendNode = {
    id: "service-notif",
    type: "service",
    position: { x: 500, y: 100 },
    fractionalIndex: "a2",
    data: {
      label: "notification",
      port: "8081",
      consumedEvents: [
        {
          id: "ev-sub-1",
          name: "message.sent",
          brokerNodeId: "kafka-broker",
          messagingResourceId: "topic-1",
        },
      ],
    },
  };

  const edgePub: BackendEdge = {
    id: "edge-pub",
    source: "service-conv",
    target: "kafka-broker",
    type: "connection",
    fractionalIndex: "a0",
    sourceHandle: "publishedEvents-out-ev-pub-1",
    targetHandle: "topic-1",
  };

  const edgeSub: BackendEdge = {
    id: "edge-sub",
    source: "kafka-broker",
    target: "service-notif",
    type: "connection",
    fractionalIndex: "a1",
    sourceHandle: "topic-1",
    targetHandle: "consumedEvents-in-ev-sub-1",
  };

  const allNodes = [conversationsService, kafkaNode, notificationService];
  const allEdges = [edgePub, edgeSub];

  it("generates active Kafka publisher in producerGenerator when connected to Kafka", () => {
    const publishedEvents: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-pub-1",
        name: "message.sent",
        nodeId: "service-conv",
        variant: "publish",
        brokerNodeId: "kafka-broker",
        messagingResourceId: "topic-1",
      },
    ];

    const files = generateProducers(
      "conversations",
      publishedEvents,
      conversationsService,
      allNodes,
      allEdges,
    );

    const producerFile = files.find((f) => f.filename === "src/producer/messageSent.ts");
    expect(producerFile).toBeDefined();

    // Verify import of publishKafkaEvent and KAFKA_TOPICS from the derived Kafka package
    expect(producerFile?.content).toContain(
      'import { publishKafkaEvent, KAFKA_TOPICS } from "@workspace/generic-cluster";',
    );

    // Verify actual call to publishKafkaEvent instead of a TODO stub
    expect(producerFile?.content).toContain(
      'await publishKafkaEvent(topic, eventData, key);',
    );
    expect(producerFile?.content).toContain("KAFKA_TOPICS.MESSAGE_SENT");
    expect(producerFile?.content).not.toContain("// TODO: Connect message broker");
  });

  it("generates active Kafka consumer subscription in consumerGenerator when connected to Kafka", () => {
    const consumedEvents: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-sub-1",
        name: "message.sent",
        nodeId: "service-notif",
        variant: "consume",
        brokerNodeId: "kafka-broker",
        messagingResourceId: "topic-1",
      },
    ];

    const files = generateConsumers(
      "notification",
      consumedEvents,
      notificationService,
      allNodes,
      allEdges,
    );

    const consumerHandlerFile = files.find((f) => f.filename === "src/consumer/messageSent.ts");
    expect(consumerHandlerFile).toBeDefined();
    expect(consumerHandlerFile?.content).toContain("export async function handleMessageSent(");

    const consumerIndexFile = files.find((f) => f.filename === "src/consumer/index.ts");
    expect(consumerIndexFile).toBeDefined();

    // Verify import of consumeMessageSent from the shared Kafka package
    expect(consumerIndexFile?.content).toContain(
      'import { consumeMessageSent } from "@workspace/generic-cluster";',
    );

    // Verify initConsumers is async and subscribes to Kafka
    expect(consumerIndexFile?.content).toContain("export async function initConsumers(): Promise<void>");
    expect(consumerIndexFile?.content).toContain('await consumeMessageSent("notification-messageSent-group", async ({ message }) => {');
    expect(consumerIndexFile?.content).toContain("await handleMessageSent(payload);");
  });
});
