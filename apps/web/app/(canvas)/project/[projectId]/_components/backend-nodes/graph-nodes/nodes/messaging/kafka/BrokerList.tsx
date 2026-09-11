import React, { useState } from "react";
import type { BrokerNodeModel } from "@workspace/canvas";
import { BrokerBlock } from "./BrokerBlock";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface BrokerListProps {
  nodeId: string;
  brokers: BrokerNodeModel[];
  onDeleteTopic?: (topicId: string) => void;
  onConfigureTopic?: (topicId: string) => void;
}

export const BrokerList: React.FC<BrokerListProps> = ({
  nodeId,
  brokers,
  onDeleteTopic,
  onConfigureTopic,
}) => {
  const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});

  const toggleCollapse = (brokerId: number) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [brokerId]: !prev[brokerId],
    }));
  };

  const allCollapsed =
    brokers.length > 0 && brokers.every((b) => Boolean(collapsedMap[b.id]));

  const toggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !allCollapsed;
    const nextMap: Record<number, boolean> = {};
    brokers.forEach((b) => {
      nextMap[b.id] = nextState;
    });
    setCollapsedMap(nextMap);
  };

  return (
    <div className="flex flex-col border-b divide-y divide-border/30 nodrag">
      {/* Mini toolbar */}
      <div className="px-3 py-1 bg-secondary/15 flex items-center justify-between text-[9px] text-muted-foreground select-none">
        <span className="font-semibold uppercase tracking-wider">
          Cluster Brokers ({brokers.length})
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-0.5 hover:text-foreground transition-colors cursor-pointer"
        >
          {allCollapsed ? (
            <>
              <span>Expand All</span>
              <ChevronDown size={10} />
            </>
          ) : (
            <>
              <span>Collapse All</span>
              <ChevronUp size={10} />
            </>
          )}
        </button>
      </div>

      {/* Broker blocks */}
      {brokers.map((broker, idx) => (
        <BrokerBlock
          key={broker.id}
          nodeId={nodeId}
          broker={broker}
          isLastBroker={idx === brokers.length - 1}
          isCollapsed={Boolean(collapsedMap[broker.id])}
          onToggleCollapse={() => toggleCollapse(broker.id)}
          onDeleteTopic={onDeleteTopic}
          onConfigureTopic={onConfigureTopic}
        />
      ))}
    </div>
  );
};
