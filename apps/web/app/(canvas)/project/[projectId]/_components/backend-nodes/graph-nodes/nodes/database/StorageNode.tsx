import React, { useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { HardDrive, Settings, Upload, Download, Link2, KeyRound } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  NodeHeader,
  MessagingResourceList,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { NodeEnvVarsSection } from "../ai-security/ExternalEnvVarsDrawer";
import { Textarea } from "@workspace/ui/components/textarea";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";

const isStorageBucketRefNode = (type?: string) =>
  type === "StorageBucketRefNode" ||
  type === "storage_bucket_ref" ||
  type === "bucket_ref" ||
  type === "storage_operation_ref" ||
  type === "storage_ref" ||
  type === "StorageOperationRefNode";

export const StorageNode: React.FC<NodeProps<BackendNode>> = ({
  id,
  data,
  selected,
}) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const provider = data.storageProvider || "s3";
  const bucketCount = data.buckets?.length || 0;
  const envVarsCount = data.envVars?.length || 0;
  const hasPresignEnabled =
    bucketCount > 0 &&
    (data.buckets || []).some(
      (b) => b.enablePresignedUrls !== false || b.accessPolicy === "presigned-only",
    );

  // Draw and maintain invisible reference edges from StorageNode buckets to StorageBucketRefNode headers
  useEffect(() => {
    const buckets = data.buckets || [];
    if (buckets.length === 0) return;

    const refNodes = nodes.filter((n) => isStorageBucketRefNode(n.type));

    refNodes.forEach((refNode) => {
      const refStorageId = refNode.data?.storageNodeId;
      const refBucket =
        refNode.data?.bucketId ||
        refNode.data?.bucketName ||
        refNode.data?.label;

      const isClaimedByOtherStorage = edges.some(
        (e) =>
          (e.type === "storage-reference" || e.type === "reference") &&
          e.target === refNode.id &&
          e.source !== id,
      );

      // If ref node explicitly targets a different storage node, or is connected to another storage node
      if (refStorageId && refStorageId !== id) return;
      if (!refStorageId && isClaimedByOtherStorage) return;

      // Find matching bucket on this StorageNode
      const matchedBucket =
        buckets.find(
          (b) => b.id === refBucket || b.name === refBucket,
        ) || buckets[0];

      if (!matchedBucket) return;

      const sourceHandle = `buckets:out:${matchedBucket.id}`;
      const legacySourceHandle = `bucket:out:${matchedBucket.id}`;
      const targetHandle = "storage-ref-header";

      const hasEdge = edges.some(
        (e) =>
          (e.type === "storage-reference" || e.type === "reference") &&
          e.source === id &&
          e.target === refNode.id &&
          (e.sourceHandle === sourceHandle ||
            e.sourceHandle === legacySourceHandle ||
            !e.sourceHandle),
      );

      if (!hasEdge) {
        // Clean up stale reference edges from this storage node to this refNode targeting another bucket
        edges
          .filter(
            (e) =>
              (e.type === "storage-reference" || e.type === "reference") &&
              e.source === id &&
              e.target === refNode.id &&
              e.sourceHandle !== sourceHandle &&
              e.sourceHandle !== legacySourceHandle,
          )
          .forEach((e) => deleteEdge(e.id));

        addEdge({
          id: `edge-storage-ref-${id}-${matchedBucket.id}-${refNode.id}`,
          source: id,
          target: refNode.id,
          sourceHandle,
          targetHandle,
          type: "storage-reference",
        });
      }
    });
  }, [id, data.buckets, nodes, edges, addEdge, deleteEdge]);

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      type: "storage",
      id,
      nodeId: id,
    });
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[340px] flex flex-col relative transition-all duration-150 select-none",
        selected ? "border-amber-500 ring-1 ring-amber-500/20" : "border-border",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      <NodeHeader
        id={id}
        data={data}
        nodeType="storage"
        icon={HardDrive}
        title="Storage"
        colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-400"
        selected={selected}
        badges={
          <div className="flex items-center gap-1 flex-wrap">
            <Badge
              variant="outline"
              className="bg-background/80 text-[9px] font-mono capitalize px-1 py-0 h-4 border-amber-500/30"
            >
              {provider}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[9px] px-1 py-0 h-4 font-mono"
            >
              {bucketCount} {bucketCount === 1 ? "bucket" : "buckets"}
            </Badge>
            {bucketCount > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1 py-0 h-4 font-mono font-medium",
                  hasPresignEnabled
                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                    : "bg-muted/40 text-muted-foreground border-border/40",
                )}
                title={
                  hasPresignEnabled
                    ? "Presigned URLs enabled for direct upload & secure download"
                    : "Presigned URLs disabled"
                }
              >
                {hasPresignEnabled ? "⚡ presign on" : "presign off"}
              </Badge>
            )}
            {envVarsCount > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-4 font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-0.5"
                title={`${envVarsCount} environment variable${envVarsCount === 1 ? "" : "s"} configured`}
              >
                <KeyRound size={8} />
                {envVarsCount} env
              </Badge>
            )}
          </div>
        }
        rightElement={
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground nodrag shrink-0"
            onClick={handleOpenConfig}
            title="Configure Storage Node in Sidebar"
          >
            <Settings size={13} />
          </Button>
        }
      />

      {/* Strategy Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Describe storage strategy (e.g. S3 for user uploads and media assets)"
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Buckets List */}
      <MessagingResourceList
        nodeId={id}
        title="Buckets"
        items={data.buckets || []}
        variant="definition"
        resourceType="buckets"
        hideLeftHandle={true}
        onChange={(buckets) =>
          updateNode(id, {
            data: {
              ...data,
              buckets,
            },
          })
        }
      />

      {/* Environment Variables (.env) */}
      <NodeEnvVarsSection nodeId={id} />
    </div>
  );
};

