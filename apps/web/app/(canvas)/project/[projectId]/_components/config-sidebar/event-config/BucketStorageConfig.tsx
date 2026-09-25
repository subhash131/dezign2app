import React from "react";
import { AnyMessagingResource } from "@/types/canvas";
import { ConfigItemData } from "./types";
import {
  BucketStatusBar,
  StorageProviderSection,
  AccessPolicySection,
  CorsConfigSection,
  ObjectConstraintsSection,
  EventNotificationsSection,
  CdnConfigSection,
  SecurityLifecycleSection,
  StoragePreviewSection,
} from "./bucket-storage";

export interface BucketStorageConfigProps {
  item: ConfigItemData;
  handleUpdate: (eventId: string, changes: Partial<AnyMessagingResource>) => void;
}

export const BucketStorageConfig: React.FC<BucketStorageConfigProps> = ({
  item,
  handleUpdate,
}) => {
  return (
    <div className="flex flex-col gap-5 mt-2 mb-4 text-xs">
      {/* ─── Status & Quick Capability Bar ─── */}
      <BucketStatusBar item={item} />

      {/* ─── 1. Storage Provider & Tier ─── */}
      <StorageProviderSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 2. Connectability & Access Policy (Core) ─── */}
      <AccessPolicySection item={item} handleUpdate={handleUpdate} />

      {/* ─── 3. CORS & Web Ingress ─── */}
      <CorsConfigSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 4. Object Constraints & Data Types ─── */}
      <ObjectConstraintsSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 5. Event Notifications & Downstream Connectability ─── */}
      <EventNotificationsSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 6. CDN & Edge Delivery ─── */}
      <CdnConfigSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 7. Security & Lifecycle Rules ─── */}
      <SecurityLifecycleSection item={item} handleUpdate={handleUpdate} />

      {/* ─── 8. Complete Configuration Preview (Live Summary) ─── */}
      <StoragePreviewSection item={item} />
    </div>
  );
};

export * from "./bucket-storage";
