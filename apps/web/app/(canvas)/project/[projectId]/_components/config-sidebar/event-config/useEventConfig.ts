import { Endpoint, AnyMessagingResource, BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ConfigItemData, ResourceArrayName } from "./types";

export function useEventConfig(id: string, nodeId: string) {
  const events = useBackendCanvasStore((s) => s.events);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateEvent = useBackendCanvasStore((s) => s.updateEvent);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);

  let item: ConfigItemData | undefined = events.find((e) => e.id === id);
  let parentEndpoint: Endpoint | undefined;
  let parentNode: BackendNode | undefined;
  let isEndpointEvent = false;
  let isNodeResource = false;
  let resourceArrayName: ResourceArrayName = "";

  if (!item) {
    for (const ep of endpoints) {
      const publishedMatch = ep.publishedEvents?.find((e) => e.id === id);
      if (publishedMatch) {
        item = { ...publishedMatch, variant: "publish", nodeId: ep.nodeId };
        parentEndpoint = ep;
        isEndpointEvent = true;
        break;
      }
    }
  }

  if (!item) {
    // Look in nodes for topics, queues, streams, channels, caches, buckets
    const targetNodes = nodeId
      ? nodes.filter((n) => n.id === nodeId)
      : nodes;
    const searchNodes = targetNodes.length > 0 ? targetNodes : nodes;

    for (const node of searchNodes) {
      if (!node || !node.data) continue;

      if (node.data.buckets) {
        const bucketMatch = node.data.buckets.find((b) => b.id === id);
        if (bucketMatch) {
          parentNode = node;
          item = {
            ...bucketMatch,
            endpointUrl: bucketMatch.endpointUrl || node.data.endpointUrl,
            region: bucketMatch.region || node.data.defaultRegion,
            storageType: bucketMatch.storageType || node.data.storageProvider,
            forcePathStyle:
              bucketMatch.forcePathStyle !== undefined
                ? bucketMatch.forcePathStyle
                : node.data.forcePathStyle,
            accessKeyId:
              bucketMatch.accessKeyId || node.data.accessKeyId,
            secretAccessKey:
              bucketMatch.secretAccessKey || node.data.secretAccessKey,
            accessKeyIdEnv:
              bucketMatch.accessKeyIdEnv || node.data.accessKeyIdEnv,
            secretAccessKeyEnv:
              bucketMatch.secretAccessKeyEnv || node.data.secretAccessKeyEnv,
            variant: "definition",
            nodeId: node.id,
          };
          isNodeResource = true;
          resourceArrayName = "buckets";
          break;
        }
      }

      if (node.data.topics) {
        const match = node.data.topics.find((r) => r.id === id);
        if (match) {
          parentNode = node;
          item = { ...match, variant: "definition", nodeId: node.id };
          isNodeResource = true;
          resourceArrayName = "topics";
          break;
        }
      }

      if (node.data.streams) {
        const match = node.data.streams.find((r) => r.id === id);
        if (match) {
          parentNode = node;
          item = { ...match, variant: "definition", nodeId: node.id };
          isNodeResource = true;
          resourceArrayName = "streams";
          break;
        }
      }

      if (node.data.queues) {
        const match = node.data.queues.find((r) => r.id === id);
        if (match) {
          parentNode = node;
          item = { ...match, variant: "definition", nodeId: node.id };
          isNodeResource = true;
          resourceArrayName = "queues";
          break;
        }
      }

      if (node.data.channels) {
        const match = node.data.channels.find((r) => r.id === id);
        if (match) {
          parentNode = node;
          item = { ...match, variant: "definition", nodeId: node.id };
          isNodeResource = true;
          resourceArrayName = "channels";
          break;
        }
      }

      if (node.data.caches) {
        const match = node.data.caches.find((r) => r.id === id);
        if (match) {
          parentNode = node;
          item = { ...match, variant: "definition", nodeId: node.id };
          isNodeResource = true;
          resourceArrayName = "caches";
          break;
        }
      }
    }
  }

  const handleUpdate = (
    eventId: string,
    changes: Partial<AnyMessagingResource>,
  ) => {
    if (isEndpointEvent && parentEndpoint) {
      const list = parentEndpoint.publishedEvents;
      if (list) {
        const updatedList = list.map((e) =>
          e.id === eventId ? Object.assign({}, e, changes) : e,
        );
        updateEndpoint(parentEndpoint.id, {
          publishedEvents: updatedList,
        });
      }
    } else if (isNodeResource && parentNode && resourceArrayName !== "") {
      const updateNode = useBackendCanvasStore.getState().updateNode;
      const currentData = parentNode.data;

      if (resourceArrayName === "topics" && currentData.topics) {
        const updatedList = currentData.topics.map((r) =>
          r.id === eventId ? Object.assign({}, r, changes) : r,
        );
        updateNode(parentNode.id, {
          data: { ...currentData, topics: updatedList },
        });
      } else if (resourceArrayName === "streams" && currentData.streams) {
        const updatedList = currentData.streams.map((r) =>
          r.id === eventId ? Object.assign({}, r, changes) : r,
        );
        updateNode(parentNode.id, {
          data: { ...currentData, streams: updatedList },
        });
      } else if (resourceArrayName === "queues" && currentData.queues) {
        const updatedList = currentData.queues.map((r) =>
          r.id === eventId ? Object.assign({}, r, changes) : r,
        );
        updateNode(parentNode.id, {
          data: { ...currentData, queues: updatedList },
        });
      } else if (resourceArrayName === "channels" && currentData.channels) {
        const updatedList = currentData.channels.map((r) =>
          r.id === eventId ? Object.assign({}, r, changes) : r,
        );
        updateNode(parentNode.id, {
          data: { ...currentData, channels: updatedList },
        });
      } else if (resourceArrayName === "caches" && currentData.caches) {
        const updatedList = currentData.caches.map((r) =>
          r.id === eventId ? Object.assign({}, r, changes) : r,
        );
        updateNode(parentNode.id, {
          data: { ...currentData, caches: updatedList },
        });
      } else if (resourceArrayName === "buckets" && currentData.buckets) {
        const currentItem = currentData.buckets.find((r) => r.id === eventId);
        if (currentItem) {
          let hasChange = false;
          let prop: keyof AnyMessagingResource;
          for (prop in changes) {
            if (currentItem[prop] !== changes[prop]) {
              hasChange = true;
              break;
            }
          }
          if (!hasChange) return;
        }
        const updatedList = currentData.buckets.map((r) =>
          r.id === eventId ? Object.assign({}, r, changes) : r,
        );
        updateNode(parentNode.id, {
          data: { ...currentData, buckets: updatedList },
        });
      }
    } else {
      updateEvent(eventId, changes);
    }
  };

  const isPublished = item?.variant === "publish";
  const isConsumed = item?.variant === "consume";

  const messagingNodes = nodes.filter(
    (n) =>
      n.type === "queue" ||
      n.type === "pubsub" ||
      n.type === "eventstream" ||
      n.type === "kafka" ||
      n.type === "redis-streams" ||
      n.type === "sqs" ||
      n.type === "redis-pubsub",
  );

  const selectedBroker = item
    ? messagingNodes.find((n) => n.id === item.brokerNodeId)
    : undefined;

  const availableResources: AnyMessagingResource[] = selectedBroker
    ? [
        ...(selectedBroker.data.topics ?? []),
        ...(selectedBroker.data.streams ?? []),
        ...(selectedBroker.data.queues ?? []),
        ...(selectedBroker.data.channels ?? []),
      ]
    : [];

  const boundBrokerResource = item?.messagingResourceId
    ? availableResources.find((r) => r.id === item.messagingResourceId)
    : undefined;

  const isBoundToBroker = Boolean(
    item?.brokerNodeId && item?.messagingResourceId && boundBrokerResource,
  );

  const effectiveSchema = isBoundToBroker
    ? (boundBrokerResource?.payloadSchema ?? item?.payloadSchema)
    : item?.payloadSchema;

  return {
    item,
    parentEndpoint,
    parentNode,
    isEndpointEvent,
    isNodeResource,
    resourceArrayName,
    handleUpdate,
    isPublished,
    isConsumed,
    messagingNodes,
    selectedBroker,
    availableResources,
    boundBrokerResource,
    isBoundToBroker,
    effectiveSchema,
    events,
    endpoints,
    nodes,
    edges,
  };
}
