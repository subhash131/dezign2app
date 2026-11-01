import { ComponentPropMappings, UIEventItem, SidebarStaticItem } from "@/types/canvas";

export interface StateStoreInfo {
  id: string;
  name: string;
  scope?: string;
  fields: Array<{ id: string; name: string; type?: string }>;
}

export interface BasePropsConfigProps {
  propMappings: ComponentPropMappings;
  onUpdatePropMapping: (changes: Partial<ComponentPropMappings>) => void;
  stateStores: StateStoreInfo[];
  stateName: string;
  displayLabel: string;
  effectiveStoreName?: string;
  effectiveStoreId?: string;
  capitalizedState?: string;
  defaultSetterName?: string;
}

export interface InputPropsConfigProps extends BasePropsConfigProps {
  stateType?: string;
  availableActions?: UIEventItem[];
  onOpenEventConfig?: (actionId: string) => void;
  onCreateAction?: (name?: string, eventType?: string) => void;
}

export interface SwitchCheckboxPropsConfigProps extends BasePropsConfigProps {
  currentComponent: "switch" | "checkbox";
}

export interface SidebarPropsConfigProps extends BasePropsConfigProps {
  onCreateNavStateVariable?: (preferredStoreId?: string) => void;
}

export interface TopbarPropsConfigProps extends BasePropsConfigProps {
  onCreateNavStateVariable?: (preferredStoreId?: string) => void;
}

export interface ChatPropsConfigProps extends BasePropsConfigProps {
  onCreateChatMessageStateVariable?: (preferredStoreId?: string) => void;
  onQuickWireChatActions?: () => void;
}

export interface SidebarStaticItemRowProps {
  item: SidebarStaticItem;
  idx: number;
  stateStores: Array<{
    id: string;
    name: string;
    fields: Array<{ id: string; name: string; type?: string }>;
  }>;
  onUpdate: (patch: Partial<SidebarStaticItem>) => void;
  onDelete: () => void;
}
