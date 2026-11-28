import React from "react";
import { AUTH_FRAMEWORK_BETTER_AUTH, DEFAULT_AUTH_FRAMEWORK } from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Accordion } from "@workspace/ui/components/accordion";
import {
  AuthConfigHeader,
  AuthCoreEntitiesSection,
  AuthProvidersSection,
  AuthSecuritySection,
  AuthSessionSection,
  AuthOrgRbacSection,
  AuthHooksSection,
  AuthPluginsSection,
  AuthCodePreviewSection,
} from "./auth-config";

export const AuthConfig = ({
  id,
  nodeId,
}: {
  id: string;
  nodeId: string;
}) => {
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === nodeId),
  );
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  if (!node) return null;

  const data = node.data;
  // Gate Better Auth–specific configuration sections so switching to another IdP
  // cleanly hides Better Auth table mappings, plugins, and lifecycle hooks.
  const isBetterAuth = (data.framework || DEFAULT_AUTH_FRAMEWORK) === AUTH_FRAMEWORK_BETTER_AUTH;

  const updateData = (changes: Partial<typeof data>) => {
    updateNode(nodeId, { data: { ...data, ...changes } });
  };

  const webAppNodes = allNodes.filter((n) => n.type === "webApp");
  const connectedWebApps = webAppNodes.filter((app) => {
    if (app.data?.authNodeId === nodeId) return true;
    return edges.some(
      (e) =>
        (e.target === app.id && e.source === nodeId) ||
        (e.source === app.id && e.target === nodeId),
    );
  });

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12 text-foreground">
      {/* Header */}
      <AuthConfigHeader label={data.label} />

      {/* Connected Web Applications Summary */}
      <div className="p-4 rounded-xl bg-card border border-border/60 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected Web Applications ({connectedWebApps.length})</span>
          </div>
        </div>

        {connectedWebApps.length > 0 ? (
          <div className="flex flex-col gap-2">
            {connectedWebApps.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-foreground truncate">
                    {app.data?.label || "Web App"}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    apps/{app.data?.appSlug || "web-app"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveConfigItem({
                      type: "webApp",
                      id: app.id,
                      nodeId: app.id,
                    })
                  }
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer font-medium shrink-0 ml-2"
                >
                  Configure WebApp &rarr;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground flex flex-col gap-1">
            <span className="font-medium text-foreground">⚠️ No Web Apps connected</span>
            <span>
              Connect this Auth Server to a Web App on the canvas to generate Better Auth routes and client SDKs.
            </span>
          </div>
        )}
      </div>

      {/* Top to Bottom Collapsible Sections matching EndpointConfig card theme */}
      <Accordion
        type="multiple"
        defaultValue={[
          "core-entities",
          "providers",
          "security-redirects",
          "session",
          "org",
          "hooks",
          "plugins",
          "preview",
        ]}
        className="w-full flex flex-col gap-4 border-none"
      >
        {isBetterAuth && (
          <AuthCoreEntitiesSection
            data={data}
            updateData={updateData}
            allNodes={allNodes}
            edges={edges}
            nodeId={nodeId}
          />
        )}
        <AuthProvidersSection
          data={data}
          updateData={updateData}
          allNodes={allNodes}
          edges={edges}
          nodeId={nodeId}
        />
        <AuthSecuritySection
          data={data}
          updateData={updateData}
          allNodes={allNodes}
          edges={edges}
          nodeId={nodeId}
        />
        <AuthSessionSection
          data={data}
          updateData={updateData}
          allNodes={allNodes}
          edges={edges}
          nodeId={nodeId}
        />
        <AuthOrgRbacSection
          data={data}
          updateData={updateData}
          allNodes={allNodes}
          edges={edges}
          nodeId={nodeId}
        />
        {isBetterAuth && (
          <AuthHooksSection
            data={data}
            updateData={updateData}
            allNodes={allNodes}
            edges={edges}
            nodeId={nodeId}
          />
        )}
        {isBetterAuth && (
          <AuthPluginsSection
            data={data}
            updateData={updateData}
            allNodes={allNodes}
            edges={edges}
            nodeId={nodeId}
          />
        )}
        <AuthCodePreviewSection
          data={data}
          updateData={updateData}
          allNodes={allNodes}
          edges={edges}
          nodeId={nodeId}
        />
      </Accordion>
    </div>
  );
};
