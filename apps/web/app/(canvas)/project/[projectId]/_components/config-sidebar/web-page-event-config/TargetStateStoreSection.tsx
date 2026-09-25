"use client";

import React from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Database, Plus } from "lucide-react";
import {
  TargetStateStoreSectionProps,
  useTargetStateStoreBinding,
  StoreManipulationCard,
} from "./target-state-store";

export type { TargetStateStoreSectionProps };

export const TargetStateStoreSection: React.FC<TargetStateStoreSectionProps> = ({
  nodeId,
  actionId,
  actionName,
  actionEvent,
  storeBinding,
  storeBindings,
  stateStoreNodes,
  isEndpointConnected,
  connectedEndpointName,
  connectedEndpoint,
  eventRequestBody,
  onUpdateStoreBinding,
  onUpdateStoreBindings,
}) => {
  const {
    bindings,
    handleAddManipulation,
    handleRemoveManipulation,
    handleMoveManipulation,
    handleUpdateManipulation,
  } = useTargetStateStoreBinding({
    nodeId,
    actionId,
    actionName,
    actionEvent,
    storeBinding,
    storeBindings,
    stateStoreNodes,
    isEndpointConnected,
    connectedEndpoint,
    eventRequestBody,
    onUpdateStoreBinding,
    onUpdateStoreBindings,
  });

  const activeBindingsCount = bindings.filter((b) => Boolean(b.storeNodeId)).length;

  return (
    <AccordionItem
      value="store_action_binding"
      className="border rounded-xl overflow-hidden bg-card"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-secondary/20 transition-colors [&>svg]:shrink-0">
        <div className="flex items-center justify-between w-full pr-2">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-indigo-500" />
            <span className="text-xs font-semibold">
              Target State Store Manipulations
            </span>
            {activeBindingsCount > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] font-mono px-1.5 py-0 h-4 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
              >
                {activeBindingsCount}
              </Badge>
            )}
          </div>
          {bindings.length === 1 && bindings[0]?.storeName && (
            <Badge
              variant="secondary"
              className="text-[10px] font-mono font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 truncate max-w-[170px]"
            >
              {bindings[0].storeName}.{bindings[0].actionName || "set"}()
            </Badge>
          )}
          {bindings.length > 1 && (
            <Badge
              variant="secondary"
              className="text-[10px] font-mono font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
            >
              {activeBindingsCount} Updates
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-5 pt-2">
        <div className="flex flex-col gap-4">
          {bindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded-xl bg-muted/20 text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Database size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold">No State Store Manipulations</span>
                <span className="text-[11px] text-muted-foreground max-w-[280px]">
                  Wire this action to mutate state stores (set field, append/pop array, populate, or call custom actions).
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-indigo-500/30 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                onClick={handleAddManipulation}
              >
                <Plus size={13} />
                Add Store Mutation
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {bindings.map((b, idx) => (
                <StoreManipulationCard
                  key={b.id || idx}
                  index={idx}
                  totalCount={bindings.length}
                  binding={b}
                  stateStoreNodes={stateStoreNodes}
                  isEndpointConnected={isEndpointConnected}
                  connectedEndpointName={connectedEndpointName}
                  connectedEndpoint={connectedEndpoint}
                  eventRequestBody={eventRequestBody}
                  actionName={actionName}
                  onUpdateBinding={(updated) => handleUpdateManipulation(idx, updated)}
                  onRemove={() => handleRemoveManipulation(idx)}
                  onMoveUp={idx > 0 ? () => handleMoveManipulation(idx, idx - 1) : undefined}
                  onMoveDown={
                    idx < bindings.length - 1 ? () => handleMoveManipulation(idx, idx + 1) : undefined
                  }
                />
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs py-3 border-dashed border-indigo-500/30 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                onClick={handleAddManipulation}
              >
                <Plus size={13} />
                Add Another Store Mutation
              </Button>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
