import { BackendNode, UIEventItem, Endpoint, Schema, StoreActionBinding } from "@/types/canvas";

export function toPascalCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "";
  if (/[\s\-_]/.test(clean)) {
    return clean
      .split(/[\s\-_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export type SourceKind = "endpoint" | "payload" | "static" | "direct";

export function isSourceKind(val: string): val is SourceKind {
  return val === "endpoint" || val === "payload" || val === "static" || val === "direct";
}

export interface TargetStateStoreSectionProps {
  nodeId: string;
  actionId: string;
  actionName: string;
  actionEvent?: string;
  storeBinding?: UIEventItem["storeActionBinding"];
  storeBindings?: UIEventItem["storeActionBindings"];
  stateStoreNodes: BackendNode[];
  isEndpointConnected: boolean;
  connectedEndpointName?: string;
  connectedEndpoint?: Endpoint;
  eventRequestBody?: Schema;
  onUpdateStoreBinding?: (binding?: UIEventItem["storeActionBinding"]) => void;
  onUpdateStoreBindings?: (bindings: StoreActionBinding[]) => void;
}
