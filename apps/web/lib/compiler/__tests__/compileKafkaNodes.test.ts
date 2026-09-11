import { describe, it, expect } from "vitest";
import { compileKafkaNodes } from "../kafka";
import { compileServiceNode } from "../compileServiceNode";
import { BackendNode } from "@/types/canvas";

describe("compileKafkaNodes", () => {
  it("returns empty structure when no Kafka nodes exist", () => {
    const nodes: BackendNode[] = [
      {
        id: "service-1",
        type: "service",
        data: { label: "Product Service" },
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
      },
    ];

    const result = compileKafkaNodes(nodes);
    expect(result.files).toHaveLength(0);
    expect(result.reusableFunctions).toHaveLength(0);
    expect(result.packageFolder).toBe("kafka");
    expect(result.packageName).toBe("@workspace/kafka");
  });

  it("compiles Kafka node topics with proper imports and KAFKA_TOPICS in topics/index.ts", () => {
    const nodes: BackendNode[] = [
      {
        id: "kafka-1",
        type: "kafka",
        position: { x: 100, y: 100 },
        fractionalIndex: "a0",
        data: {
          label: "Event Bus",
          topics: [
            {
              id: "t-1",
              name: "create-product",
              description: "Product creation event",
            },
            {
              id: "t-2",
              name: "order-placed",
              description: "Order placed event",
            },
          ],
        },
      },
    ];

    const result = compileKafkaNodes(nodes);

    expect(result.packageFolder).toBe("event-bus");
    expect(result.packageName).toBe("@workspace/event-bus");

    // Check topics/index.ts content
    const topicsIndexFile = result.files.find(
      (f) => f.filename === "src/topics/index.ts",
    );
    expect(topicsIndexFile).toBeDefined();
    const content = topicsIndexFile!.content;

    // Verify imports are present to avoid TS2304 "Cannot find name 'CREATE_PRODUCT_TOPIC'"
    expect(content).toContain('import { CREATE_PRODUCT_TOPIC } from "./createProduct";');
    expect(content).toContain('import { ORDER_PLACED_TOPIC } from "./orderPlaced";');

    // Verify re-exports are present
    expect(content).toContain('export * from "./createProduct";');
    expect(content).toContain('export * from "./orderPlaced";');

    // Verify aggregate KAFKA_TOPICS object
    expect(content).toContain("export const KAFKA_TOPICS = {");
    expect(content).toContain("CREATE_PRODUCT: CREATE_PRODUCT_TOPIC,");
    expect(content).toContain("ORDER_PLACED: ORDER_PLACED_TOPIC,");
    expect(content).toContain("export type KafkaTopicName = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];");

    // Check individual topic files
    const createProductTopic = result.files.find(
      (f) => f.filename === "src/topics/createProduct.ts",
    );
    expect(createProductTopic).toBeDefined();
    expect(createProductTopic!.content).toContain('export const CREATE_PRODUCT_TOPIC = "create-product" as const;');
    expect(createProductTopic!.content).toContain("export type CreateProductTopicName = typeof CREATE_PRODUCT_TOPIC;");

    // Check publishers index file
    const publishersIndexFile = result.files.find(
      (f) => f.filename === "src/publishers/index.ts",
    );
    expect(publishersIndexFile).toBeDefined();
    expect(publishersIndexFile!.content).toContain("export async function publishKafkaEvent");

    // Check consumers index file
    const consumersIndexFile = result.files.find(
      (f) => f.filename === "src/consumers/index.ts",
    );
    expect(consumersIndexFile).toBeDefined();
    expect(consumersIndexFile!.content).toContain("export async function startKafkaConsumer");
  });

  it("handles topic payload schemas in publisher generation", () => {
    const nodes: BackendNode[] = [
      {
        id: "kafka-node",
        type: "kafka",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Kafka",
          topics: [
            {
              id: "top-1",
              name: "user-registered",
              payloadSchema: {
                id: "schema-1",
                rawJson: JSON.stringify({
                  userId: "usr_123",
                  email: "test@example.com",
                  age: 30,
                }),
              },
            },
          ],
        },
      },
    ];

    const result = compileKafkaNodes(nodes);

    const publisherFile = result.files.find(
      (f) => f.filename === "src/publishers/userRegistered.ts",
    );
    expect(publisherFile).toBeDefined();
    expect(publisherFile!.content).toContain("export interface UserRegisteredPayload {");
    expect(publisherFile!.content).toContain("userId: string;");
    expect(publisherFile!.content).toContain("email: string;");
    expect(publisherFile!.content).toContain("age: number;");
    expect(publisherFile!.content).toContain("export async function publishUserRegistered(");
  });

  it("handles fallback system-events topic when topics array is empty", () => {
    const nodes: BackendNode[] = [
      {
        id: "kafka-node-empty",
        type: "kafka",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Kafka Broker",
          topics: [],
        },
      },
    ];

    const result = compileKafkaNodes(nodes);

    const topicsIndex = result.files.find(
      (f) => f.filename === "src/topics/index.ts",
    );
    expect(topicsIndex).toBeDefined();
    expect(topicsIndex!.content).toContain('import { SYSTEM_EVENTS_TOPIC } from "./systemEvents";');
    expect(topicsIndex!.content).toContain("SYSTEM_EVENTS: SYSTEM_EVENTS_TOPIC,");
  });

  it("infers topic payload schema from connected endpoint requestBody", () => {
    const kafkaNode: BackendNode = {
      id: "kafka-1",
      type: "kafka",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Kafka Broker",
        topics: [
          {
            id: "top-create-prod",
            name: "create-product",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-api",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "API Gateway",
        endpoints: [
          {
            id: "ep-1",
            name: "/create-product",
            type: "POST",
            publishedEvents: [
              {
                id: "ev-pub-1",
                name: "create-product",
                messagingResourceId: "top-create-prod",
                brokerNodeId: "kafka-1",
                publishedWhen: "ALWAYS",
                payloadSchema: { id: "p-schema-1" },
                version: "v1",
                category: "DOMAIN",
                delivery: "AT_LEAST_ONCE",
                ordering: "NONE",
                deprecated: false,
              },
            ],
            requestBody: {
              id: "body-1",
              rawJson: JSON.stringify({ title: "Laptop", price: 1200 }),
            },
          },
        ],
      },
    };

    const result = compileKafkaNodes([kafkaNode, serviceNode]);

    const createProductPublisher = result.files.find(
      (f) => f.filename === "src/publishers/createProduct.ts",
    );
    expect(createProductPublisher).toBeDefined();
    expect(createProductPublisher!.content).toContain("export interface CreateProductPayload {");
    expect(createProductPublisher!.content).toContain("title: string;");
    expect(createProductPublisher!.content).toContain("price: number;");

    const publishersIndex = result.files.find(
      (f) => f.filename === "src/publishers/index.ts",
    );
    expect(publishersIndex).toBeDefined();
    expect(publishersIndex!.content).toContain("export interface KafkaTopicPayloadMap {");
    expect(publishersIndex!.content).toContain("[KAFKA_TOPICS.CREATE_PRODUCT]: CreateProductPayload;");
    expect(publishersIndex!.content).not.toContain("unknown");
  });

  it("returns empty structure when Kafka node exists on canvas with services but has no connecting edges", () => {
    const kafkaNode: BackendNode = {
      id: "kafka-1",
      type: "kafka",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Kafka Broker",
        topics: [{ id: "top-1", name: "notifications" }],
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-1",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "User Service",
        endpoints: [{ id: "ep-1", name: "/users", type: "POST" }],
      },
    };

    // No connecting edges between service and kafka
    const result = compileKafkaNodes([kafkaNode, serviceNode], []);
    expect(result.files).toHaveLength(0);
    expect(result.reusableFunctions).toHaveLength(0);
  });

  it("compiles Kafka package when edge connects service node to kafka broker", () => {
    const kafkaNode: BackendNode = {
      id: "kafka-1",
      type: "kafka",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Kafka Broker",
        topics: [{ id: "top-1", name: "notifications" }],
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-1",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "User Service",
        endpoints: [{ id: "ep-1", name: "/users", type: "POST" }],
      },
    };

    const edge = {
      id: "edge-1",
      source: "srv-1",
      target: "kafka-1",
      type: "message" as const,
      fractionalIndex: "a0",
    };

    const result = compileKafkaNodes([kafkaNode, serviceNode], [edge]);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.reusableFunctions.length).toBeGreaterThan(0);
  });

  it("removes kafka code and dependencies from service when edge to kafka is disconnected", () => {
    const kafkaNode: BackendNode = {
      id: "kafka-1",
      type: "kafka",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Kafka Broker",
        topics: [{ id: "top-1", name: "notifications" }],
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-1",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "User Service",
        endpoints: [{ id: "ep-1", name: "/users", type: "POST" }],
      },
    };

    // Disconnected (no edges)
    const resultDisconnected = compileServiceNode(
      serviceNode,
      [{ id: "ep-1", name: "/users", type: "POST", nodeId: "srv-1" }],
      [],
      [kafkaNode, serviceNode],
      [],
    );

    const packageJsonDisconnected = resultDisconnected.files.find(
      (f) => f.filename === "package.json",
    );
    expect(packageJsonDisconnected).toBeDefined();
    expect(packageJsonDisconnected!.content).not.toContain("@workspace/kafka");

    const routeFileDisconnected = resultDisconnected.files.find((f) =>
      f.filename.startsWith("src/routes/"),
    );
    expect(routeFileDisconnected).toBeDefined();
    expect(routeFileDisconnected!.content).not.toContain("publishKafkaEvent");
    expect(routeFileDisconnected!.content).not.toContain("KAFKA_TOPICS");

    // Connected with edge
    const edge = {
      id: "edge-1",
      source: "srv-1",
      target: "kafka-1",
      type: "message" as const,
      fractionalIndex: "a0",
    };

    const resultConnected = compileServiceNode(
      serviceNode,
      [
        {
          id: "ep-1",
          name: "/users",
          type: "POST",
          nodeId: "srv-1",
          publishedEvents: [
            {
              id: "ev-pub-1",
              name: "notifications",
              messagingResourceId: "top-1",
              brokerNodeId: "kafka-1",
              publishedWhen: "ALWAYS",
              version: "v1",
              category: "DOMAIN",
              delivery: "AT_LEAST_ONCE",
              ordering: "NONE",
              deprecated: false,
              payloadSchema: { id: "ps-1", mode: "raw_json", rawJson: "{}" },
            },
          ],
        },
      ],
      [],
      [kafkaNode, serviceNode],
      [edge],
    );

    const packageJsonConnected = resultConnected.files.find(
      (f) => f.filename === "package.json",
    );
    expect(packageJsonConnected).toBeDefined();
    expect(packageJsonConnected!.content).toContain("@workspace/kafka");

    const routeFileConnected = resultConnected.files.find((f) =>
      f.filename.startsWith("src/routes/"),
    );
    expect(routeFileConnected).toBeDefined();
    expect(routeFileConnected!.content).toContain("publishKafkaEvent");
    expect(routeFileConnected!.content).toContain("KAFKA_TOPICS");
  });
});


