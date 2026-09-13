import React, { useState } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import {
  Server,
  Package,
  Settings,
} from "lucide-react";
import { NodePackageManager } from "./NodePackageManager";
import { NodeDependencyItem } from "@workspace/canvas";
import { toast } from "sonner";
import {
  INTER_SERVICE_PROTOCOL_OPTIONS,
  INTER_SERVICE_PROTOCOL_GRPC,
  INTER_SERVICE_PROTOCOL_HTTP,
} from "@workspace/canvas";

interface ServiceConfigProps {
  id: string;
  nodeId: string;
}

export const ServiceConfig: React.FC<ServiceConfigProps> = ({ id, nodeId }) => {
  const node = useBackendCanvasStore((s) => s.nodes.find((n) => n.id === nodeId));
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const allEndpoints = useBackendCanvasStore((s) => s.endpoints);
  const allEvents = useBackendCanvasStore((s) => s.events);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const [activeTab, setActiveTab] = useState<string>("settings");

  if (!node) return null;

  const data = node.data;

  const updateData = (changes: Partial<typeof data>) => {
    updateNode(nodeId, { data: { ...data, ...changes } });
  };

  const serviceLabel = data.label || "Service";
  const port = String(data.port || "8080");
  const grpcPort = String(data.grpcPort || "50051");
  const techStack = data.techStack || "express";
  const interServiceProtocol = data.interServiceProtocol || INTER_SERVICE_PROTOCOL_HTTP;
  const customDependencies: NodeDependencyItem[] = data.customDependencies || [];

  // Endpoints & events for this node
  const nodeEndpoints = allEndpoints.filter((ep) => ep.nodeId === nodeId);
  const nodeConsumedEvents = allEvents.filter((e) => e.nodeId === nodeId && e.variant === "consume");
  const nodePublishedEvents = allEvents.filter((e) => e.nodeId === nodeId && e.variant === "publish");

  // Determine auto-inferred dependencies based on canvas connections
  const connectedEdges = allEdges.filter((e) => e.source === nodeId || e.target === nodeId);
  const hasDbConnection = connectedEdges.some((e) => {
    const otherId = e.source === nodeId ? e.target : e.source;
    const other = allNodes.find((n) => n.id === otherId);
    return other?.type === "entity" || other?.type === "database" || other?.type === "db_ref";
  });

  const hasKafkaConnection = connectedEdges.some((e) => {
    const otherId = e.source === nodeId ? e.target : e.source;
    const other = allNodes.find((n) => n.id === otherId);
    return other?.type === "kafka" || other?.type === "pubsub" || other?.type === "queue";
  });

  const hasRedisConnection = connectedEdges.some((e) => {
    const otherId = e.source === nodeId ? e.target : e.source;
    const other = allNodes.find((n) => n.id === otherId);
    return other?.type === "redis_instance" || other?.type === "redis-cache" || other?.type === "redis-streams";
  });

  const isNextjs = techStack === "nextjs";

  const inferredDeps: { name: string; version: string; reason: string }[] = isNextjs
    ? [
        { name: "@workspace/types", version: "workspace:*", reason: "Shared API & Schema contracts" },
        { name: "@workspace/logger", version: "workspace:*", reason: "Structured logging" },
        { name: "next", version: "^16.0.0", reason: "Next.js App Router framework" },
        { name: "react", version: "^19.0.0", reason: "React runtime" },
        { name: "react-dom", version: "^19.0.0", reason: "React DOM runtime" },
        { name: "zod", version: "^3.24.2", reason: "Request/Response validation" },
      ]
    : [
        { name: "@workspace/types", version: "workspace:*", reason: "Shared API & Schema contracts" },
        { name: "@workspace/logger", version: "workspace:*", reason: "Structured logging" },
        { name: "express", version: "^4.19.2", reason: "Express microservice runtime" },
        { name: "cors", version: "^2.8.5", reason: "CORS middleware" },
        { name: "zod", version: "^3.24.2", reason: "Request/Response validation" },
        { name: "dotenv", version: "^16.4.5", reason: "Environment configuration" },
        { name: "jose", version: "^5.9.6", reason: "JWT security" },
      ];

  if (hasDbConnection) {
    inferredDeps.push({ name: "@workspace/db", version: "workspace:*", reason: "Connected to Database" });
  }
  if (hasKafkaConnection) {
    inferredDeps.push({ name: "@workspace/kafka", version: "workspace:*", reason: "Connected to Kafka / Event broker" });
  }
  if (hasRedisConnection) {
    inferredDeps.push({ name: "@workspace/redis", version: "workspace:*", reason: "Connected to Redis Cache" });
  }
  if (!isNextjs && interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC) {
    inferredDeps.push(
      { name: "@grpc/grpc-js", version: "^1.11.1", reason: "gRPC Protocol enabled" },
      { name: "@grpc/proto-loader", version: "^0.7.13", reason: "Proto file loader" }
    );
  }

  const inferredDevDeps: { name: string; version: string; reason: string }[] = isNextjs
    ? [
        { name: "@workspace/typescript-config", version: "workspace:*", reason: "Workspace TS configuration" },
        { name: "@types/node", version: "^20.11.0", reason: "Node.js types" },
        { name: "@types/react", version: "^19.0.0", reason: "React types" },
        { name: "@types/react-dom", version: "^19.0.0", reason: "React DOM types" },
        { name: "typescript", version: "^5.4.0", reason: "TypeScript compiler" },
      ]
    : [
        { name: "@workspace/typescript-config", version: "workspace:*", reason: "Workspace TS configuration" },
        { name: "@types/express", version: "^4.17.21", reason: "Express TypeScript types" },
        { name: "@types/cors", version: "^2.8.17", reason: "CORS types" },
        { name: "@types/node", version: "^20.11.0", reason: "Node.js types" },
        { name: "ts-node-dev", version: "^2.0.0", reason: "Development hot reloader" },
        { name: "typescript", version: "^5.3.3", reason: "TypeScript compiler" },
        { name: "vitest", version: "^1.6.0", reason: "Unit testing runner" },
      ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
          <Server className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            {serviceLabel}
            <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-muted text-muted-foreground border">
              {techStack.toUpperCase()}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">Microservice Node Configuration</p>
        </div>
      </div>

      {/* Tabs: Settings vs Packages */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 p-1 bg-muted/50 rounded-lg">
          <TabsTrigger value="settings" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background">
            <Settings className="w-3.5 h-3.5" />
            Overview & Settings
          </TabsTrigger>
          <TabsTrigger value="packages" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background">
            <Package className="w-3.5 h-3.5 text-primary" />
            Packages & Libraries
            {customDependencies.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/20 text-primary font-mono font-bold">
                {customDependencies.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Settings */}
        <TabsContent value="settings" className="space-y-5 pt-3">
          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs">Service Name</Label>
            <Input
              value={data.label || ""}
              onChange={(e) => {
                const val = e.target.value;
                const trimmed = val.trim();
                if (trimmed) {
                  const conflict = allNodes.find(
                    (n) =>
                      n.id !== nodeId &&
                      n.type === "service" &&
                      (n.data?.label || "").trim().toLowerCase() === trimmed.toLowerCase(),
                  );
                  if (conflict) {
                    toast.error(`Service name "${trimmed}" is already used!`);
                  }
                }
                updateData({ label: val });
              }}
              placeholder="e.g. OrdersService"
              className="text-xs font-mono"
            />
          </div>

          {/* Ports & Protocol */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">HTTP Port</Label>
              <Input
                value={port}
                onChange={(e) => updateData({ port: e.target.value })}
                placeholder="8080"
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">gRPC Port</Label>
              <Input
                value={grpcPort}
                onChange={(e) => updateData({ grpcPort: e.target.value })}
                placeholder="50051"
                className="text-xs font-mono"
              />
            </div>
          </div>

          {/* Inter-Service Protocol */}
          <div className="space-y-1.5">
            <Label className="text-xs">Inter-Service Protocol</Label>
            <Select
              value={interServiceProtocol}
              onValueChange={(val) => {
                if (val === INTER_SERVICE_PROTOCOL_HTTP || val === INTER_SERVICE_PROTOCOL_GRPC) {
                  updateData({ interServiceProtocol: val });
                }
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTER_SERVICE_PROTOCOL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CORS Configuration */}
          <div className="space-y-3 p-3.5 rounded-xl border border-border/60 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium cursor-pointer">Enable CORS</Label>
                <p className="text-[11px] text-muted-foreground">Allow cross-origin browser requests</p>
              </div>
              <Switch
                checked={Boolean(data.cors)}
                onCheckedChange={(checked) => updateData({ cors: checked })}
              />
            </div>

            {data.cors && (
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs">Allowed Origins</Label>
                <Input
                  value={data.corsOrigins || "*"}
                  onChange={(e) => updateData({ corsOrigins: e.target.value })}
                  placeholder="* or https://app.example.com"
                  className="text-xs font-mono"
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={data.description || ""}
              onChange={(e) => updateData({ description: e.target.value })}
              placeholder="Describe the responsibilities of this microservice..."
              rows={3}
              className="text-xs"
            />
          </div>

          {/* Quick Metrics Summary */}
          <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Canvas Architecture Summary
            </span>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 rounded-lg bg-muted/30 border">
                <div className="text-base font-mono font-bold text-foreground">{nodeEndpoints.length}</div>
                <div className="text-[10px] text-muted-foreground">Endpoints</div>
              </div>
              <div className="p-2 rounded-lg bg-muted/30 border">
                <div className="text-base font-mono font-bold text-foreground">{nodeConsumedEvents.length}</div>
                <div className="text-[10px] text-muted-foreground">Consumers</div>
              </div>
              <div className="p-2 rounded-lg bg-muted/30 border">
                <div className="text-base font-mono font-bold text-foreground">{nodePublishedEvents.length}</div>
                <div className="text-[10px] text-muted-foreground">Publishers</div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Packages & Libraries */}
        <TabsContent value="packages" className="pt-3">
          <NodePackageManager
            nodeId={nodeId}
            nodeType="service"
            customDependencies={customDependencies}
            onUpdateDependencies={(deps) => updateData({ customDependencies: deps })}
            inferredDependencies={inferredDeps}
            inferredDevDependencies={inferredDevDeps}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
