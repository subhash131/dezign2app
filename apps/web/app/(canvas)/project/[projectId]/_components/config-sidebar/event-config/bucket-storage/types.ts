import { AnyMessagingResource } from "@/types/canvas";
import { ConfigItemData } from "../types";

export interface BucketStorageSectionProps {
  item: ConfigItemData;
  handleUpdate: (eventId: string, changes: Partial<AnyMessagingResource>) => void;
}

export interface StorageProviderOption {
  readonly value: string;
  readonly label: string;
  readonly icon: string;
}

export interface StorageClassOption {
  readonly value: string;
  readonly label: string;
}

export interface AccessPolicyOption {
  readonly value: string;
  readonly label: string;
  readonly desc: string;
}

export interface OperationOption {
  readonly key: string;
  readonly label: string;
  readonly desc: string;
}

export interface PresetExpirationOption {
  readonly label: string;
  readonly value: string;
}

export interface EventTriggerOption {
  readonly key: string;
  readonly label: string;
  readonly desc: string;
}

export type PreviewTab = "code" | "spec" | "env";
