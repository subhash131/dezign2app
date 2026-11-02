"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DatabaseZap,
  Server,
  Layers,
  ExternalLink,
  Key,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";

interface RedisCacheRefConfigProps {
  id: string;
  nodeId: string;
}

function RedisCacheRefConfigContent({
  id,
  nodeId,
  refNode,
}: RedisCacheRefConfigProps & { refNode: NonNullable<ReturnType<typeof useBackendCanvasStore.getState>["nodes"][0]> }) {
  const router = useRouter();
  const projectId = useBackendCanvasStore((s) => s.projectId);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const data = refNode.data || {};

  const redisInstances = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "redis_instance" ||
          (n?.type === "database" &&
            (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
      ),
    ),
  );

  const allRedisSchemas = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "redis_schema" ||
          (n?.type === "entity" && n.data?.dbType === "redis"),
      ),
    ),
  );

  const selectedSchema = allRedisSchemas.find((s) => s.id === data.schemaRef);
  const selectedInstanceId = data.databaseId || selectedSchema?.data?.databaseId;
  const selectedInstance = redisInstances.find((n) => n.id === selectedInstanceId);
  const parentInstance = nodes.find(
    (n) => n.id === (selectedSchema?.data?.databaseId || selectedInstanceId),
  );

  const filteredSchemas = useMemo(() => {
    if (!selectedInstanceId || selectedInstanceId === "__all__") return allRedisSchemas;
    const directMatches = allRedisSchemas.filter(
      (s) =>
        s.data?.databaseId === selectedInstanceId ||
        edges.some(
          (e) =>
            (e.source === selectedInstanceId && e.target === s.id) ||
            (e.target === selectedInstanceId && e.source === s.id),
        ),
    );
    return directMatches.length > 0 ? directMatches : allRedisSchemas;
  }, [allRedisSchemas, selectedInstanceId, edges]);

  const redisStructure =
    selectedSchema?.data?.redisDataStructure ||
    (selectedSchema ? "hash" : undefined);

  const keyTemplate =
    selectedSchema?.data?.keyTemplate ||
    (selectedSchema?.data?.label
      ? `${selectedSchema.data.label.toLowerCase()}:{id}`
      : undefined);

  const ttlValue =
    typeof selectedSchema?.data?.ttl === "object"
      ? `${selectedSchema.data.ttl.value}${selectedSchema.data.ttl.unit}`
      : selectedSchema?.data?.ttl
        ? `${selectedSchema.data.ttl}s`
        : undefined;

  const fields =
    selectedSchema?.data?.columns ||
    selectedSchema?.data?.hashConfig?.fields ||
    [];

  const handleJumpToSchema = () => {
    // 1. Switch store view to "schema"
    useBackendCanvasStore.getState().setView("schema");

    // 2. Navigate to schema page if projectId available
    if (projectId) {
      router.push(`/project/${projectId}?view=schema`);
    }

    // 3. Open Redis Schema / Instance config in Schema View
    if (selectedSchema) {
      setActiveConfigItem({
        id: selectedSchema.id,
        nodeId: selectedSchema.id,
        type: "redisSchema",
      });
    } else if (selectedInstance) {
      setActiveConfigItem({
        id: selectedInstance.id,
        nodeId: selectedInstance.id,
        type: "database",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-foreground">
        <div className="p-2 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 shrink-0">
          <DatabaseZap size={20} />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Redis Cache Reference</h3>
            {redisStructure && (
              <Badge variant="outline" className="text-[10px] uppercase font-mono bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                {redisStructure}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Graph reference linking services to Redis caching instances.
          </p>
        </div>
      </div>

      {/* Editable Reference Selection */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Reference Target
          </Label>
          <span className="text-[10px] text-muted-foreground font-mono">Editable</span>
        </div>

        {/* Redis Instance Selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Server size={13} className="text-red-500" />
            Redis Instance
          </Label>
          <Select
            value={selectedInstanceId || "__all__"}
            onValueChange={(val) => {
              const newInstanceId = val === "__all__" ? "" : val;
              const currentSchema = allRedisSchemas.find((s) => s.id === data.schemaRef);
              const belongsToNew =
                !newInstanceId ||
                (currentSchema &&
                  (currentSchema.data?.databaseId === newInstanceId ||
                    edges.some(
                      (e) =>
                        (e.source === newInstanceId && e.target === currentSchema.id) ||
                        (e.target === newInstanceId && e.source === currentSchema.id),
                    )));

              updateNode(nodeId, {
                data: {
                  ...data,
                  databaseId: newInstanceId || undefined,
                  schemaRef: belongsToNew ? data.schemaRef : undefined,
                  label: belongsToNew ? data.label : "Redis Cache Ref",
                },
              });
            }}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue placeholder="Select Redis Instance..." />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="__all__" className="text-xs">
                All Instances
              </SelectItem>
              {redisInstances.map((inst) => (
                <SelectItem key={inst.id} value={inst.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span>{inst.data?.label || "Redis Instance"}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Redis Schema Selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Layers size={13} className="text-red-500" />
            Target Redis Schema
          </Label>
          <Select
            value={data.schemaRef || ""}
            onValueChange={(val) => {
              const schema = allRedisSchemas.find((s) => s.id === val);
              updateNode(nodeId, {
                data: {
                  ...data,
                  schemaRef: val,
                  databaseId:
                    schema?.data?.databaseId || selectedInstanceId || data.databaseId,
                  label: schema?.data?.label || "Redis Cache Ref",
                  graphPosition: schema?.position,
                },
              });
            }}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue placeholder="Select Redis Schema..." />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {filteredSchemas.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground italic">
                  No Redis schemas found
                </div>
              ) : (
                filteredSchemas.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-medium">{s.data?.label || "Untitled Cache"}</span>
                      {s.data?.redisDataStructure && (
                        <span className="text-[10px] font-mono uppercase text-muted-foreground">
                          ({s.data.redisDataStructure})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Jump to Schema View Link Card */}
      <div className="p-4 rounded-xl bg-card border flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <ExternalLink size={13} className="text-red-500" />
              Schema View Configuration
            </span>
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              To configure Redis key templates, TTL, eviction policies, data structures, or field types, open Redis in Schema View.
            </span>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleJumpToSchema}
          variant="outline"
          className="w-full h-8 text-xs font-semibold text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center justify-center gap-2"
        >
          <span>Open Redis in Schema View</span>
          <ArrowRight size={13} />
        </Button>
      </div>

      {/* Read-Only Schema Details Preview */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Redis Schema Details (Read-Only)
          </Label>
          <Badge variant="secondary" className="text-[9px] font-mono">
            Uneditable here
          </Badge>
        </div>

        {selectedSchema ? (
          <div className="rounded-xl border bg-muted/20 p-3.5 flex flex-col gap-3">
            {/* Schema Summary */}
            <div className="flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground font-mono">
                  {selectedSchema.data?.label || "cache"}
                </span>
                {redisStructure && (
                  <Badge variant="outline" className="text-[9px] font-mono uppercase bg-background">
                    {redisStructure}
                  </Badge>
                )}
              </div>
              {parentInstance && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {parentInstance.data?.label || "Redis"}
                </span>
              )}
            </div>

            {/* Key template & TTL */}
            <div className="flex flex-col gap-2 text-xs">
              {keyTemplate && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Key size={11} className="text-red-500" /> Key Pattern:
                  </span>
                  <span className="font-mono font-medium text-foreground bg-background px-1.5 py-0.5 rounded border border-border/50 text-[11px]">
                    {keyTemplate}
                  </span>
                </div>
              )}
              {ttlValue && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock size={11} className="text-amber-500" /> Cache TTL:
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {ttlValue}
                  </span>
                </div>
              )}
            </div>

            {/* Fields List if any */}
            {fields.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1 border-t">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Fields ({fields.length})
                </span>
                <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1 pr-1">
                  {fields.map((f, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-background/60 border border-border/50 text-xs"
                    >
                      <span className="font-mono font-medium text-foreground truncate">
                        {f.name || ("fieldName" in f ? String(f.fieldName) : "field")}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {f.type || ("fieldType" in f ? String(f.fieldType) : "string")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground italic">
            Select a Redis schema above to view its key pattern and field details.
          </div>
        )}
      </div>
    </div>
  );
}

export function RedisCacheRefConfig({ id, nodeId }: RedisCacheRefConfigProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const refNode = nodes.find((n) => n.id === nodeId);
  if (!refNode) return null;

  return <RedisCacheRefConfigContent id={id} nodeId={nodeId} refNode={refNode} />;
}
