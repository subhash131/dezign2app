import { BackendNode } from "@/types/canvas";
import { AnyMessagingResource, CompiledFile } from "@workspace/canvas/types";
import { toVarName, toPascalCase } from "../../utils";
import {
  schemaToTsInterface,
  schemaToZodSchema,
} from "../schemaToTypeScript";

export function generateEventsModule(
  nodes: BackendNode[],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
): { file: CompiledFile; exportStatement: string } {
  const seenEventIds = new Set<string>(events.map((e) => e.id));
  const allEvents: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [...events];

  nodes.forEach((n) => {
    if (n.data?.publishedEvents) {
      n.data.publishedEvents.forEach((e) => {
        if (!seenEventIds.has(e.id)) {
          seenEventIds.add(e.id);
          allEvents.push({ ...e, nodeId: n.id, variant: "publish" as const });
        }
      });
    }
    if (n.data?.consumedEvents) {
      n.data.consumedEvents.forEach((e) => {
        if (!seenEventIds.has(e.id)) {
          seenEventIds.add(e.id);
          allEvents.push({ ...e, nodeId: n.id, variant: "consume" as const });
        }
      });
    }
  });

  let eventsCode = `import { z } from "zod";\n\n`;
  if (allEvents.length === 0) {
    eventsCode += `// No messaging events configured\nexport type GenericEventPayload = Record<string, string | number | boolean | null>;\n`;
  } else {
    const processedEventNames = new Set<string>();

    allEvents.forEach((ev) => {
      const eventName = ev.name || "event";
      const eventPascalName = toPascalCase(eventName);
      if (processedEventNames.has(eventPascalName)) return;
      processedEventNames.add(eventPascalName);

      const payloadInterfaceName = `${eventPascalName}EventPayload`;
      const schemaName = `${toVarName(eventName)}PayloadSchema`;

      let payloadSchema = ev.payloadSchema;
      if (ev.brokerNodeId && ev.messagingResourceId) {
        const brokerNode = nodes.find((n) => n.id === ev.brokerNodeId);
        const brokerResources = [
          ...(brokerNode?.data?.topics || []),
          ...(brokerNode?.data?.streams || []),
          ...(brokerNode?.data?.queues || []),
          ...(brokerNode?.data?.channels || []),
        ];
        const brokerResource = brokerResources.find((r) => r.id === ev.messagingResourceId);
        if (brokerResource?.payloadSchema) {
          payloadSchema = brokerResource.payloadSchema;
        }
      }

      const schemaObj = {
        rawJson: payloadSchema?.rawJson,
        fields: payloadSchema?.fields,
        mode: payloadSchema?.mode,
        requestBodyMode: payloadSchema?.requestBodyMode,
      };

      const interfaceRes = schemaToTsInterface(payloadInterfaceName, schemaObj);
      const zodRes = schemaToZodSchema(schemaName, schemaObj);

      eventsCode += `// --- Event Contract: "${eventName}" ---\n`;
      eventsCode += interfaceRes.code + "\n";
      if (zodRes.hasContent) {
        eventsCode += zodRes.code + "\n";
      }
    });
  }

  return {
    file: {
      filename: "src/events/index.ts",
      language: "typescript",
      content: eventsCode,
    },
    exportStatement: `export * from "./events";`,
  };
}
