import { useMemo, useCallback } from "react";
import { BackendNode, BackendEdge, AnyMessagingResource } from "@/types/canvas";
import { Endpoint, PipelineStep } from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toFolderName } from "@/lib/compiler/utils";

interface UseWebPageUploadsParams {
  nodeId: string;
  data: BackendNode["data"];
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  allEndpoints: (Endpoint & { nodeId?: string })[];
  updateData: (changes: Partial<BackendNode["data"]>) => void;
}

export const DEFAULT_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function useWebPageUploads({
  nodeId,
  data,
  allNodes,
  allEdges,
  allEndpoints,
  updateData,
}: UseWebPageUploadsParams) {
  const addEndpoint = useBackendCanvasStore((s) => s.addEndpoint);

  // 1. All storage nodes on canvas
  const allStorageNodes = useMemo(
    () => allNodes.filter((n) => n.type === "storage"),
    [allNodes],
  );

  // 2. Discover connected or default storage node
  const connectedStorageNode = useMemo(() => {
    // A. Explicitly configured storage node
    if (data.connectedStorageNodeId) {
      const explicit = allStorageNodes.find((n) => n.id === data.connectedStorageNodeId);
      if (explicit) return explicit;
    }

    // B. Direct edge between WebPage and a Storage node
    const directEdge = allEdges.find((e) => {
      const isSource = e.source === nodeId;
      const isTarget = e.target === nodeId;
      if (!isSource && !isTarget) return false;
      const otherId = isSource ? e.target : e.source;
      return allStorageNodes.some((sn) => sn.id === otherId);
    });

    if (directEdge) {
      const targetId = directEdge.source === nodeId ? directEdge.target : directEdge.source;
      const node = allStorageNodes.find((n) => n.id === targetId);
      if (node) return node;
    }

    // B2. Connected via StorageBucketRefNode / storage_operation_ref
    const refEdge = allEdges.find((e) => {
      const isSource = e.source === nodeId;
      const isTarget = e.target === nodeId;
      if (!isSource && !isTarget) return false;
      const otherId = isSource ? e.target : e.source;
      const otherNode = allNodes.find((n) => n.id === otherId);
      return (
        otherNode &&
        (otherNode.type === "storage_operation_ref" ||
          otherNode.type === "storage_ref" ||
          otherNode.type === "bucket_ref" ||
          otherNode.type === "storage_bucket_ref" ||
          otherNode.type === "StorageBucketRefNode" ||
          otherNode.type === "StorageOperationRefNode")
      );
    });

    if (refEdge) {
      const otherId = refEdge.source === nodeId ? refEdge.target : refEdge.source;
      const refNode = allNodes.find((n) => n.id === otherId);
      const storageNodeId = refNode?.data?.storageNodeId;
      if (storageNodeId) {
        const node = allStorageNodes.find((n) => n.id === storageNodeId);
        if (node) return node;
      }
    }

    // C. Fallback: single storage node in canvas
    if (allStorageNodes.length === 1) {
      return allStorageNodes[0];
    }

    return null;
  }, [allStorageNodes, data.connectedStorageNodeId, allEdges, nodeId, allNodes]);

  // 3. Available buckets on connected storage node
  const availableBuckets = useMemo<AnyMessagingResource[]>(() => {
    return connectedStorageNode?.data?.buckets || [];
  }, [connectedStorageNode]);

  // 4. Selected bucket
  const selectedBucket = useMemo(() => {
    if (!availableBuckets.length) return null;
    if (data.uploadBucketId) {
      const match = availableBuckets.find(
        (b) => b.id === data.uploadBucketId || b.name === data.uploadBucketId,
      );
      if (match) return match;
    }

    // Check if connected ref node specifies a bucket
    const refEdge = allEdges.find((e) => {
      const isSource = e.source === nodeId;
      const isTarget = e.target === nodeId;
      if (!isSource && !isTarget) return false;
      const otherId = isSource ? e.target : e.source;
      const otherNode = allNodes.find((n) => n.id === otherId);
      return (
        otherNode &&
        (otherNode.type === "storage_operation_ref" ||
          otherNode.type === "storage_ref" ||
          otherNode.type === "bucket_ref" ||
          otherNode.type === "storage_bucket_ref" ||
          otherNode.type === "StorageBucketRefNode" ||
          otherNode.type === "StorageOperationRefNode")
      );
    });

    if (refEdge) {
      const otherId = refEdge.source === nodeId ? refEdge.target : refEdge.source;
      const refNode = allNodes.find((n) => n.id === otherId);
      const refBucket = refNode?.data?.bucketId || refNode?.data?.bucketName;
      if (refBucket) {
        const match = availableBuckets.find(
          (b) => b.id === refBucket || b.name === refBucket,
        );
        if (match) return match;
      }
    }

    return availableBuckets[0] || null;
  }, [availableBuckets, data.uploadBucketId, allEdges, nodeId, allNodes]);

  // 5. Upload configuration settings
  const acceptedMimeTypes: string[] = useMemo(() => {
    if (Array.isArray(data.uploadAcceptedMimeTypes) && data.uploadAcceptedMimeTypes.length > 0) {
      return data.uploadAcceptedMimeTypes;
    }
    return DEFAULT_ACCEPTED_MIME_TYPES;
  }, [data.uploadAcceptedMimeTypes]);

  const maxFileSizeMb = data.uploadMaxFileSizeMb ?? 10;
  const previewMode = data.uploadPreviewMode || "thumbnail";
  const autoGeneratePresignEndpoint = Boolean(data.autoGeneratePresignEndpoint);

  // 6. Find existing presign endpoint (if configured or matching route)
  const presignEndpoint = useMemo(() => {
    if (data.presignEndpointId) {
      const matched = allEndpoints.find((e) => e.id === data.presignEndpointId);
      if (matched) return matched;
    }

    // Search for endpoint with presign upload step or route name
    return allEndpoints.find((ep) => {
      const hasPresignStep = (ep.pipelineSteps || []).some(
        (s: PipelineStep) =>
          s.type === "storage_operation" &&
          ((s.operationId && s.operationId.toLowerCase().includes("presign")) ||
            (s.functionRef?.name && s.functionRef.name.toLowerCase().includes("presign"))),
      );
      if (hasPresignStep) return true;

      const normName = (ep.name || "").toLowerCase();
      return (
        normName.includes("upload/presign") ||
        normName.includes("presign-upload") ||
        (normName.includes("presign") && normName.includes("upload"))
      );
    }) || null;
  }, [allEndpoints, data.presignEndpointId]);

  // 7. Handlers
  const handleSelectStorageNode = useCallback(
    (storageNodeId: string) => {
      const node = allStorageNodes.find((n) => n.id === storageNodeId);
      const firstBucket = node?.data?.buckets?.[0];
      updateData({
        connectedStorageNodeId: storageNodeId,
        uploadBucketId: firstBucket?.name || firstBucket?.id || undefined,
      });
    },
    [allStorageNodes, updateData],
  );

  const handleSelectBucket = useCallback(
    (bucketId: string) => {
      updateData({ uploadBucketId: bucketId });
    },
    [updateData],
  );

  const handleToggleMimeType = useCallback(
    (mime: string) => {
      const current = [...acceptedMimeTypes];
      const index = current.indexOf(mime);
      if (index >= 0) {
        if (current.length > 1) {
          current.splice(index, 1);
        }
      } else {
        current.push(mime);
      }
      updateData({ uploadAcceptedMimeTypes: current });
    },
    [acceptedMimeTypes, updateData],
  );

  const handleAddCustomMimeType = useCallback(
    (customMime: string) => {
      const trimmed = customMime.trim().toLowerCase();
      if (!trimmed || acceptedMimeTypes.includes(trimmed)) return;
      updateData({ uploadAcceptedMimeTypes: [...acceptedMimeTypes, trimmed] });
    },
    [acceptedMimeTypes, updateData],
  );

  const handleRemoveMimeType = useCallback(
    (mime: string) => {
      const filtered = acceptedMimeTypes.filter((m) => m !== mime);
      updateData({
        uploadAcceptedMimeTypes: filtered.length > 0 ? filtered : DEFAULT_ACCEPTED_MIME_TYPES,
      });
    },
    [acceptedMimeTypes, updateData],
  );

  const handleUpdateMaxFileSizeMb = useCallback(
    (mb: number) => {
      updateData({ uploadMaxFileSizeMb: Math.max(1, Math.min(500, mb)) });
    },
    [updateData],
  );

  const handleUpdatePreviewMode = useCallback(
    (mode: "thumbnail" | "none") => {
      updateData({ uploadPreviewMode: mode });
    },
    [updateData],
  );

  // 8. Auto-provision presign endpoint on a service node
  const handleProvisionPresignEndpoint = useCallback(() => {
    // Find target service node: connected service, or first service on canvas
    const serviceNodes = allNodes.filter((n) => n.type === "service");
    const targetService =
      serviceNodes.find((s) =>
        allEdges.some(
          (e) =>
            (e.source === nodeId && e.target === s.id) ||
            (e.target === nodeId && e.source === s.id),
        ),
      ) || serviceNodes[0];

    if (!targetService) return null;

    const targetStorage = connectedStorageNode || allStorageNodes[0];
    const targetBucketName = selectedBucket?.name || "media-uploads";
    const packageFolder = toFolderName(targetStorage?.data?.label || "storage") || "storage";

    const endpointId = `ep-presign-${Date.now()}`;
    const newEndpoint: Endpoint = {
      id: endpointId,
      name: "/api/upload/presign",
      type: "POST",
      summary: "Generate presigned upload URL for direct cloud storage upload",
      requestBody: {
        id: `schema-presign-req-${Date.now()}`,
        fields: [
          {
            id: `field-filename-${Date.now()}`,
            name: "filename",
            type: "string",
            required: true,
            description: "File name",
          },
          {
            id: `field-contentType-${Date.now()}`,
            name: "contentType",
            type: "string",
            required: true,
            description: "MIME type",
          },
        ],
      },
      responseBody: {
        id: `schema-presign-res-${Date.now()}`,
        fields: [
          {
            id: `field-uploadUrl-${Date.now()}`,
            name: "uploadUrl",
            type: "string",
            required: true,
            description: "Presigned PUT URL",
          },
          {
            id: `field-key-${Date.now()}`,
            name: "key",
            type: "string",
            required: true,
            description: "Object storage key",
          },
          {
            id: `field-bucket-${Date.now()}`,
            name: "bucket",
            type: "string",
            required: true,
            description: "Bucket name",
          },
        ],
      },
      pipelineSteps: [
        {
          id: `step-presign-${Date.now()}`,
          name: "Generate Upload Presigned URL",
          type: "storage_operation",
          operationId: "storage-getUploadPresignedUrl",
          storageNodeId: targetStorage?.id,
          brokerNodeId: targetStorage?.id,
          bucketId: targetBucketName,
          outputVariable: "uploadUrl",
          functionRef: {
            name: "getUploadPresignedUrl",
            importPath: `@workspace/${packageFolder}/operations`,
            signature:
              "getUploadPresignedUrl(bucketName: string, key: string, options?: PresignedUrlOptions): Promise<string>",
          },
          inputBindings: [
            { argName: "bucketName", source: { kind: "inline", value: targetBucketName } },
            { argName: "key", source: { kind: "req_body", field: "filename" } },
            { argName: "options", source: { kind: "req_body", field: "contentType" } },
          ],
        },
      ],
    };

    addEndpoint(targetService.id, newEndpoint);

    updateData({
      autoGeneratePresignEndpoint: true,
      presignEndpointId: endpointId,
      connectedStorageNodeId: targetStorage?.id,
      uploadBucketId: targetBucketName,
    });

    return endpointId;
  }, [
    allNodes,
    allEdges,
    nodeId,
    connectedStorageNode,
    allStorageNodes,
    selectedBucket,
    addEndpoint,
    updateData,
  ]);

  const handleToggleAutoGenerate = useCallback(
    (enabled: boolean) => {
      if (enabled && !presignEndpoint) {
        handleProvisionPresignEndpoint();
      } else {
        updateData({ autoGeneratePresignEndpoint: enabled });
      }
    },
    [presignEndpoint, handleProvisionPresignEndpoint, updateData],
  );

  // 9. Client-side React upload snippet
  const endpointPath = presignEndpoint?.name || "/api/upload/presign";
  const clientUploadSnippet = useMemo(() => {
    return `// ── Direct S3/R2 Image Upload with Presigned URL ──
async function uploadImage(file: File): Promise<{ key: string; url?: string }> {
  // 1. Request presigned PUT URL from backend
  const presignRes = await fetch("${endpointPath}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: \`\${Date.now()}-\${file.name.replace(/\\s+/g, "_")}\`,
      contentType: file.type,
    }),
  });

  if (!presignRes.ok) {
    throw new Error("Failed to obtain presigned upload URL");
  }

  const { uploadUrl, key } = await presignRes.json();

  // 2. Directly stream file binary from browser to Cloud Storage
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error("Direct storage upload failed");
  }

  // 3. Upload completed successfully! Return storage object key
  return { key, url: uploadUrl.split("?")[0] };
}`;
  }, [endpointPath]);

  return {
    allStorageNodes,
    connectedStorageNode,
    availableBuckets,
    selectedBucket,
    acceptedMimeTypes,
    maxFileSizeMb,
    previewMode,
    autoGeneratePresignEndpoint,
    presignEndpoint,
    endpointPath,
    clientUploadSnippet,
    handleSelectStorageNode,
    handleSelectBucket,
    handleToggleMimeType,
    handleAddCustomMimeType,
    handleRemoveMimeType,
    handleUpdateMaxFileSizeMb,
    handleUpdatePreviewMode,
    handleToggleAutoGenerate,
    handleProvisionPresignEndpoint,
  };
}
