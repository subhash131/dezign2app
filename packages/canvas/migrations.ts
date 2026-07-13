import type { BackendNode, Parameter, Schema, ProcessingStep, PublishedEvent, ConsumedEvent, Endpoint } from "./types.js";

function stringToSchema(schemaInput: any, defaultName: string = "body"): Schema {
  if (!schemaInput) {
    return { id: crypto.randomUUID(), fields: [] };
  }
  
  // If it's already an object that looks like a Schema
  if (typeof schemaInput === 'object' && schemaInput !== null) {
    if (schemaInput.id && Array.isArray(schemaInput.fields)) {
      return schemaInput as Schema;
    }
    // If it's an object but not a Schema, stringify it for the description
    schemaInput = JSON.stringify(schemaInput);
  }

  if (typeof schemaInput === 'string') {
    if (schemaInput.startsWith('{"id":') && schemaInput.includes('"fields":')) {
      try {
        const parsed = JSON.parse(schemaInput);
        if (parsed.id && Array.isArray(parsed.fields)) {
          return parsed as Schema;
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

function convertParams(params: any[] | undefined): Parameter[] {
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

export function migrateNodeDataToV2(node: BackendNode): BackendNode {
  if ((node as any).schemaVersion === 2) {
    return node;
  }

  const data = { ...node.data };

  if (data.endpoints && Array.isArray(data.endpoints)) {
    data.endpoints = data.endpoints.map((ep: any) => {
      const publishedEvents: PublishedEvent[] = (ep.publishedEvents || []).map((pe: any) => ({
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
    data.publishedEvents = data.publishedEvents.map((pe: any) => ({
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
    })) as PublishedEvent[];
  }

  if (data.consumedEvents && Array.isArray(data.consumedEvents)) {
    data.consumedEvents = data.consumedEvents.map((ce: any) => ({
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
    })) as any;
  }

  (node as any).schemaVersion = 2;
  node.data = data;
  return node;
}
