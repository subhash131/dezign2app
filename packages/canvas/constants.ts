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
