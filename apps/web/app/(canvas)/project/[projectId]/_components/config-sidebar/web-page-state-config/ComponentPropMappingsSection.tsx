"use client";

import React from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  StateRenderComponent,
  ComponentPropMappings,
  UIEventItem,
  BackendNode,
} from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { ComponentOption } from "./constants";
import {
  StateStoreInfo,
  InputPropsConfig,
  ButtonPropsConfig,
  CardPropsConfig,
  ProgressPropsConfig,
  AlertPropsConfig,
  AvatarPropsConfig,
  SkeletonPropsConfig,
  SwitchCheckboxPropsConfig,
  BadgePropsConfig,
  CodeTextPropsConfig,
  SidebarPropsConfig,
  ChatPropsConfig,
  TopbarPropsConfig,
} from "./prop-mappings";

export * from "./prop-mappings";

export interface ComponentPropMappingsSectionProps {
  currentComponent: StateRenderComponent;
  selectedOption: ComponentOption;
  displayLabel: string;
  stateName: string;
  stateType?: string;
  storeName?: string;
  storeId?: string;
  availableActions?: UIEventItem[];
  availableStateVars?: Array<{ name: string; type?: string; source: "store" | "local" }>;
  stateStoreNodes?: BackendNode[];
  propMappings: ComponentPropMappings;
  onUpdatePropMapping: (changes: Partial<ComponentPropMappings>) => void;
  onOpenEventConfig?: (actionId: string) => void;
  onCreateAction?: (name?: string, eventType?: string) => void;
  onCreateNavStateVariable?: (preferredStoreId?: string) => void;
  onCreateChatMessageStateVariable?: (preferredStoreId?: string) => void;
  onQuickWireChatActions?: () => void;
}

export const ComponentPropMappingsSection: React.FC<ComponentPropMappingsSectionProps> = React.memo(({
  currentComponent,
  selectedOption,
  displayLabel,
  stateName,
  stateType,
  storeName,
  storeId,
  availableActions = [],
  availableStateVars = [],
  stateStoreNodes,
  propMappings: rawPropMappings,
  onUpdatePropMapping: rawOnUpdatePropMapping,
  onOpenEventConfig,
  onCreateAction,
  onCreateNavStateVariable,
  onCreateChatMessageStateVariable,
  onQuickWireChatActions,
}) => {
  // Local optimistic state for prop mappings so all switches, selectors and inputs react instantaneously with 0ms lag
  const [optimisticProps, setOptimisticProps] = React.useState<ComponentPropMappings>(rawPropMappings);

  React.useEffect(() => {
    setOptimisticProps(rawPropMappings);
  }, [rawPropMappings]);

  // Combined current properties: optimistic changes take immediate visual effect
  const propMappings = React.useMemo(() => ({
    ...rawPropMappings,
    ...optimisticProps,
  }), [rawPropMappings, optimisticProps]);

  const onUpdatePropMapping = React.useCallback(
    (changes: Partial<ComponentPropMappings>) => {
      // 1. Immediately apply optimistic change locally (0ms instantaneous visual feedback)
      setOptimisticProps((prev) => ({
        ...prev,
        ...changes,
      }));
      // 2. Dispatch to backend canvas store
      rawOnUpdatePropMapping(changes);
    },
    [rawOnUpdatePropMapping],
  );

  const effectiveStoreName = propMappings.valueStoreName || storeName;
  const effectiveStoreId = propMappings.valueStoreId || storeId;

  const capitalizedState = stateName
    ? stateName.charAt(0).toUpperCase() + stateName.slice(1)
    : "State";
  const activeBoundVar = propMappings.valueBinding || stateName;
  const capitalizedBoundVar = activeBoundVar
    ? activeBoundVar.charAt(0).toUpperCase() + activeBoundVar.slice(1)
    : capitalizedState;
  const defaultSetterName = `set${capitalizedBoundVar}`;

  // Canvas state store nodes (fallback to backend canvas store if not provided in props)
  const canvasStoreNodes = useBackendCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "state_store")),
  );
  const actualStoreNodes = stateStoreNodes && stateStoreNodes.length > 0 ? stateStoreNodes : canvasStoreNodes;

  const stateStores: StateStoreInfo[] = React.useMemo(() => {
    const list: StateStoreInfo[] = [];

    (actualStoreNodes || []).forEach((n) => {
      const sName = n.data?.storeName || n.data?.label || "Store";
      const fields = (n.data?.fields || []).map((f: { id: string; name: string; type?: string }) => ({
        id: f.id,
        name: f.name,
        type: f.type,
      }));
      list.push({
        id: n.id,
        name: sName,
        scope: n.data?.scope,
        fields,
      });
    });

    if (storeId && storeName && !list.some((s) => s.id === storeId)) {
      list.push({
        id: storeId,
        name: storeName,
        fields: [],
      });
    }

    return list;
  }, [actualStoreNodes, storeId, storeName]);

  const baseConfigProps = {
    propMappings,
    onUpdatePropMapping,
    stateStores,
    stateName,
    displayLabel,
    effectiveStoreName,
    effectiveStoreId,
    capitalizedState,
    defaultSetterName,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-primary" />
          <span>Component Prop Mappings</span>
        </Label>
        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
          &lt;{selectedOption.label} /&gt; props
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1.5">
        Configure component attributes and variable bindings for {selectedOption.label}.
      </p>

      {/* Input Component Props */}
      {currentComponent === "input" && (
        <InputPropsConfig
          {...baseConfigProps}
          stateType={stateType}
          availableActions={availableActions}
          onOpenEventConfig={onOpenEventConfig}
          onCreateAction={onCreateAction}
        />
      )}

      {/* Button Component Props */}
      {currentComponent === "button" && (
        <ButtonPropsConfig
          propMappings={propMappings}
          onUpdatePropMapping={onUpdatePropMapping}
        />
      )}

      {/* Card Component Props */}
      {currentComponent === "card" && (
        <CardPropsConfig {...baseConfigProps} />
      )}

      {/* Progress Component Props */}
      {currentComponent === "progress" && (
        <ProgressPropsConfig {...baseConfigProps} />
      )}

      {/* Alert Component Props */}
      {currentComponent === "alert" && (
        <AlertPropsConfig {...baseConfigProps} />
      )}

      {/* Avatar Component Props */}
      {currentComponent === "avatar" && (
        <AvatarPropsConfig {...baseConfigProps} />
      )}

      {/* Skeleton Component Props */}
      {currentComponent === "skeleton" && (
        <SkeletonPropsConfig
          propMappings={propMappings}
          onUpdatePropMapping={onUpdatePropMapping}
        />
      )}

      {/* Switch & Checkbox Props */}
      {(currentComponent === "switch" || currentComponent === "checkbox") && (
        <SwitchCheckboxPropsConfig
          {...baseConfigProps}
          currentComponent={currentComponent}
        />
      )}

      {/* Badge Component Props */}
      {currentComponent === "badge" && (
        <BadgePropsConfig {...baseConfigProps} />
      )}

      {/* Code / Text Component Props */}
      {(currentComponent === "code" || currentComponent === "text") && (
        <CodeTextPropsConfig {...baseConfigProps} />
      )}

      {/* Sidebar Component Props */}
      {currentComponent === "sidebar" && (
        <SidebarPropsConfig
          {...baseConfigProps}
          onCreateNavStateVariable={onCreateNavStateVariable}
        />
      )}

      {/* Chat Component Props */}
      {currentComponent === "chat" && (
        <ChatPropsConfig
          {...baseConfigProps}
          onCreateChatMessageStateVariable={onCreateChatMessageStateVariable}
          onQuickWireChatActions={onQuickWireChatActions}
        />
      )}

      {/* Topbar Component Props */}
      {currentComponent === "topbar" && (
        <TopbarPropsConfig
          {...baseConfigProps}
          onCreateNavStateVariable={onCreateNavStateVariable}
        />
      )}
    </div>
  );
});

ComponentPropMappingsSection.displayName = "ComponentPropMappingsSection";
