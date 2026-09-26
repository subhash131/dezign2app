"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Eye, EyeOff, Check, Settings } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  cleanEnvVarName,
  saveLocalEnvVariable,
  getLocalEnvVariable,
  fetchLocalEnvVariable,
  deleteLocalEnvVariable,
} from "@/lib/utils/localEnvSync";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId } from "../../common";
import { toast } from "sonner";
import { getDefaultNodeEnvVars } from "@workspace/canvas";

interface ExternalEnvVarsDrawerProps {
  nodeId: string;
  projectId?: string;
  defaultOpen?: boolean;
}

interface EnvVarRowProps {
  id: string;
  name: string;
  projectId?: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveName: (newName: string) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

const EnvVarRow: React.FC<EnvVarRowProps> = ({
  id,
  name,
  projectId,
  isEditing,
  onStartEdit,
  onSaveName,
  onCancelEdit,
  onDelete,
}) => {
  const [tempName, setTempName] = useState(name);
  const [secretVal, setSecretVal] = useState<string>(() =>
    getLocalEnvVariable(name),
  );
  const [showSecret, setShowSecret] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  useEffect(() => {
    setTempName(name);
    const cached = getLocalEnvVariable(name);
    setSecretVal(cached);
    if (name) {
      fetchLocalEnvVariable(name, projectId).then((val) => {
        if (val) setSecretVal(val);
      });
    }
  }, [name, projectId]);

  const handleSaveSecret = useCallback(
    async (val: string, varName: string = name) => {
      const targetName = varName || name;
      if (!targetName) return;
      try {
        await saveLocalEnvVariable(targetName, val, projectId);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } catch {
        toast.error("Failed to save to local .env");
      }
    },
    [name, projectId],
  );

  const handleFinishEdit = useCallback(async () => {
    const clean = cleanEnvVarName(tempName);
    if (!clean) {
      // If name is blank, remove variable and delete from local .env
      if (name) {
        await deleteLocalEnvVariable(name, projectId);
      }
      onDelete();
    } else {
      // If renamed, clean up old variable from local .env
      if (name && name !== clean) {
        await deleteLocalEnvVariable(name, projectId);
      }
      onSaveName(clean);
      if (secretVal && secretVal !== getLocalEnvVariable(clean)) {
        await handleSaveSecret(secretVal, clean);
        toast.success(`Saved ${clean} to local .env`);
      }
    }
    setIsConfigOpen(false);
  }, [tempName, name, onSaveName, secretVal, handleSaveSecret, onDelete, projectId]);

  const handleCancel = useCallback(() => {
    if (!name.trim()) {
      onDelete();
    }
    setIsConfigOpen(false);
    onCancelEdit();
  }, [name, onDelete, onCancelEdit]);

  const isRowEditing = isEditing || isConfigOpen;

  return (
    <div
      className={cn(
        "flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/15 transition-colors px-3 py-1.5 gap-1.5 nodrag",
        isRowEditing && "bg-secondary/10",
      )}
      onBlur={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.closest('[role="combobox"]')) return;
        if (related?.closest('[role="listbox"]')) return;
        if (related?.closest("[data-radix-popper-content-wrapper]")) return;

        if (!e.currentTarget.contains(related)) {
          if (isRowEditing) {
            handleFinishEdit();
          }
        }
      }}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-secondary text-foreground border border-border font-mono">
            ENV
          </span>

          {isRowEditing ? (
            <Input
              value={tempName}
              onChange={(e) => setTempName(cleanEnvVarName(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishEdit();
                if (e.key === "Escape") handleCancel();
              }}
              className="h-6 text-xs font-mono bg-background flex-1"
              placeholder="e.g. STRIPE_SECRET_KEY"
              autoFocus
            />
          ) : (
            <span
              className="font-mono font-medium truncate text-foreground cursor-pointer hover:underline"
              onClick={onStartEdit}
              title="Click to edit variable & secret"
            >
              {name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-all shrink-0">
          <div
            className={cn(
              "p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors",
              isRowEditing && "bg-secondary text-foreground opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (isRowEditing) {
                handleFinishEdit();
              } else {
                onStartEdit();
                setIsConfigOpen(true);
              }
            }}
            title={isRowEditing ? "Done editing" : "Configure secret value (.env)"}
          >
            {isRowEditing ? (
              <Check size={13} className="text-primary" />
            ) : (
              <Settings size={13} />
            )}
          </div>
          <div
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete Variable"
          >
            <Trash2 size={13} />
          </div>
        </div>
      </div>

      {/* Secret value input: shown ONLY when the env is being edited; hidden when edit is over */}
      {isRowEditing && (
        <div className="flex items-center gap-1.5 pl-7 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="relative flex-1">
            <Input
              type={showSecret ? "text" : "password"}
              className="h-6 text-[11px] bg-background/80 font-mono pr-6"
              placeholder="Secret value (.env)"
              value={secretVal}
              onChange={(e) => setSecretVal(e.target.value)}
              onBlur={() => {
                if (secretVal !== getLocalEnvVariable(name)) {
                  handleSaveSecret(secretVal, name);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishEdit();
                if (e.key === "Escape") {
                  setIsConfigOpen(false);
                  onCancelEdit();
                }
              }}
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={showSecret ? "Hide secret" : "Show secret"}
            >
              {showSecret ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
          {isSaved && (
            <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 rounded bg-primary/10 shrink-0 flex items-center gap-0.5">
              <Check size={10} /> Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const ExternalEnvVarsDrawer: React.FC<ExternalEnvVarsDrawerProps> = ({
  nodeId,
  projectId,
}) => {
  const node = useBackendCanvasStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const envVars = node?.data?.envVars || [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const nodeLabel =
    node?.data?.label ||
    (node?.type === "webApp"
      ? "Web App"
      : node?.type === "service"
        ? "Service"
        : "External API");

  // Auto-seed default env vars if this node has never had envVars defined
  useEffect(() => {
    if (node?.data && node.data.envVars === undefined) {
      const defaults = getDefaultNodeEnvVars(node.type, node.data);
      if (defaults.length > 0) {
        updateNode(nodeId, {
          data: {
            ...node.data,
            envVars: defaults,
          },
        });
      }
    }
  }, [nodeId, node?.type, node?.data, updateNode]);

  const handleAddVariable = useCallback(() => {
    const newId = generateId();
    const updated = [...envVars, { id: newId, name: "" }];
    updateNode(nodeId, {
      data: {
        ...node?.data,
        label: nodeLabel,
        envVars: updated,
      },
    });
    setEditingId(newId);
    setEditingName("");
  }, [node, nodeId, envVars, updateNode, nodeLabel]);

  const handleLoadDefaults = useCallback(() => {
    const defaults = getDefaultNodeEnvVars(node?.type, node?.data);
    if (defaults.length > 0) {
      updateNode(nodeId, {
        data: {
          ...node?.data,
          label: nodeLabel,
          envVars: defaults,
        },
      });
    } else {
      handleAddVariable();
    }
  }, [node, nodeId, nodeLabel, updateNode, handleAddVariable]);

  const handleDeleteVariable = useCallback(
    async (varId: string) => {
      const toDelete = envVars.find((v) => v.id === varId);
      if (toDelete?.name) {
        await deleteLocalEnvVariable(toDelete.name, projectId);
      }
      const updated = envVars.filter((v) => v.id !== varId);
      updateNode(nodeId, {
        data: {
          ...node?.data,
          label: nodeLabel,
          envVars: updated,
        },
      });
      if (editingId === varId) setEditingId(null);
    },
    [node, nodeId, envVars, updateNode, editingId, nodeLabel, projectId],
  );

  const handleUpdateName = useCallback(
    (varId: string, rawName: string) => {
      const clean = cleanEnvVarName(rawName) || "API_KEY";
      const updated = envVars.map((v) =>
        v.id === varId ? { ...v, name: clean } : v,
      );
      updateNode(nodeId, {
        data: {
          ...node?.data,
          label: nodeLabel,
          envVars: updated,
        },
      });
      setEditingId(null);
    },
    [node, nodeId, envVars, updateNode, nodeLabel],
  );

  return (
    <div id={`external-node-env-section-${nodeId}`} className="flex flex-col">
      {/* Section Header: EXACTLY matches EndpointList and MessagingResourceList */}
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        <span className="flex items-center gap-1.5">
          Environment Variables (.env)
          {envVars.length > 0 && (
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-secondary text-foreground font-semibold">
              {envVars.length}
            </span>
          )}
        </span>
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all"
          onClick={handleAddVariable}
          title="Add Environment Variable"
        >
          <Plus size={12} />
        </div>
      </div>

      {/* List of variables */}
      <div className="flex flex-col">
        {envVars.length === 0 ? (
          <div className="flex items-center justify-between px-3 py-2 text-[10px] text-muted-foreground/75 bg-muted/10 border-b border-dashed border-border/60">
            <span>No env vars configured</span>
            <button
              type="button"
              onClick={handleLoadDefaults}
              className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
            >
              + Load defaults
            </button>
          </div>
        ) : (
          envVars.map((v) => (
            <EnvVarRow
              key={v.id}
              id={v.id}
              name={v.name}
              projectId={projectId}
              isEditing={editingId === v.id}
              onStartEdit={() => {
                setEditingId(v.id);
                setEditingName(v.name);
              }}
              onSaveName={(name) => handleUpdateName(v.id, name)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDeleteVariable(v.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export const NodeEnvVarsSection = ExternalEnvVarsDrawer;
export type NodeEnvVarsSectionProps = ExternalEnvVarsDrawerProps;
