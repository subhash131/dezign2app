import { describe, it, expect } from "vitest";
import { Endpoint, BackendNode, BackendEdge } from "@workspace/canvas/types";
import { generateEndpointRouteHandler } from "../generators/routeGenerator/endpointHandlerGenerator";
import { renderPipelineStep } from "../generators/routeGenerator/pipelineRenderer";
import { compileMonorepo } from "../compileMonorepo";

describe("Kafka Publish Pipeline Step Schema Bindings", () => {
  it("renders individual schema field bindings as an assembled object literal payload", () => {
    const ep: Endpoint & { nodeId: string } = {
      id: "ep-send-msg",
      nodeId: "node-conversations",
      name: "Send Message",
      type: "POST",
      requestBody: {
        id: "rb-1",
        fields: [
          { id: "f-1", name: "demo", type: "string", required: true },
          { id: "f-2", name: "conversationId", type: "string", required: true },
        ],
      },
      pipelineSteps: [
        {
          id: "step-kafka-publish",
          name: "publishMessageSentResult",
          type: "kafka_publish",
          enabled: true,
          functionRef: {
            name: "publishMessageSent",
            importPath: "@workspace/kafka/publishers",
          },
          inputBindings: [
            {
              argName: "fieldName",
              source: { kind: "req_body", field: "demo" },
            },
            {
              argName: "conversationId",
              source: { kind: "req_body", field: "conversationId" },
            },
          ],
          outputVariable: "publishMessageSentResult",
        },
        {
          id: "step-return",
          name: "Return Result",
          type: "return_response",
          enabled: true,
          statusCode: 200,
          inputBindings: [
            {
              argName: "data",
              source: { kind: "req_body" },
            },
          ],
          outputVariable: "",
        },
      ],
    };

    const result = generateEndpointRouteHandler({
      ep,
      index: 0,
      serviceName: "ConversationsService",
      pascalServiceName: "ConversationsService",
      serviceFolderName: "conversations",
      allNodes: [],
      allEdges: [],
      allEndpoints: [ep],
      dbFunctions: [],
      kafkaFunctions: [],
      redisFunctions: [],
      nodePublishedEvents: [],
      usedFileNames: new Set(),
    });

    const content = result.file.content;

    // Verify it compiles the object literal with individual schema field bindings
    expect(content).toContain("const publishMessageSentResult = await publishMessageSent(");
    expect(content).toContain("fieldName: body.demo,");
    expect(content).toContain("conversationId: body.conversationId,");
    expect(content).not.toContain("await publishMessageSent(\n  body.demo\n);");
  });

  it("compiles in compileMonorepo and generates valid typed publisher with schema", () => {
    const serviceNode: BackendNode = {
      id: "node-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        port: "8082",
      },
    };

    const kafkaNode: BackendNode = {
      id: "node-kafka",
      type: "kafka",
      position: { x: 300, y: 0 },
      fractionalIndex: "b0",
      data: {
        label: "kafka",
        topics: [
          {
            id: "topic-message-sent",
            name: "Message Sent",
            payloadSchema: {
              id: "ps-1",
              fields: [
                { id: "f-1", name: "fieldName", type: "string", required: true },
              ],
            },
          },
        ],
      },
    };

    const ep: Endpoint & { nodeId: string } = {
      id: "ep-send-msg",
      nodeId: "node-conversations",
      name: "Send Message",
      type: "POST",
      requestBody: {
        id: "rb-1",
        fields: [
          { id: "f-1", name: "demo", type: "string", required: true },
        ],
      },
      pipelineSteps: [
        {
          id: "step-kafka-publish",
          name: "publishMessageSentResult",
          type: "kafka_publish",
          enabled: true,
          brokerNodeId: "node-kafka",
          messagingResourceId: "topic-message-sent",
          functionRef: {
            name: "publishMessageSent",
            importPath: "@workspace/kafka/publishers",
          },
          inputBindings: [
            {
              argName: "fieldName",
              source: { kind: "req_body", field: "demo" },
            },
          ],
          outputVariable: "publishMessageSentResult",
        },
      ],
    };

    const edge: BackendEdge = {
      id: "edge-srv-kafka",
      source: "node-conversations",
      target: "node-kafka",
      type: "connection",
      fractionalIndex: "a0",
      data: {
        label: "",  
      },
    };

    const monorepo = compileMonorepo(
      [serviceNode, kafkaNode],
      [ep],
      [],
      [edge],
      [],
      "TestKafkaMonorepo",
    );

    const routeFile = monorepo.files.find(
      (f) => f.filename === "apps/conversations/src/routes/postSendMessage.ts",
    );
    expect(routeFile).toBeDefined();
    expect(routeFile?.content).toContain("await publishMessageSent(");
    expect(routeFile?.content).toContain("fieldName: body.demo,");

    const publisherFile = monorepo.files.find(
      (f) => f.filename === "packages/kafka/src/publishers/messageSent.ts",
    );
    expect(publisherFile).toBeDefined();
    expect(publisherFile?.content).toContain("export interface MessageSentPayload {");
    expect(publisherFile?.content).toContain("fieldName: string;");
  });

  it("renders empty object payload when only key binding is provided (never /* payload */)", () => {
    const step = {
      id: "step-kafka-publish",
      name: "Publish Message Sent",
      type: "kafka_publish" as const,
      enabled: true,
      functionRef: {
        name: "publishMessageSent",
        importPath: "@workspace/kafka/publishers",
      },
      inputBindings: [
        {
          argName: "key",
          source: { kind: "req_body" as const, field: "demo" },
        },
      ],
      outputVariable: "publishResult",
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });
    const code = lines.join("\n");

    expect(code).not.toContain("/* payload */");
    expect(code).toContain("const publishResult = await publishMessageSent(\n  {},\n  body.demo,\n);");
  });

  it("does not pass topic parameter to typed publishers even if topic binding is present", () => {
    const step = {
      id: "step-kafka-publish",
      name: "Publish Message Sent",
      type: "kafka_publish" as const,
      enabled: true,
      functionRef: {
        name: "publishMessageSent",
        importPath: "@workspace/kafka/publishers",
      },
      inputBindings: [
        {
          argName: "topic",
          source: { kind: "inline" as const, value: "message_sent" },
        },
        {
          argName: "payload",
          source: { kind: "req_body" as const },
        },
      ],
      outputVariable: "publishResult",
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });
    const code = lines.join("\n");

    expect(code).toContain("const publishResult = await publishMessageSent(\n  body\n);");
    expect(code).not.toContain('"message_sent"');
  });
});


