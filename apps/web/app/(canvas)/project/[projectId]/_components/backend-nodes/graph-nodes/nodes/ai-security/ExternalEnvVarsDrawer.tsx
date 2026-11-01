"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Eye, EyeOff, Check, Settings, ChevronDown } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useUpdateNodeInternals } from "@xyflow/react";
import {
  cleanEnvVarName,
  saveLocalEnvVariable,
  getLocalEnvVariable,
  fetchLocalEnvVariable,
  deleteLocalEnvVariable,
} from "@/lib/utils/localEnvSync";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { BackendNode, FrontendActionStepDraft } from "@/types/canvas";
import type { EnvVarTemplate } from "@workspace/canvas";
import { generateId } from "../../common";
import { toast } from "sonner";
import { getDefaultNodeEnvVars } from "@workspace/canvas";
import { toEnvVarName, toServiceBaseUrlEnvName } from "@/lib/compiler/utils";

export interface ExternalEnvVarsDrawerProps {
  nodeId: string;
  projectId?: string;
  defaultOpen?: boolean;
  className?: string;
}

export function getFallbackEnvVarValue(node: BackendNode | null | undefined, varName: string): string {
  if (!node || !node.data || !varName) return "";
  const name = cleanEnvVarName(varName);

  if (node.type === "database") {
    const directKey = cleanEnvVarName(node.data.connectionStringEnv || "DATABASE_URL");
    const pooledKey = cleanEnvVarName(node.data.connectionStringPooledEnv || "DATABASE_URL_POOLED");
    const fileKey = cleanEnvVarName(node.data.dbFilePathEnv || "DB_FILE_PATH");

    if (name === directKey || name === "DATABASE_URL") {
      return node.data.connectionString || "";
    }
    if (name === pooledKey || name === "DATABASE_URL_POOLED") {
      return node.data.connectionStringPooled || "";
    }
    if (name === fileKey || name === "DB_FILE_PATH") {
      return node.data.dbFilePath || "";
    }
  }

  if (node.type === "storage") {
    const accessKeyEnv = cleanEnvVarName(node.data.accessKeyIdEnv || "AWS_ACCESS_KEY_ID");
    const secretKeyEnv = cleanEnvVarName(node.data.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY");
    if (name === accessKeyEnv) return node.data.accessKeyId || "";
    if (name === secretKeyEnv) return node.data.secretAccessKey || "";
    if (name === "AWS_REGION") return node.data.defaultRegion || "";
    if (name === "S3_ENDPOINT_URL") return node.data.endpointUrl || "";
  }

  if (node.type === "external") {
    const apiKeyEnv = cleanEnvVarName(node.data.apiKeyEnv || "API_KEY");
    if (name === apiKeyEnv || name === "API_KEY") return node.data.apiKey || "";
  }

  if (node.type === "webApp") {
    if (name === "PORT") return String(node.data.port || "3000");
    if (name === "NEXT_PUBLIC_APP_URL") return `http://localhost:${node.data.port || 3000}`;
    if (name.endsWith("_BASE_URL")) {
      const cleanPrefix = name
        .replace(/^NEXT_PUBLIC_/, "")
        .replace(/_BASE_URL$/, "")
        .replace(/_SERVICE$/, "");
      try {
        const allNodes = useBackendCanvasStore.getState().nodes;
        const matchedService = allNodes.find((n) => {
          if (n.type !== "service" && n.type !== "serverless" && n.type !== "langgraph") return false;
          const sLabel = (n.data?.label || n.id || "").trim();
          const p = toEnvVarName(sLabel).replace(/_SERVICE$/, "");
          return p === cleanPrefix;
        });
        if (matchedService) {
          const sPort =
            matchedService.data?.port ||
            matchedService.data?.server?.port ||
            matchedService.data?.serverConfig?.port ||
            8080;
          return `http://localhost:${sPort}`;
        }
      } catch {}
    }
  }

  return "";
}

interface EnvVarRowProps {
  id: string;
  name: string;
  fallbackValue?: string;
  onSaveSecretValue?: (val: string) => void;
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
  fallbackValue,
  onSaveSecretValue,
  projectId,
  isEditing,
  onStartEdit,
  onSaveName,
  onCancelEdit,
  onDelete,
}) => {
  const [tempName, setTempName] = useState(name);
  const [secretVal, setSecretVal] = useState<string>(() => {
    const cached = getLocalEnvVariable(name);
    return cached || fallbackValue || "";
  });
  const [showSecret, setShowSecret] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  useEffect(() => {
    setTempName(name);
    const cached = getLocalEnvVariable(name);
    const resolved = cached || fallbackValue || "";
    setSecretVal(resolved);

    // If fallback exists (e.g. from node.data.connectionString) and wasn't cached yet,
    // persist it to local .env and localStorage
    if (fallbackValue && !cached && name) {
      saveLocalEnvVariable(name, fallbackValue, projectId).catch(() => {});
    }

    if (name) {
      fetchLocalEnvVariable(name, projectId).then((val) => {
        if (val) {
          setSecretVal(val);
        } else if (fallbackValue) {
          setSecretVal(fallbackValue);
          saveLocalEnvVariable(name, fallbackValue, projectId).catch(() => {});
        }
      });
    }
  }, [name, projectId, fallbackValue]);

  const handleSaveSecret = useCallback(
    async (val: string, varName: string = name) => {
      const targetName = varName || name;
      if (!targetName) return;
      try {
        await saveLocalEnvVariable(targetName, val, projectId);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
        if (onSaveSecretValue) {
          onSaveSecretValue(val);
        }
      } catch {
        toast.error("Failed to save to local .env");
      }
    },
    [name, projectId, onSaveSecretValue],
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
  defaultOpen = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const updateNodeInternals = useUpdateNodeInternals();
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

  useEffect(() => {
    if (typeof updateNodeInternals === "function") {
      updateNodeInternals(nodeId);
    }
  }, [isOpen, nodeId, updateNodeInternals, envVars.length]);

  // Auto-seed default env vars if this node has never had envVars defined,
  // or merge missing default env vars for webApp nodes
  useEffect(() => {
    if (node?.data) {
      const defaults = getDefaultNodeEnvVars(node.type, node.data);
      if (node.data.envVars === undefined) {
        if (defaults.length > 0) {
          updateNode(nodeId, {
            data: {
              ...node.data,
              envVars: defaults,
            },
          });
        }
      } else if (node.type === "webApp") {
        const allCanvasNodes = useBackendCanvasStore.getState().nodes;
        const allCanvasEdges = useBackendCanvasStore.getState().edges;
        const connectedServiceNodes: BackendNode[] = [];
        const seenSrvIds = new Set<string>();

        allCanvasEdges.forEach((e) => {
          if (e.source === nodeId || e.target === nodeId) {
            const otherId = e.source === nodeId ? e.target : e.source;
            const other = allCanvasNodes.find((n) => n.id === otherId);
            if (other && (other.type === "service" || other.type === "serverless" || other.type === "langgraph") && !seenSrvIds.has(other.id)) {
              seenSrvIds.add(other.id);
              connectedServiceNodes.push(other);
            }
          }
        });

        const isSingleWebApp = allCanvasNodes.filter((x) => x.type === "webApp").length === 1;
        const pageIds = new Set<string>();
        allCanvasEdges.forEach((e) => {
          if (e.source === nodeId || e.target === nodeId) {
            const otherId = e.source === nodeId ? e.target : e.source;
            const other = allCanvasNodes.find((n) => n.id === otherId);
            if (other && other.type === "webPage") {
              pageIds.add(other.id);
            }
          }
        });

        allCanvasNodes.forEach((n) => {
          if (n.type === "webPage" && (pageIds.has(n.id) || (pageIds.size === 0 && isSingleWebApp))) {
            const allSteps: FrontendActionStepDraft[] = [
              ...(n.data?.sections || []).flatMap((s) => (s.actions || []).flatMap((a) => a.actionSteps || [])),
              ...(n.data?.events || []).flatMap((e) => e.actionSteps || []),
              ...(n.data?.realtimeConnections || []).flatMap((c) => c.actionSteps || []),
            ];
            allSteps.forEach((st) => {
              if (st?.type === "api_call" && st?.serviceNodeId && !seenSrvIds.has(st.serviceNodeId)) {
                const sNode = allCanvasNodes.find((x) => x.id === st.serviceNodeId);
                if (sNode) {
                  seenSrvIds.add(sNode.id);
                  connectedServiceNodes.push(sNode);
                }
              }
            });

            allCanvasEdges.forEach((e) => {
              if (e.source === n.id || e.target === n.id) {
                const oId = e.source === n.id ? e.target : e.source;
                const oNode = allCanvasNodes.find((x) => x.id === oId);
                if (oNode && (oNode.type === "service" || oNode.type === "serverless" || oNode.type === "langgraph") && !seenSrvIds.has(oNode.id)) {
                  seenSrvIds.add(oNode.id);
                  connectedServiceNodes.push(oNode);
                }
              }
            });
          }
        });

        // Clean up redundant non-public base URLs and legacy base URLs (e.g. without _SERVICE)
        const redundantBaseNames = new Set(
          connectedServiceNodes.flatMap((s) => {
            const lbl = (s.data?.label || s.id || "service").trim();
            const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(lbl);
            const rawPfx = toEnvVarName(lbl);
            const legacyPub = `NEXT_PUBLIC_${rawPfx}_BASE_URL`;
            const legacyNonPub = `${rawPfx}_BASE_URL`;
            const toRemove = [envVarName, legacyNonPub];
            if (legacyPub !== publicEnvVarName) {
              toRemove.push(legacyPub);
            }
            return toRemove;
          }),
        );

        const rawVars = node.data.envVars !== undefined ? node.data.envVars : defaults;
        const currentVars = rawVars.filter((v: { name?: string }) => !redundantBaseNames.has(v.name || ""));
        const hadRedundant = rawVars.length !== currentVars.length;
        const existingNames = new Set(currentVars.map((v: { name?: string }) => v.name || ""));
        const missingDefaults = defaults.filter((d) => !existingNames.has(d.name));

        const serviceVarsToAdd: { id: string; name: string; description?: string }[] = [];
        connectedServiceNodes.forEach((srv) => {
          const sLabel = (srv.data?.label || srv.id || "service").trim();
          const { publicEnvVarName: pubName } = toServiceBaseUrlEnvName(sLabel);

          if (!existingNames.has(pubName)) {
            serviceVarsToAdd.push({
              id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: pubName,
              description: `Public base URL for ${sLabel}`,
            });
            existingNames.add(pubName);
          }
        });

        const combinedToAdd = [...missingDefaults, ...serviceVarsToAdd];
        if (combinedToAdd.length > 0 || hadRedundant) {
          updateNode(nodeId, {
            data: {
              ...node.data,
              envVars: [...currentVars, ...combinedToAdd],
            },
          });
        }
      }
    }
  }, [nodeId, node?.type, node?.data, updateNode]);

  const handleAddVariable = useCallback(() => {
    setIsOpen(true);
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
    setIsOpen(true);
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
    <div
      id={`external-node-env-section-${nodeId}`}
      className={cn("flex flex-col", !isOpen && "rounded-b-[10px]", className)}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Section Header: Collapsible */}
      <div
        className={cn(
          "px-3 py-1 bg-secondary/40 hover:bg-secondary/60 border-t text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider flex justify-between items-center cursor-pointer select-none transition-colors group nodrag",
          isOpen ? "border-b" : "rounded-b-[10px]",
        )}
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? "Collapse Environment Variables" : "Expand Environment Variables"}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <ChevronDown
            size={12}
            className={cn(
              "text-muted-foreground group-hover:text-foreground transition-transform duration-200 shrink-0",
              !isOpen && "-rotate-90",
            )}
          />
          <span className="truncate">Environment Variables (.env)</span>
          {envVars.length > 0 && (
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-secondary text-foreground font-semibold shrink-0">
              {envVars.length}
            </span>
          )}
        </span>
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all p-0.5 rounded hover:bg-secondary shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleAddVariable();
          }}
          title="Add Environment Variable"
        >
          <Plus size={12} />
        </div>
      </div>

      {/* List of variables */}
      {isOpen && (
        <div className="flex flex-col rounded-b-[10px] overflow-hidden">
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
            envVars.map((v) => {
              const fallbackVal = getFallbackEnvVarValue(node, v.name);
              return (
                <EnvVarRow
                  key={v.id}
                  id={v.id}
                  name={v.name}
                  fallbackValue={fallbackVal}
                  onSaveSecretValue={(val) => {
                    if (node && node.data) {
                      const clean = cleanEnvVarName(v.name);
                      if (clean === "GROQ_API_KEY") {
                        try {
                          localStorage.setItem("dezign2app_lg_key_groq", val);
                        } catch {}
                      } else if (clean === "OPENAI_API_KEY") {
                        try {
                          localStorage.setItem("dezign2app_lg_key_openai", val);
                        } catch {}
                      } else if (clean === "ANTHROPIC_API_KEY") {
                        try {
                          localStorage.setItem("dezign2app_lg_key_anthropic", val);
                        } catch {}
                      } else if (clean === "GEMINI_API_KEY") {
                        try {
                          localStorage.setItem("dezign2app_lg_key_google", val);
                        } catch {}
                      }

                      // Propagate to connected service or langgraph nodes
                      const allCanvasNodes = useBackendCanvasStore.getState().nodes;
                      const allEdges = useBackendCanvasStore.getState().edges;
                      const isLg = node.type === "langgraph";
                      const isSrv = node.type === "service";
                      if (isLg || isSrv) {
                        const targetType = isLg ? "service" : "langgraph";
                        const connectedEdges = allEdges.filter(
                          (e) =>
                            (e.source === nodeId && allCanvasNodes.find((n) => n.id === e.target)?.type === targetType) ||
                            (e.target === nodeId && allCanvasNodes.find((n) => n.id === e.source)?.type === targetType),
                        );
                        for (const edge of connectedEdges) {
                          const partnerId = edge.source === nodeId ? edge.target : edge.source;
                          const partnerNode = allCanvasNodes.find((n) => n.id === partnerId);
                          if (partnerNode) {
                            const partnerVars = partnerNode.data?.envVars || [];
                            if (!partnerVars.some((pv: { name?: string }) => pv.name === clean)) {
                              updateNode(partnerNode.id, {
                                data: {
                                  ...partnerNode.data,
                                  envVars: [
                                    ...partnerVars,
                                    { id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: clean },
                                  ],
                                },
                              });
                            }
                          }
                        }
                      }

                      if (node.type === "database") {
                        const directKey = cleanEnvVarName(node.data.connectionStringEnv || "DATABASE_URL");
                        const pooledKey = cleanEnvVarName(node.data.connectionStringPooledEnv || "DATABASE_URL_POOLED");
                        const fileKey = cleanEnvVarName(node.data.dbFilePathEnv || "DB_FILE_PATH");

                        if (clean === directKey || clean === "DATABASE_URL") {
                          updateNode(nodeId, { data: { ...node.data, connectionString: val } });
                        } else if (clean === pooledKey || clean === "DATABASE_URL_POOLED") {
                          updateNode(nodeId, { data: { ...node.data, connectionStringPooled: val } });
                        } else if (clean === fileKey || clean === "DB_FILE_PATH") {
                          updateNode(nodeId, { data: { ...node.data, dbFilePath: val } });
                        }
                      }
                    }
                  }}
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
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export const NodeEnvVarsSection = ExternalEnvVarsDrawer;
export type NodeEnvVarsSectionProps = ExternalEnvVarsDrawerProps;
