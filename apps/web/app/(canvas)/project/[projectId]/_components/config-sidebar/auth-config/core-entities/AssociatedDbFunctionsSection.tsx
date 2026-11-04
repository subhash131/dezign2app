import React from "react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { LocalInput } from "../LocalInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Plus,
  Trash,
  Table,
  Code2,
  AlertCircle,
  Variable,
} from "lucide-react";
import { AssociatedDbFunctionsSectionProps } from "./types";

export const AssociatedDbFunctionsSection: React.FC<
  AssociatedDbFunctionsSectionProps
> = ({
  authFunctions,
  schemaEntities,
  onAddFunctionMapping,
  onUpdateMapping,
  onRemoveMapping,
  getEntityDbOps,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/40">
        <div className="flex flex-col gap-0.5">
          <Label className="text-xs font-semibold">Associated DB Functions</Label>
          <p className="text-[11px] text-muted-foreground">
            Add variables and map them to entity tables and their associated database functions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-background shrink-0 font-medium"
          onClick={onAddFunctionMapping}
        >
          <Plus className="w-3.5 h-3.5 mr-1 text-primary" /> Add Function
        </Button>
      </div>

      {authFunctions.length > 0 ? (
        <div className="flex flex-col gap-3">
          {authFunctions.map((af, idx) => {
            const selectedEntity = schemaEntities.find(
              (e) => e.id === af.entityNodeId,
            );
            const dbOps = getEntityDbOps(af.entityNodeId);
            const matchedOp = dbOps.find(
              (op) => op.id === af.functionId || op.name === af.functionId,
            );
            const currentFunctionId = matchedOp
              ? matchedOp.id
              : af.functionId || "none";

            return (
              <div
                key={af.id || idx}
                className="flex flex-col gap-2.5 p-3 rounded-lg bg-background/80 border border-border/50 text-xs shadow-sm"
              >
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      Variable
                    </Label>
                    <LocalInput
                      placeholder="e.g. user, subscription"
                      value={af.variableName || ""}
                      onChange={(e) =>
                        onUpdateMapping(idx, { variableName: e.target.value })
                      }
                      className="h-7 text-xs font-mono bg-background"
                    />
                  </div>

                  <div className="col-span-4 flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Table className="w-3 h-3 text-primary" /> Entity
                    </Label>
                    <Select
                      value={af.entityNodeId || "none"}
                      onValueChange={(val: string) =>
                        onUpdateMapping(idx, {
                          entityNodeId: val === "none" ? "" : val,
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue placeholder="Select Table..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="none"
                          className="text-xs text-muted-foreground"
                        >
                          Select Table...
                        </SelectItem>
                        {schemaEntities.map((entity) => (
                          <SelectItem
                            key={entity.id}
                            value={entity.id}
                            className="text-xs"
                          >
                            {entity.data?.label || "Untitled Entity"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-4 flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Code2 className="w-3 h-3 text-primary" /> Associated Function
                    </Label>
                    <Select
                      value={currentFunctionId}
                      onValueChange={(val: string) =>
                        onUpdateMapping(idx, {
                          functionId: val === "none" ? "" : val,
                        })
                      }
                      disabled={!selectedEntity || dbOps.length === 0}
                    >
                      <SelectTrigger className="h-7 text-xs font-mono bg-background">
                        <SelectValue
                          placeholder={
                            !selectedEntity
                              ? "Select Table first..."
                              : dbOps.length === 0
                              ? "No functions available"
                              : "Select function..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="font-mono">
                        <SelectItem
                          value="none"
                          className="text-xs text-muted-foreground"
                        >
                          Select function...
                        </SelectItem>
                        {dbOps.map((op) => (
                          <SelectItem
                            key={op.id}
                            value={op.id}
                            className="text-xs font-mono"
                          >
                            {op.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-1 flex justify-end items-end pt-4">
                    <button
                      onClick={() => onRemoveMapping(idx)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove function mapping"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {selectedEntity && dbOps.length === 0 && (
                  <div className="flex items-center gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>
                      No database functions defined on table{" "}
                      <strong>{selectedEntity.data?.label}</strong>. Add
                      queries or CRUD ops on that Entity node.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-5 border border-dashed border-border/60 rounded-lg text-center bg-background/30 gap-2">
          <Variable className="w-5 h-5 text-muted-foreground/60" />
          <span className="text-xs font-medium text-foreground">
            No Function Mappings Added
          </span>
        </div>
      )}
    </div>
  );
};
