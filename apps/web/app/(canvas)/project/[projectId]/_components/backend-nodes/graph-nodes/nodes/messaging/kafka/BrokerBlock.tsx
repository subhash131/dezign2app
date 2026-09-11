import React from "react";
import { Position, Handle } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Server,
  Trash,
  Sparkles,
  RefreshCw,
  Sliders,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import type { BrokerNodeModel } from "@workspace/canvas";

export interface BrokerBlockProps {
  nodeId: string;
  broker: BrokerNodeModel;
  isLastBroker?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDeleteTopic?: (topicId: string) => void;
  onConfigureTopic?: (topicId: string) => void;
}

export const BrokerBlock: React.FC<BrokerBlockProps> = ({
  broker,
  isLastBroker,
  isCollapsed,
  onToggleCollapse,
  onDeleteTopic,
  onConfigureTopic,
}) => {
  const isOpen = !isCollapsed;

  // Topics that have at least one partition leader on this broker
  const leaderTopics = broker.topics.filter((t) =>
    t.partitions.some((p) => p.isLeader),
  );

  return (
    <div
      className={cn(
        "flex flex-col border-b last:border-b-0 bg-card/60 transition-colors",
        isLastBroker && !isOpen && "rounded-b-[10px]",
      )}
    >
      {/* Broker Header */}
      <div
        className={cn(
          "px-2.5 py-1.5 bg-secondary/30 hover:bg-secondary/50 flex items-center justify-between gap-1.5 cursor-pointer nodrag select-none transition-colors group/broker relative",
          isLastBroker && !isOpen && "rounded-b-[10px]",
        )}
        onClick={onToggleCollapse}
      >
        {/* Collapsed Handles: anchored to broker header when collapsed */}
        {!isOpen && (
          <>
            {leaderTopics.map((t) => (
              <React.Fragment key={t.topicId}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`topics:in:${t.topicId}`}
                  className="w-2 h-2 -left-1 !bg-teal-500"
                  style={{ top: "50%" }}
                  title={`Produce to ${t.topicName} (Leader: ${broker.name})`}
                />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`topics:out:${t.topicId}`}
                  className="w-2 h-2 -right-1 !bg-teal-500"
                  style={{ top: "50%" }}
                  title={`Consume from ${t.topicName} (Leader: ${broker.name})`}
                />
              </React.Fragment>
            ))}
          </>
        )}

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
            aria-label={isOpen ? "Collapse broker" : "Expand broker"}
          >
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <Server size={12} className="text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="text-[11px] font-semibold truncate text-foreground">
            {broker.name}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/80 shrink-0">
            :{broker.port}
          </span>
        </div>

        {/* Broker Summary Badges */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
            title={`${broker.leaderCount} partition leader(s) hosted on ${broker.name}`}
          >
            {broker.leaderCount} L
          </span>
          {broker.replicaCount > 0 && (
            <span
              className="px-1.5 py-0.2 rounded text-[9px] font-mono text-muted-foreground bg-secondary/50 border border-border/40"
              title={`${broker.replicaCount} follower replica(s) hosted on ${broker.name}`}
            >
              {broker.replicaCount} R
            </span>
          )}
        </div>
      </div>

      {/* Expanded Topics List */}
      {isOpen && (
        <div className="flex flex-col divide-y divide-border/20 bg-background/30">
          {broker.topics.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground italic">
              No partitions assigned to this broker
            </div>
          ) : (
            broker.topics.map((t) => {
              const hasLeader = t.partitions.some((p) => p.isLeader);

              return (
                <div
                  key={t.topicId}
                  className="px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-secondary/20 relative group/topic transition-colors"
                >
                  {/* Topic connection handles on Leader Broker */}
                  {hasLeader && (
                    <>
                      <Handle
                        type="target"
                        position={Position.Left}
                        id={`topics:in:${t.topicId}`}
                        className="w-2 h-2 -left-1 !bg-teal-500"
                        style={{ top: "50%" }}
                        title={`Produce to ${t.topicName} (Leader: ${broker.name})`}
                      />
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`topics:out:${t.topicId}`}
                        className="w-2 h-2 -right-1 !bg-teal-500"
                        style={{ top: "50%" }}
                        title={`Consume from ${t.topicName} (Leader: ${broker.name})`}
                      />
                    </>
                  )}

                  {/* Topic Name */}
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        hasLeader ? "bg-teal-500" : "bg-muted-foreground/50",
                      )}
                    />
                    <span
                      className="text-[10px] font-medium truncate max-w-[120px] text-foreground"
                      title={t.topicName}
                    >
                      {t.topicName}
                    </span>
                  </div>

                  {/* Partitions Badges & Topic Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex items-center gap-0.5 flex-wrap justify-end">
                      {t.partitions.map((p) => (
                        <span
                          key={p.partitionIndex}
                          className={cn(
                            "px-1 py-0.2 rounded text-[8px] font-mono flex items-center gap-0.5",
                            p.isLeader
                              ? "bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 font-semibold"
                              : "bg-secondary/60 text-muted-foreground border border-border/30",
                          )}
                          title={
                            p.isLeader
                              ? `Partition ${p.partitionIndex} (Leader on ${broker.name})`
                              : `Partition ${p.partitionIndex} (In-Sync Replica on ${broker.name})`
                          }
                        >
                          P{p.partitionIndex}
                          {p.isLeader ? (
                            <Sparkles size={7} className="text-teal-600 dark:text-teal-400" />
                          ) : (
                            <RefreshCw size={7} className="opacity-60" />
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Action buttons (hover) */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/topic:opacity-100 transition-opacity ml-1">
                      {onConfigureTopic && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onConfigureTopic(t.topicId);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                          title="Configure topic schema & overrides"
                        >
                          <Sliders size={10} />
                        </button>
                      )}
                      {onDeleteTopic && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTopic(t.topicId);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-destructive rounded"
                          title="Delete topic"
                        >
                          <Trash size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
