export const RULES_VERSION = 1;

export const NODE_TYPE_TO_RESOURCE_KIND: Record<string, string | undefined> = {
  kafka: "kafka",
  sqs: "sqs",
  "redis-streams": "redis-stream",
  "redis-pubsub": "redis-pubsub",
  queue: "generic-queue",
  pubsub: "generic-pubsub",
  eventstream: "generic-eventstream",
  storage: "storage",
};

export const MESSAGING_RESOURCE_TYPES = [
  "topics",
  "streams",
  "queues",
  "channels",
  "caches",
  "buckets",
] as const;

export type MessagingResourceType = typeof MESSAGING_RESOURCE_TYPES[number];

export const MESSAGING_NODE_TYPES = [
  "queue",
  "eventstream",
  "pubsub",
  "kafka",
  "redis-streams",
  "sqs",
  "redis-pubsub",
  "cache",
  "storage",
  "redis-cache", // Added to make sure we cover all cache/storage nodes
] as const;

export type MessagingNodeType = typeof MESSAGING_NODE_TYPES[number];
