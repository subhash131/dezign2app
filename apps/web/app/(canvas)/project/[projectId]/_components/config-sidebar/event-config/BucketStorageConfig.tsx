import React from "react";
import { AnyMessagingResource } from "@/types/canvas";
import { ConfigItemData } from "./types";
import { Database } from "lucide-react";
import { Switch } from "@workspace/ui/components/switch";
import {
  BucketStatusBar,
  BucketTierSection,
  AccessPolicySection,
  CorsConfigSection,
  ObjectConstraintsSection,
  CdnConfigSection,
  BucketOperationsSection,
  EventNotificationsSection,
  SecurityLifecycleSection,
  StoragePreviewSection,
} from "./bucket-storage";
import { SchemaEditor } from "../../backend-nodes/graph-nodes/Editors";

export interface BucketStorageConfigProps {
  item: ConfigItemData;
  handleUpdate: (eventId: string, changes: Partial<AnyMessagingResource>) => void;
}

export const BucketStorageConfig: React.FC<BucketStorageConfigProps> = ({
  item,
  handleUpdate,
}) => {
  const isMetadataEnabled =
    item.enableMetadata !== undefined
      ? Boolean(item.enableMetadata)
      : Boolean(
          item.payloadSchema &&
            ((item.payloadSchema.fields && item.payloadSchema.fields.length > 0) ||
              item.payloadSchema.rawJson),
        );

  return (
    <div className="flex flex-col gap-5 mt-2 mb-4 text-xs hide-scrollbar">
      {/* ─── Status & Quick Capability Bar ─── */}
      <BucketStatusBar item={item} />

      {/* ─── 1. Object Custom Metadata Schema ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm border-amber-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-amber-500 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Object Metadata Schema
            </span>
          </div>
          <Switch
            id="enable-metadata-switch"
            checked={isMetadataEnabled}
            onCheckedChange={(checked) => {
              handleUpdate(item.id, { enableMetadata: checked });
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Defines custom key-value metadata attributes (e.g. <code>userId</code>, <code>tags</code>, <code>originalFileName</code>) attached to files stored in this bucket.
        </p>
        {isMetadataEnabled && (
          <div className="pt-1">
            <SchemaEditor
              title="Custom Metadata Fields"
              schema={item.payloadSchema}
              onChange={(payloadSchema) => {
                handleUpdate(item.id, { payloadSchema });
              }}
            />
          </div>
        )}
      </div>

      {/* ─── 2. Storage Tier & Host Node ─── */}
      <BucketTierSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 3. Connectability & Access Policy (Core) ─── */}
      <AccessPolicySection item={item} handleUpdate={handleUpdate} />

      {/* ─── 4. CORS & Web Client Ingress ─── */}
      <CorsConfigSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 5. Object Types & Size Limits ─── */}
      <ObjectConstraintsSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 6. CDN & Edge Delivery ─── */}
      <CdnConfigSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 7. Bucket Operations (Scoped to this Bucket) ─── */}
      <BucketOperationsSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 8. Event Notifications & Downstream Connectability ─── */}
      <EventNotificationsSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 9. Security & Lifecycle Rules ─── */}
      <SecurityLifecycleSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 10. Complete Configuration Preview (Live Summary) ─── */}
      <StoragePreviewSection item={item} />
    </div>
  );
};

export * from "./bucket-storage";
