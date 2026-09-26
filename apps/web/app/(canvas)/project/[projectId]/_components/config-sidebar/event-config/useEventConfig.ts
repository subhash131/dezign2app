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
    parentNode = nodes.find((n) => n.id === nodeId);
    if (parentNode && parentNode.data) {
      const { topics, streams, queues, channels, caches, buckets } =
        parentNode.data;
      const candidateArrays: Array<{
        name: ResourceArrayName;
        arr:
          | typeof topics
          | typeof streams
          | typeof queues
          | typeof channels
          | typeof caches
          | typeof buckets;
      }> = [
        { name: "topics", arr: topics },
        { name: "streams", arr: streams },
        { name: "queues", arr: queues },
        { name: "channels", arr: channels },
        { name: "caches", arr: caches },
        { name: "buckets", arr: buckets },
      ];

      for (const candidate of candidateArrays) {
        if (candidate.arr) {
          const match = candidate.arr.find((r) => r.id === id);
          if (match) {
            item = { ...match, variant: "definition", nodeId: parentNode.id };
            isNodeResource = true;
            resourceArrayName = candidate.name;
            break;
          }
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
          const hasChange = Object.entries(changes).some(
            ([k, v]) => (currentItem as any)[k] !== v,
          );
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

  const availableResources = selectedBroker
    ? ((selectedBroker.data.topics ||
        selectedBroker.data.streams ||
        selectedBroker.data.queues ||
        selectedBroker.data.channels ||
        []) as AnyMessagingResource[])
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
