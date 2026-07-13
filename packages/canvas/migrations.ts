import type { BackendNode, Parameter, Schema, ProcessingStep, PublishedEvent, ConsumedEvent, Endpoint, SchemaVersion, EventCategory, DeliveryGuarantee, EventOrdering, ArchitectureMetadata, RetryPolicy } from "./types";

function stringToSchema(schemaInput: string | Record<string, unknown> | null | undefined | unknown, defaultName: string = "body"): Schema {
  if (!schemaInput) {
    return { id: crypto.randomUUID(), fields: [] };
  }
  
  // If it's already an object that looks like a Schema
  if (typeof schemaInput === 'object' && schemaInput !== null) {
    const obj = schemaInput as Record<string, unknown>;
    if (obj.id && Array.isArray(obj.fields)) {
      return obj as unknown as Schema;
    }
    // If it's an object but not a Schema, stringify it for the description
    schemaInput = JSON.stringify(schemaInput);
  }

  if (typeof schemaInput === 'string') {
    if (schemaInput.startsWith('{"id":') && schemaInput.includes('"fields":')) {
      try {
        const parsed = JSON.parse(schemaInput) as Record<string, unknown>;
        if (parsed.id && Array.isArray(parsed.fields)) {
          return parsed as unknown as Schema;
        }
      } catch (e) {}
    }
  }

  return {
    id: crypto.randomUUID(),
    fields: [
      {
        id: crypto.randomUUID(),
        name: defaultName,
        type: "string",
        required: true,
        description: typeof schemaInput === 'string' ? schemaInput : JSON.stringify(schemaInput),
      },
    ],
  };
}

type LegacyParameter = {
  id?: string;
  name?: string;
  key?: string;
  type?: string;
  required?: boolean;
  description?: string;
  value?: string;
  defaultValue?: string;
};

function convertParams(params: LegacyParameter[] | undefined): Parameter[] {
  if (!params) return [];
  return params.map(p => ({
    id: p.id || crypto.randomUUID(),
    name: p.name || p.key || "",
    type: p.type || "string",
    required: p.required ?? true,
    description: p.description || p.value || "",
    defaultValue: p.defaultValue,
  }));
}

type LegacyPublishedEvent = {
  id?: string;
  name?: string;
  publishedWhen?: string;
  description?: string;
  brokerNodeId?: string;
  targetNodeId?: string;
  messagingResourceId?: string;
  topic?: string;
  payloadSchema?: Schema;
  schema?: string | object;
  version?: SchemaVersion;
  category?: EventCategory;
  delivery?: DeliveryGuarantee;
  ordering?: EventOrdering;
  correlationId?: string;
  deprecated?: boolean;
  replacementEventId?: string;
  metadata?: ArchitectureMetadata;
};

type LegacyConsumedEvent = {
  id?: string;
  name?: string;
  eventId?: string;
  brokerNodeId?: string;
  targetNodeId?: string;
  messagingResourceId?: string;
  topic?: string;
  payloadSchema?: Schema;
  schema?: string | object;
  handlerLogic?: string;
  retryPolicy?: RetryPolicy;
  maxRetries?: number;
  deadLetterQueue?: string;
  isIdempotent?: boolean;
  metadata?: ArchitectureMetadata;
};

type LegacyEndpoint = {
  id?: string;
  name?: string;
  type?: string;
  headers?: LegacyParameter[];
  pathParams?: LegacyParameter[];
  queryParams?: LegacyParameter[];
  params?: LegacyParameter[];
  requestBody?: Schema;
  body?: string | object;
  responseBody?: Schema;
  output?: string | object;
  processingSteps?: ProcessingStep[];
  businessLogic?: string;
  publishedEvents?: LegacyPublishedEvent[];
  metadata?: ArchitectureMetadata;
};

export function migrateNodeDataToV2(node: BackendNode): BackendNode {
  const nodeWithVersion = node as BackendNode & { schemaVersion?: number };
  if (nodeWithVersion.schemaVersion === 2) {
    return node;
  }

  const data = { ...node.data } as Record<string, unknown> & typeof node.data;

  if (data.endpoints && Array.isArray(data.endpoints)) {
    data.endpoints = data.endpoints.map((ep: LegacyEndpoint) => {
      const publishedEvents: PublishedEvent[] = (ep.publishedEvents || []).map((pe: LegacyPublishedEvent) => ({
        ...pe,
        id: pe.id || crypto.randomUUID(),
        name: pe.name || "",
        publishedWhen: pe.publishedWhen || pe.description || "",
        brokerNodeId: pe.brokerNodeId || pe.targetNodeId || "",
        messagingResourceId: pe.messagingResourceId || pe.topic || "",
        payloadSchema: pe.payloadSchema || stringToSchema(pe.schema, "payload"),
        version: pe.version || "v1",
        category: pe.category || "DOMAIN",
        delivery: pe.delivery || "AT_LEAST_ONCE",
        ordering: pe.ordering || "NONE",
        correlationId: pe.correlationId,
        deprecated: !!pe.deprecated,
        replacementEventId: pe.replacementEventId,
        metadata: pe.metadata || { createdByAI: false, createdAt: Date.now() },
      }));

      let processingSteps: ProcessingStep[] = ep.processingSteps || [];
      if (!ep.processingSteps && ep.businessLogic) {
        processingSteps = [
          {
            id: crypto.randomUUID(),
            text: ep.businessLogic,
          },
        ];
      }

      return {
        ...ep,
        id: ep.id || crypto.randomUUID(),
        name: ep.name || "",
        type: ep.type || "GET",
        headers: convertParams(ep.headers),
        pathParams: convertParams(ep.pathParams),
        queryParams: convertParams(ep.params || ep.queryParams),
        requestBody: ep.requestBody || stringToSchema(ep.body, "request"),
        responseBody: ep.responseBody || stringToSchema(ep.output || ep.responseBody, "response"),
        processingSteps,
        publishedEvents,
        metadata: ep.metadata || { createdByAI: false, createdAt: Date.now() },
      } as Endpoint;
    });
  }

  if (data.publishedEvents && Array.isArray(data.publishedEvents)) {
    data.publishedEvents = (data.publishedEvents as LegacyPublishedEvent[]).map((pe: LegacyPublishedEvent) => ({
      ...pe,
      id: pe.id || crypto.randomUUID(),
      name: pe.name || "",
      publishedWhen: pe.publishedWhen || pe.description || "",
      brokerNodeId: pe.brokerNodeId || pe.targetNodeId || "",
      messagingResourceId: pe.messagingResourceId || pe.topic || "",
      payloadSchema: pe.payloadSchema || stringToSchema(pe.schema, "payload"),
      version: pe.version || "v1",
      category: pe.category || "DOMAIN",
      delivery: pe.delivery || "AT_LEAST_ONCE",
      ordering: pe.ordering || "NONE",
      correlationId: pe.correlationId,
      deprecated: !!pe.deprecated,
      replacementEventId: pe.replacementEventId,
      metadata: pe.metadata || { createdByAI: false, createdAt: Date.now() },
    })) as unknown as NonNullable<BackendNode["data"]["publishedEvents"]>;
  }

  if (data.consumedEvents && Array.isArray(data.consumedEvents)) {
    data.consumedEvents = (data.consumedEvents as LegacyConsumedEvent[]).map((ce: LegacyConsumedEvent) => ({
      ...ce,
      id: ce.id || crypto.randomUUID(),
      name: ce.name || "",
      eventId: ce.eventId || "",
      brokerNodeId: ce.brokerNodeId || ce.targetNodeId || "",
      messagingResourceId: ce.messagingResourceId || ce.topic || "",
      payloadSchema: ce.payloadSchema || (ce.schema ? stringToSchema(ce.schema, "payload") : undefined),
      handlerLogic: ce.handlerLogic || "",
      retryPolicy: ce.retryPolicy || "NONE",
      maxRetries: ce.maxRetries,
      deadLetterQueue: ce.deadLetterQueue,
      isIdempotent: !!ce.isIdempotent,
      metadata: ce.metadata || { createdByAI: false, createdAt: Date.now() },
      _legacyName: ce.name,
      _legacySchema: ce.schema,
    })) as unknown as NonNullable<BackendNode["data"]["consumedEvents"]>;
  }

  (node as BackendNode & { schemaVersion?: number }).schemaVersion = 2;
  node.data = data as unknown as typeof node.data;
  return node;
}
