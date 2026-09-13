import type {
  BackendNodeType,
  BackendNodeData,
  BackendNode,
  PageSection,
} from "@workspace/canvas/types";
import { parsePageRoute, DEFAULT_ZONES } from "@workspace/canvas";

export function createGraphNodeData(
  type: BackendNodeType,
  label: string,
  existingNodes: BackendNode[],
): BackendNodeData {
  const baseData: BackendNodeData = {
    label: label || "",
  };

  if (type === "webApp") {
    const existingWebApps = existingNodes.filter((n) => n.type === "webApp");
    const count = existingWebApps.length;
    const effectiveLabel = label || "";
    const slug = effectiveLabel
      ? effectiveLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : `web-app-${count + 1}`;
    const existingPorts = new Set(
      existingNodes
        .filter((n) => n.type === "webApp")
        .map((n) => parseInt(String(n.data?.port || "3000"), 10))
        .filter((p) => !isNaN(p)),
    );
    let nextPort = 3000;
    while (existingPorts.has(nextPort)) {
      nextPort++;
    }

    return {
      ...baseData,
      label: effectiveLabel,
      appSlug: slug,
      port: String(nextPort),
      zones: DEFAULT_ZONES,
    };
  }

  if (type === "service") {
    const existingPorts = new Set(
      existingNodes
        .filter((n) => n.type === "service")
        .map((n) => parseInt(String(n.data?.port || "8080"), 10))
        .filter((p) => !isNaN(p)),
    );
    let nextPort = 8080;
    while (existingPorts.has(nextPort)) {
      nextPort++;
    }

    const existingGrpcPorts = new Set(
      existingNodes
        .filter((n) => n.type === "service")
        .map((n) => parseInt(String(n.data?.grpcPort || "50051"), 10))
        .filter((p) => !isNaN(p)),
    );
    let nextGrpcPort = 50051;
    while (existingGrpcPorts.has(nextGrpcPort)) {
      nextGrpcPort++;
    }

    return {
      ...baseData,
      port: String(nextPort),
      grpcPort: String(nextGrpcPort),
      inputs: [],
      logic: [],
      outputs: [],
    };
  }

  if (type === "transformer") {
    return {
      ...baseData,
      functionName: label || "",
      scope: "global",
      inputSchema: [
        { id: "in_name", name: "name", type: "string", required: true },
      ],
      logicMode: "code",
      code: "return {\n  slug: input.name.toLowerCase().replace(/\\s+/g, '-'),\n};",
      returnSchema: [
        { id: "out_slug", name: "slug", type: "string", required: true },
      ],
    };
  }

  if (type === "transformer_ref") {
    return {
      ...baseData,
      label: label || "Transformer Ref",
    };
  }

  if (type === "hook") {
    return {
      ...baseData,
      hookName: label || "",
      scope: "global",
      hookType: "query",
      inputParams: [],
      returnSchema: [],
    };
  }

  if (type === "hook_ref") {
    return {
      ...baseData,
      label: label || "Hook Ref",
    };
  }

  if (type === "types") {
    return {
      ...baseData,
      label: label || "",
      scope: "global",
      definitionMode: "visual",
      types: [
        {
          id: `type-${Date.now()}-1`,
          name: "CustomType",
          kind: "interface",
          description: "Reusable type definition",
          fields: [
            { id: "f-1", name: "id", type: "string", required: true, isArray: false },
            { id: "f-2", name: "name", type: "string", required: true, isArray: false },
            { id: "f-3", name: "createdAt", type: "string", required: true, isArray: false },
          ],
        },
      ],
      rawTypeScript: `export interface CustomType {\n  id: string;\n  name: string;\n  createdAt: string;\n}\n`,
    };
  }

  if (type === "webPage") {
    return {
      ...baseData,
      label: label ? parsePageRoute(label) : "",
      sections: [
        {
          id: `sec-${Date.now()}`,
          name: "Main Section",
          renderMode: "server",
          loadStrategy: "eager",
          actions: [
            {
              id: `evt-${Date.now()}`,
              name: "pageLoad",
              event: "pageLoad",
            },
          ],
        } satisfies PageSection,
      ],
    };
  }

  if (type === "external") {
    return {
      ...baseData,
      actions: [],
    };
  }

  if (type === "kafka") {
    return {
      ...baseData,
      topics: [],
      kafkaBroker: {},
    };
  }

  if (type === "redis-streams") {
    return {
      ...baseData,
      streams: [],
      redisBroker: {},
    };
  }

  if (type === "sqs") {
    return {
      ...baseData,
      queues: [],
      sqsBroker: {},
    };
  }

  if (type === "redis-pubsub") {
    return {
      ...baseData,
      channels: [],
    };
  }

  if (type === "storage") {
    return {
      ...baseData,
      buckets: [],
    };
  }

  if (type === "worker") {
    return {
      ...baseData,
      tasks: [],
    };
  }

  if (type === "serverless" || type === "api_gateway") {
    return {
      ...baseData,
      endpoints: [],
      ...(type === "api_gateway" ? { authRules: [] } : {}),
    };
  }

  if (type === "search_index") {
    return {
      ...baseData,
      searchSources: [],
    };
  }

  if (type === "load_balancer") {
    return {
      ...baseData,
      targetGroups: [],
    };
  }

  if (type === "llm" || type === "mcp_server") {
    return {
      ...baseData,
      prompts: [],
      tools: [],
      ...(type === "mcp_server" ? { resources: [] } : {}),
    };
  }

  if (type === "langgraph") {
    return {
      ...baseData,
      inputChannels: [],
      stateChannels: [
        {
          key: "messages",
          type: "messages",
          reducer: "add_messages",
          defaultValue: [],
        },
      ],
      graphSteps: [],
      graphEdges: [],
    };
  }

  if (type === "state_store") {
    const existingStores = existingNodes.filter((n) => n.type === "state_store");
    const count = existingStores.length;
    const defaultLabel = label || `AppStore${count > 0 ? count + 1 : ""}`;
    return {
      ...baseData,
      label: defaultLabel,
      storeName: defaultLabel,
      scope: "global",
      storage: "memory",
      fields: [
        { id: crypto.randomUUID(), name: "value", type: "string", defaultValue: "" },
      ],
      actions: [],
    };
  }

  return baseData;
}
