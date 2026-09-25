import React from "react";
import { Lock, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { SchemaEditor } from "../backend-nodes/graph-nodes/Editors";
import {
  EventConfigProps,
  useEventConfig,
  EventConfigHeader,
  BrokerBindingConfig,
  EventDescriptionConfig,
  EventConnectionsConfig,
  BucketStorageConfig,
  CacheConfig,
  ConsumerConfig,
  PublisherConfig,
} from "./event-config";

export const EventConfig: React.FC<EventConfigProps> = ({ id, nodeId }) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const {
    item,
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
    edges,
    nodes,
    endpoints,
    events,
  } = useEventConfig(id, nodeId);

  if (!item) return null;

  const isCache = resourceArrayName === "caches" || item.kind === "cache";
  const isBucket = resourceArrayName === "buckets";
  const isReadOnly = item.variant !== "definition" && !isBucket;

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      <EventConfigHeader
        item={item}
        resourceArrayName={resourceArrayName}
        handleUpdate={handleUpdate}
      />

      {item.variant !== "definition" && (
        <BrokerBindingConfig
          item={item}
          isPublished={isPublished}
          messagingNodes={messagingNodes}
          availableResources={availableResources}
          handleUpdate={handleUpdate}
        />
      )}

      {!isConsumed && !isCache && (
        <EventDescriptionConfig
          item={item}
          isPublished={isPublished}
          handleUpdate={handleUpdate}
        />
      )}

      {item.variant === "definition" && (
        <EventConnectionsConfig
          item={item}
          resourceArrayName={resourceArrayName}
          edges={edges}
          nodes={nodes}
          endpoints={endpoints}
          events={events}
        />
      )}

      {isBucket && (
        <BucketStorageConfig item={item} handleUpdate={handleUpdate} />
      )}

      {!isCache && !isBucket && (
        <SchemaEditor
          title={
            isConsumed
              ? "Expected Payload"
              : isPublished
                ? "Payload Schema"
                : "Schema"
          }
          schema={effectiveSchema}
          readOnly={isReadOnly}
          readOnlyMessage={
            isReadOnly ? (
              isBoundToBroker && selectedBroker && boundBrokerResource ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                  <div className="flex items-center gap-1.5 text-primary font-medium overflow-hidden">
                    <Lock size={13} className="shrink-0 text-primary" />
                    <span className="truncate">
                      Inherited from{" "}
                      <strong className="font-semibold text-foreground">
                        {selectedBroker.data?.label || selectedBroker.type || "Broker"} &rsaquo; {boundBrokerResource.name || "Topic"}
                      </strong>
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-primary hover:bg-primary/10 hover:text-primary gap-1 font-semibold shrink-0"
                    onClick={() => {
                      setActiveConfigItem({
                        type: "event",
                        id: boundBrokerResource.id,
                        nodeId: selectedBroker.id,
                      });
                    }}
                  >
                    <ExternalLink size={11} /> Edit on Broker
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border/50 rounded-lg text-xs text-muted-foreground">
                  <AlertCircle size={14} className="shrink-0 text-amber-500" />
                  <span>Select a broker and topic above to inherit its schema contract.</span>
                </div>
              )
            ) : undefined
          }
          onChange={(payloadSchema) => {
            if (!isReadOnly) {
              handleUpdate(item.id, { payloadSchema });
            }
          }}
        />
      )}

      {isCache && (
        <CacheConfig item={item} nodes={nodes} handleUpdate={handleUpdate} />
      )}

      {isConsumed && (
        <ConsumerConfig
          item={item}
          handleUpdate={handleUpdate}
          nodes={nodes}
          edges={edges}
          nodeId={nodeId}
        />
      )}

      {isPublished && (
        <PublisherConfig item={item} handleUpdate={handleUpdate} />
      )}
    </div>
  );
};
