import React, { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet";
import { ChevronLeft } from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { EndpointConfig } from "./config-sidebar/EndpointConfig";
import { WebPageEventConfig } from "./config-sidebar/WebPageEventConfig";
import { EventConfig } from "./config-sidebar/EventConfig";
import { TaskConfig } from "./config-sidebar/TaskConfig";
import { SearchIndexConfig } from "./config-sidebar/SearchIndexConfig";
import { AuthRuleConfig } from "./config-sidebar/AuthRuleConfig";
import { IdentityProviderConfig } from "./config-sidebar/IdentityProviderConfig";
import { AuthConfig } from "./config-sidebar/AuthConfig";
import { ServiceConfig } from "./config-sidebar/ServiceConfig";
import { WebAppConfig } from "./config-sidebar/WebAppConfig";
import { WebPageConfig } from "./config-sidebar/WebPageConfig";
import { WebPageSectionConfig } from "./config-sidebar/WebPageSectionConfig";
import { PaymentsConfig } from "./config-sidebar/PaymentsConfig";
import { ExternalConfig } from "./config-sidebar/ExternalConfig";
import { ZoneConfig } from "./config-sidebar/ZoneConfig";
import { EventTestingConfig } from "./config-sidebar/EventTestingConfig";

import { LangGraphRouteConfig } from "./config-sidebar/LangGraphRouteConfig";
import { EntityFunctionsConfig } from "./config-sidebar/EntityFunctionsConfig";
import { DatabaseConfig } from "./config-sidebar/DatabaseConfig";
import { TestUsersConfig } from "./config-sidebar/TestUsersConfig";
import { RedisSchemaConfig } from "./config-sidebar/RedisSchemaConfig";
import { TransformerConfig } from "./config-sidebar/TransformerConfig";
import { DatabaseTableRefConfig } from "./config-sidebar/DatabaseTableRefConfig";
import { RedisCacheRefConfig } from "./config-sidebar/RedisCacheRefConfig";
import { HookConfig } from "./config-sidebar/HookConfig";
import { TypesConfig } from "./config-sidebar/TypesConfig";
import { WebPageRealtimeConnectionConfig } from "./config-sidebar/WebPageRealtimeConnectionConfig";

export const ConfigSidebar = () => {
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const width = useSidebarStore((s) => s.configSidebarWidth);
  const setWidth = useSidebarStore((s) => s.setConfigSidebarWidth);
  const isDragging = useRef(false);

  type ConfigItem = NonNullable<typeof activeConfigItem>;
  const [history, setHistory] = useState<ConfigItem[]>([]);

  useEffect(() => {
    if (!activeConfigItem) {
      setHistory([]);
      return;
    }

    setHistory((prev) => {
      if (
        prev.length > 1 &&
        prev[prev.length - 2]?.id === activeConfigItem.id &&
        prev[prev.length - 2]?.type === activeConfigItem.type
      ) {
        return prev.slice(0, prev.length - 1);
      }

      if (
        prev.length > 0 &&
        prev[prev.length - 1]?.id === activeConfigItem.id &&
        prev[prev.length - 1]?.type === activeConfigItem.type
      ) {
        return prev;
      }

      if (
        prev.length > 0 &&
        prev[prev.length - 1]?.nodeId !== activeConfigItem.nodeId
      ) {
        return [activeConfigItem];
      }

      return [...prev, activeConfigItem];
    });
  }, [activeConfigItem]);

  const cleanupIfUnconfigured = (item: ConfigItem | null) => {
    if (item && item.type === "event") {
      const ev = useBackendCanvasStore
        .getState()
        .events.find((e) => e.id === item.id);
      if (ev && ev.variant === "consume") {
        const isConfigured = Boolean(
          (ev.name && ev.name.trim().length > 0) ||
            (ev.messagingResourceId && ev.messagingResourceId !== "none"),
        );
        if (!isConfigured) {
          useBackendCanvasStore.getState().deleteEvent(item.id);
        }
      }
    }
  };

  const handleBack = () => {
    if (history.length > 1) {
      cleanupIfUnconfigured(activeConfigItem);
      setActiveConfigItem(history[history.length - 2] ?? null);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 320 && newWidth < 800) {
        setWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const open = activeConfigItem !== null;

  if (!open) return null;

  const type = activeConfigItem.type;
  const id = activeConfigItem.id;
  const nodeId = activeConfigItem.nodeId || "";

  return (
    <Sheet
      modal={false}
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          cleanupIfUnconfigured(activeConfigItem);
          setActiveConfigItem(null);
        }
      }}
    >
      <SheetContent
        hideOverlay
        onInteractOutside={(e) => {
          if (type === "eventTesting") {
            e.preventDefault();
          }
        }}
        className="overflow-hidden p-0 bg-background/80 backdrop-blur-xl border-l border-border/50 shadow-2xl transition-none flex flex-col"
        style={{ maxWidth: "100vw", width: width }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 z-50 transition-colors"
          onMouseDown={() => {
            isDragging.current = true;
          }}
        />

        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <SheetHeader className="hidden">
            <SheetTitle>Configuration</SheetTitle>
            <SheetDescription>
              {type === "endpoint"
                ? "Configure endpoint properties."
                : type === "task"
                  ? "Configure task properties."
                  : type === "searchIndex"
                    ? "Configure search index properties."
                    : type === "authRule"
                      ? "Configure reusable authentication policy."
                      : type === "identityProvider"
                        ? "Configure identity provider."
                        : type === "database"
                          ? "Configure database connection properties."
                          : "Configure event and messaging properties."}
            </SheetDescription>
          </SheetHeader>

          {history.length > 1 && (
            <div
              onClick={handleBack}
              className="flex items-center text-sm text-muted-foreground hover:text-foreground cursor-pointer mb-6 transition-colors"
            >
              <ChevronLeft size={14} className="mr-0.5" />
              Back
            </div>
          )}

          {type === "endpoint" ? (
            <EndpointConfig id={id} nodeId={nodeId} />
          ) : type === "task" ? (
            <TaskConfig id={id} nodeId={nodeId} />
          ) : type === "searchIndex" ? (
            <SearchIndexConfig
              id={id}
              nodeId={nodeId}
              sourceId={activeConfigItem.sourceId}
            />
          ) : type === "authRule" ? (
            <AuthRuleConfig id={id} nodeId={nodeId} />
          ) : type === "identityProvider" ? (
            <IdentityProviderConfig id={id} nodeId={nodeId} />
          ) : type === "auth" ? (
            <AuthConfig id={id} nodeId={nodeId} />
          ) : type === "service" ? (
            <ServiceConfig id={id} nodeId={nodeId} />
          ) : type === "external" ? (
            <ExternalConfig id={id} nodeId={nodeId} />
          ) : type === "webApp" ? (
            <WebAppConfig id={id} nodeId={nodeId} />
          ) : type === "webPage" ? (
            <WebPageConfig id={id} nodeId={nodeId} />
          ) : type === "pageSection" ? (
            <WebPageSectionConfig id={id} nodeId={nodeId} />
          ) : type === "payments" ? (
            <PaymentsConfig id={id} nodeId={nodeId} />
          ) : type === "zone" ? (
            <ZoneConfig id={id} nodeId={nodeId} />
          ) : type === "pageEvent" ? (
            <WebPageEventConfig id={id} nodeId={nodeId} />
          ) : type === "eventTesting" ? (
            <EventTestingConfig
              id={id}
              nodeId={nodeId}
              targetNodeId={activeConfigItem.targetNodeId!}
              endpointId={activeConfigItem.endpointId!}
              initialTab={
                activeConfigItem.initialTab === "test-cases"
                  ? "test-cases"
                  : "trigger"
              }
            />
          ) : type === "langgraphRoute" ? (
            <LangGraphRouteConfig id={id} nodeId={nodeId} />
          ) : type === "entityFunctions" ? (
            <EntityFunctionsConfig id={id} nodeId={nodeId} />
          ) : type === "database" ? (
            <DatabaseConfig id={id} nodeId={nodeId} />
          ) : type === "testUsers" ? (
            <TestUsersConfig id={id} nodeId={nodeId} />
          ) : type === "redisSchema" ? (
            <RedisSchemaConfig id={id} nodeId={nodeId} />
          ) : type === "db_ref" ? (
            <DatabaseTableRefConfig id={id} nodeId={nodeId} />
          ) : type === "redis_cache" ? (
            <RedisCacheRefConfig id={id} nodeId={nodeId} />
          ) : type === "transformer" || type === "transformer_ref" ? (
            <TransformerConfig id={id} nodeId={nodeId} />
          ) : type === "hook" || type === "hook_ref" ? (
            <HookConfig id={id} nodeId={nodeId} />
          ) : type === "types" ? (
            <TypesConfig
              id={id}
              nodeId={nodeId}
              selectedTypeId={
                activeConfigItem.selectedTypeId || activeConfigItem.sectionId
              }
            />
          ) : type === "realtimeConnection" ? (
            <WebPageRealtimeConnectionConfig id={id} nodeId={nodeId} />
          ) : (
            <EventConfig id={id} nodeId={nodeId} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
