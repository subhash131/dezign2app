import React, { useState, useEffect } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Server, ChevronDown, Settings, AlertTriangle, AlertCircle } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import {
  NodeHeader,
  EndpointList,
  MessagingResourceList,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
  generateId,
} from "../../common";
import { Textarea } from "@workspace/ui/components/textarea";
import { toast } from "sonner";
import {
  INTER_SERVICE_PROTOCOL_OPTIONS,
  DEFAULT_INTER_SERVICE_PROTOCOL,
  INTER_SERVICE_PROTOCOL_GRPC,
  INTER_SERVICE_PROTOCOL_HTTP,
} from "@workspace/canvas";
import { NodeEnvVarsSection } from "../ai-security/ExternalEnvVarsDrawer";



export const ServiceNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addEndpoint = useBackendCanvasStore((s) => s.addEndpoint);
  const addEvent = useBackendCanvasStore((s) => s.addEvent);
  const updateEvent = useBackendCanvasStore((s) => s.updateEvent);
  const deleteEvent = useBackendCanvasStore((s) => s.deleteEvent);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const allEndpoints = useBackendCanvasStore((s) => s.endpoints);
  const endpointPubEventIds = new Set(
    allEndpoints.flatMap((ep) => ep.publishedEvents?.map((pe) => pe.id) || []),
  );

  const consumedEvents = useBackendCanvasStore((s) => s.events).filter(
    (e) => e.nodeId === id && e.variant === "consume",
  );
  const publishedEvents = useBackendCanvasStore((s) => s.events).filter(
    (e) =>
      e.nodeId === id &&
      e.variant === "publish" &&
      !endpointPubEventIds.has(e.id),
  );

  const hasInitializedEndpointsRef = React.useRef(false);

  useEffect(() => {
    if (hasInitializedEndpointsRef.current) return;
    hasInitializedEndpointsRef.current = true;
    const existing = useBackendCanvasStore
      .getState()
      .endpoints.filter((e) => e.nodeId === id);
    if (existing.length === 0) {
      addEndpoint(id, {
        id: generateId(),
        name: "/",
        type: "GET",
        summary: "Health check",
        businessLogic: "Test the health of the server",
      });
    }
  }, [id, addEndpoint]);

  const [configOpen, setConfigOpen] = useState(false);

  const currentPort = String(data.port ?? "").trim() || "8080";
  const conflictNode = nodes.find(
    (n) =>
      n?.id !== id &&
      n?.type === "service" &&
      (String(n.data?.port ?? "").trim() || "8080") === currentPort,
  );
  const isPortOccupied = Boolean(conflictNode);

  const currentGrpcPort = String(data.grpcPort ?? "").trim() || "50051";
  const grpcConflictNode = nodes.find(
    (n) =>
      n?.id !== id &&
      n?.type === "service" &&
      (String(n.data?.grpcPort ?? "").trim() || "50051") === currentGrpcPort,
  );
  const isGrpcPortOccupied = Boolean(grpcConflictNode);

  // When an error exists, ensure configOpen is set to true so panel doesn't close when typing
  useEffect(() => {
    if (isPortOccupied || isGrpcPortOccupied) {
      setConfigOpen(true);
    }
  }, [isPortOccupied, isGrpcPortOccupied]);

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const trimmedVal = val.trim();
    if (trimmedVal) {
      const occupiedByNode = nodes.find(
        (n) =>
          n?.id !== id &&
          n?.type === "service" &&
          (String(n.data?.port ?? "").trim() || "8080") === trimmedVal,
      );
      if (occupiedByNode) {
        toast.error(
          `Port ${trimmedVal} is already occupied by ${occupiedByNode.data?.label || "another service"}!`,
        );
      }
    }
    updateNode(id, { data: { ...data, port: val } });
  };

  const handleGrpcPortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const trimmedVal = val.trim();
    if (trimmedVal) {
      const occupiedByNode = nodes.find(
        (n) =>
          n?.id !== id &&
          n?.type === "service" &&
          (String(n.data?.grpcPort ?? "").trim() || "50051") === trimmedVal,
      );
      if (occupiedByNode) {
        toast.error(
          `gRPC Port ${trimmedVal} is already occupied by ${occupiedByNode.data?.label || "another service"}!`,
        );
      }
    }
    updateNode(id, { data: { ...data, grpcPort: val } });
  };

  const isConfigExpanded = configOpen || isPortOccupied || isGrpcPortOccupied;


  const hasPipelineError = useNodePipelineError(id);

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[300px] max-w-[400px] flex flex-col transition-all duration-300 relative group",
        hasPipelineError
          ? cn(
              "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
              selected && "ring-2 ring-destructive/60 border-destructive",
            )
          : borderClass,
      )}
    >
      {/* Types Reference Target Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="types-in"
        className="w-2.5 h-2.5 !bg-indigo-400 rounded-full border-2 border-background -left-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ top: "24px" }}
        title="Package Types / Custom Types Reference"
      />
      <NodeHeader
        id={id}
        data={data}
        nodeType="service"
        icon={Server}
        title="Service / API"
        colorClass="bg-blue-500/10 text-blue-700 dark:text-blue-400"
        selected={selected}
        badges={
          hasPipelineError ? (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 text-[9px] font-semibold shrink-0"
              title="Pipeline has unmapped required inputs! Check endpoints."
            >
              <AlertTriangle size={10} className="shrink-0" />
              <span>Pipeline Error</span>
            </div>
          ) : undefined
        }
        rightElement={
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                useBackendCanvasStore.getState().setActiveConfigItem({
                  type: "service",
                  id,
                  nodeId: id,
                });
              }}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center text-[10px]"
              title="Configure Service Settings & Packages"
            >
              <Settings size={13} />
            </button>
          </div>
        }
      />

      {/* Pipeline unmapped error banner */}
      {hasPipelineError && (
        <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/25 flex items-center gap-1.5 text-[10px] text-destructive font-medium leading-tight nodrag">
          <AlertCircle size={12} className="shrink-0 text-destructive animate-pulse" />
          <span>Required pipeline field(s) not mapped</span>
        </div>
      )}

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>
      <EndpointList nodeId={id} title="Endpoints / Routes" />

      <MessagingResourceList
        nodeId={id}
        title="Consume Events (Listeners)"
        items={consumedEvents}
        variant="consume"
        resourceType="topics"
        onAdd={(item) => addEvent(id, "consume", item)}
        onUpdate={(eventId, name) => updateEvent(eventId, { name })}
        onDelete={(eventId) => deleteEvent(eventId)}
        onUpdateItem={(eventId, changes) => updateEvent(eventId, changes)}
      />

      <MessagingResourceList
        nodeId={id}
        title="Publish Events (Background)"
        items={publishedEvents}
        variant="publish"
        resourceType="topics"
        onAdd={(item) => addEvent(id, "publish", item)}
        onUpdate={(eventId, name) => updateEvent(eventId, { name })}
        onDelete={(eventId) => deleteEvent(eventId)}
        onUpdateItem={(eventId, changes) => updateEvent(eventId, changes)}
      />

      {/* Environment Variables (.env) Section */}
      <NodeEnvVarsSection nodeId={id} />

      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
        <div
          className={cn(
            "flex items-center justify-between group",
            isPortOccupied ? "cursor-not-allowed" : "cursor-pointer",
          )}
          onClick={() => {
            if (isPortOccupied) {
              toast.error(
                "Cannot collapse Server Config while there is a port conflict!",
              );
              return;
            }
            setConfigOpen(!configOpen);
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-colors",
                isPortOccupied
                  ? "text-destructive"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              Server Config
            </span>
            {isPortOccupied && (
              <span className="text-[9px] bg-destructive/10 text-destructive font-semibold px-1.5 py-0.5 rounded">
                Error
              </span>
            )}
          </div>
          <div
            className={cn(
              "p-0.5 rounded transition-all",
              isPortOccupied
                ? "text-destructive"
                : "hover:bg-secondary text-muted-foreground group-hover:text-foreground",
            )}
          >
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform duration-300 ease-in-out",
                isConfigExpanded && "rotate-180",
              )}
            />
          </div>
        </div>

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
            isConfigExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`cors-${id}`} className="text-xs">
                    Enable CORS
                  </Label>
                  <Switch
                    id={`cors-${id}`}
                    className="nodrag"
                    checked={data.cors || false}
                    onCheckedChange={(val) =>
                      updateNode(id, { data: { ...data, cors: val } })
                    }
                  />
                </div>
                {data.cors && (
                  <Input
                    className="h-6 text-xs bg-background"
                    placeholder="Allowed Origins (e.g. *, https://domain.com)"
                    value={data.corsOrigins || ""}
                    onChange={(e) =>
                      updateNode(id, {
                        data: { ...data, corsOrigins: e.target.value },
                      })
                    }
                  />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs shrink-0 text-muted-foreground">
                    HTTP Port
                  </Label>
                  <Input
                    className={cn(
                      "h-6 text-xs w-24 text-right bg-background nodrag",
                      isPortOccupied &&
                        "border-destructive text-destructive focus-visible:ring-destructive focus-visible:ring-1",
                    )}
                    placeholder="8080"
                    value={data.port || ""}
                    onChange={handlePortChange}
                  />
                </div>
                {isPortOccupied && (
                  <span className="text-[10px] text-destructive text-right font-medium">
                    HTTP Port {currentPort} is already in use by{" "}
                    {conflictNode?.data?.label || "another service"}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs shrink-0 text-muted-foreground">
                  Rate Limit
                </Label>
                <Input
                  className="h-6 text-xs w-24 text-right bg-background"
                  placeholder="100/m"
                  value={data.rateLimit || ""}
                  onChange={(e) =>
                    updateNode(id, {
                      data: { ...data, rateLimit: e.target.value },
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`grpc-${id}`} className="text-xs">
                    Enable gRPC Inter-Service
                  </Label>
                  <Switch
                    id={`grpc-${id}`}
                    className="nodrag"
                    checked={data.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC}
                    onCheckedChange={(enabled) =>
                      updateNode(id, {
                        data: {
                          ...data,
                          interServiceProtocol: enabled
                            ? INTER_SERVICE_PROTOCOL_GRPC
                            : INTER_SERVICE_PROTOCOL_HTTP,
                        },
                      })
                    }
                  />
                </div>
                {data.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC && (
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs shrink-0 text-muted-foreground">
                        gRPC Port
                      </Label>
                      <Input
                        className={cn(
                          "h-6 text-xs w-24 text-right bg-background nodrag",
                          isGrpcPortOccupied &&
                            "border-destructive text-destructive focus-visible:ring-destructive focus-visible:ring-1",
                        )}
                        placeholder="50051"
                        value={data.grpcPort || ""}
                        onChange={handleGrpcPortChange}
                      />
                    </div>
                    {isGrpcPortOccupied && (
                      <span className="text-[10px] text-destructive text-right font-medium">
                        gRPC Port {currentGrpcPort} is already in use by{" "}
                        {grpcConflictNode?.data?.label || "another service"}
                      </span>
                    )}
                  </div>
                )}
              </div>


            </div>
          </div>
        </div>
      </div>
    </div>

  );
};
