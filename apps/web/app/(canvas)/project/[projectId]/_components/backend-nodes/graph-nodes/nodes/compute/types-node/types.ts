import type React from "react";
import type { CustomTypeItem } from "@workspace/canvas/types";
import type { BackendNodeData } from "@/types/canvas";

export interface TypeRowProps {
  item: CustomTypeItem;
  isConnected: boolean; // has an active outgoing edge OR extendedFrom
  incoming: boolean;
  outgoing: boolean;
  isPackageNode: boolean;
  onOpenConfig: (e: React.MouseEvent) => void;
  onExtend: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export interface TypesNodeHeaderProps {
  id: string;
  data: BackendNodeData;
  name: string;
  setName: (name: string) => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  isPackageNode: boolean;
  hasInstallError: boolean;
  isRefreshing: boolean;
  totalCount: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onDeleteNode: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  onAddType: (e: React.MouseEvent) => void;
  onOpenConfig: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export interface TypesNodeInstallBannerProps {
  packageName?: string;
  installError?: string;
  isRefreshing: boolean;
  onRefresh: (e: React.MouseEvent) => void;
}

export interface TypesNodeEntityWarningBannerProps {
  sourceEntityName: string;
  sourceEntityId?: string;
  affectedNodes: { id: string; name: string; type: string }[];
  updatedAt?: number;
  onViewEntity?: () => void;
  onDismiss?: () => void;
}

export interface TypesNodeListProps {
  nodeId: string;
  isPackageNode: boolean;
  connectedTypes: CustomTypeItem[];
  restTypes: CustomTypeItem[];
  totalCount: number;
  shouldCollapse: boolean;
  isListCollapsed: boolean;
  setIsListCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  hasIncomingEdge: (typeId: string) => boolean;
  hasOutgoingEdge: (typeId: string) => boolean;
  onOpenConfigForType: (typeId: string, e: React.MouseEvent) => void;
  onExtendType: (typeId: string) => void;
  onDeleteType: (typeId: string, e: React.MouseEvent) => void;
  onAddType: (e: React.MouseEvent) => void;
}
