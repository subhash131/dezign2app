import React from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { BackendNode, Endpoint } from "@workspace/canvas";
import type { FrontendActionStepDraft, FrontendFieldSource } from "./types";
import { FRONTEND_STEP_TYPE_META } from "./actionStepConstants";

export interface FrontendStepRowHeaderProps {
  step: FrontendActionStepDraft;
  index: number;
  expanded: boolean;
  allNodes: BackendNode[];
  endpoints: (Endpoint & { nodeId: string })[];
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onToggleExpand: () => void;
  onDelete: () => void;
}

export function formatStepCodePreview(
  step: FrontendActionStepDraft,
  allNodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[],
): string {
  switch (step.type) {
    case "api_call": {
      const ep = endpoints.find((e) => e.id === step.endpointId);
      const srv = allNodes.find((n) => n.id === step.serviceNodeId);
      const method = (ep?.type || "POST").toLowerCase();
      const path = ep?.name || "/api";
      const srvName = srv?.data?.label || "";
      return `const res = await ${srvName ? `${srvName}.` : ""}${method}("${path}")`;
    }

    case "storage_put": {
      const bucket = step.bucketId || "bucket";
      const fileKey = step.fileSource?.key || "file";
      return `await storage.upload("${bucket}", ${fileKey})`;
    }

    case "state_mutation": {
      const key = step.stateKey || "state";
      const op = step.stateActionName || step.stateUpdateType || "set";
      const isStore = step.stateTargetKind === "store";
      if (isStore) {
        const storeNode = allNodes.find((n) => n.id === step.stateStoreNodeId);
        const storeName = storeNode?.data?.label || storeNode?.data?.storeName || "store";
        if (op === "reset" || op === "clear") return `${storeName}.dispatch("${key}", "${op}")`;
        return `${storeName}.dispatch("${key}", { action: "${op}", ... })`;
      }
      if (op === "toggle") return `setState(${key} => !${key})`;
      if (op === "increment") return `setState(${key} => ${key} + 1)`;
      if (op === "reset") return `resetState("${key}")`;
      return `setState({ ${key}: ... })`;
    }

    case "navigation": {
      const route = step.targetRoute || "/";
      const bindings = step.pathParamBindings || [];
      if (bindings.length > 0) {
        let hasDynamicExpr = false;
        let templateRoute = route;
        bindings.forEach((b) => {
          const src = b.source;
          let placeholder = b.paramName;
          if (src) {
            if (src.kind === "literal") {
              placeholder = src.value || b.paramName;
            } else if (src.kind === "prev_response") {
              hasDynamicExpr = true;
              placeholder = src.fieldPath ? `step.${src.fieldPath}` : "step.id";
            } else if (src.kind === "state_var") {
              hasDynamicExpr = true;
              placeholder =
                src.fieldPath ||
                (src.storeName
                  ? `${src.storeName}.${src.stateKey}`
                  : `state.${src.stateKey}`);
            } else if (src.kind === "route_param") {
              hasDynamicExpr = true;
              placeholder = `params.${src.paramName}`;
            } else if (src.kind === "query_param") {
              hasDynamicExpr = true;
              placeholder = `query.${src.paramName}`;
            } else if (src.kind === "item_prop") {
              hasDynamicExpr = true;
              placeholder = `item.${src.propPath || src.fieldPath || "id"}`;
            }
          }
          if (hasDynamicExpr) {
            templateRoute = templateRoute.replace(
              new RegExp(`\\[${b.paramName}\\]`, "g"),
              `\${${placeholder}}`,
            );
          } else {
            templateRoute = templateRoute.replace(
              new RegExp(`\\[${b.paramName}\\]`, "g"),
              placeholder,
            );
          }
        });
        const method = step.navMethod || "router_push";
        if (method === "history_push") {
          return hasDynamicExpr
            ? `history.pushState(..., \`${templateRoute}\`)`
            : `history.pushState(..., "${templateRoute}")`;
        }
        if (method === "history_replace") {
          return hasDynamicExpr
            ? `history.replaceState(..., \`${templateRoute}\`)`
            : `history.replaceState(..., "${templateRoute}")`;
        }
        if (method === "router_replace") {
          return hasDynamicExpr
            ? `router.replace(\`${templateRoute}\`)`
            : `router.replace("${templateRoute}")`;
        }
        return hasDynamicExpr
          ? `router.push(\`${templateRoute}\`)`
          : `router.push("${templateRoute}")`;
      }
      const method = step.navMethod || "router_push";
      if (method === "history_push") return `history.pushState(..., "${route}")`;
      if (method === "history_replace") return `history.replaceState(..., "${route}")`;
      if (method === "router_replace") return `router.replace("${route}")`;
      return `router.push("${route}")`;
    }

    case "transform": {
      const varName = step.outputVariable || step.name || "transformResult";
      const fnName = step.functionRef?.name || step.transformerName || "transformer";
      return `const ${varName} = ${fnName}(...)`;
    }

    case "custom_code": {
      const firstLine = step.code?.trim().split("\n")[0] || "// custom code";
      return firstLine.slice(0, 40);
    }

    case "condition": {
      return `if (${step.conditionExpr || "condition"})`;
    }

    case "notification": {
      const lvl = step.notifyLevel || "success";
      const msg = step.notifyMessage ? `"${step.notifyMessage.slice(0, 20)}"` : '""';
      return `toast.${lvl}(${msg})`;
    }

    case "reset_form": {
      return `form.reset()`;
    }

    case "update_query_params": {
      const nav = step.queryParamNavMode || "replace";
      const updates = step.queryParamsUpdates;
      if (updates && updates.length > 1) {
        const keys = updates
          .map((u) => u.key.trim())
          .filter((k) => k.length > 0);
        const keysSummary =
          keys.length > 0 ? `: ${keys.join(", ")}` : "";
        return `queryParams.update(${updates.length} params${keysSummary}) (${nav})`;
      }

      const key = step.queryParamKey || "param";
      const mode = step.queryParamMode || "set";
      if (mode === "remove") return `queryParams.delete("${key}") (${nav})`;
      if (mode === "toggle") return `queryParams.toggle("${key}") (${nav})`;

      const formatSource = (src?: FrontendFieldSource): string => {
        if (!src) return "value";
        if (src.kind === "literal") return `"${src.value || ""}"`;
        if (src.kind === "state_var") return `state.${src.stateKey}`;
        if (src.kind === "user_input") return `input.${src.fieldName}`;
        if (src.kind === "prev_response") return `step.${src.fieldPath}`;
        if (src.kind === "route_param") return `params.${src.paramName}`;
        if (src.kind === "query_param") return `query.${src.paramName}`;
        if (src.kind === "session_storage") return `sessionStorage.${src.key}`;
        if (src.kind === "local_storage") return `localStorage.${src.key}`;
        if (src.kind === "cookie") return `cookie.${src.cookieName}`;
        if (src.kind === "item_prop") return `item.${src.propPath || src.fieldPath || "id"}`;
        if (src.kind === "realtime_payload") return `stream.${src.fieldPath || "payload"}`;
        if (src.kind === "auth_token") {
          return src.tokenType === "cookie"
            ? "cookie.session_token"
            : src.tokenType === "local_storage"
            ? "localStorage.auth_token"
            : "auth.sessionToken";
        }
        return "value";
      };

      const val = formatSource(step.queryParamValueSource);
      return `queryParams.set("${key}", ${val}) (${nav})`;
    }

    case "browser_storage": {
      const engine = step.storageEngine || "localStorage";
      const op = step.storageOperation || "set";
      const key = step.storageKey || "key";
      if (op === "clear") return `${engine}.clear()`;
      if (op === "remove") return `${engine}.removeItem("${key}")`;
      if (op === "toggle") return `${engine}.toggle("${key}")`;
      if (op === "append") return `${engine}.append("${key}", ...)`;
      return `${engine}.setItem("${key}", ...)`;
    }

    case "auth": {
      const op = step.authOperation || "signOut";
      if (op === "signOut") return "await authClient.signOut()";
      if (op === "signInSocial") return `await authClient.signIn.social({ provider: "${step.authProvider || "google"}" })`;
      if (op === "signInEmail") return "await authClient.signIn.email({ email, password })";
      if (op === "signUpEmail") return "await authClient.signUp.email({ email, password, name })";
      if (op === "setActiveOrg") return "await authClient.organization.setActive({ organizationId })";
      if (op === "leaveOrg") return "await authClient.organization.leave({ organizationId })";
      if (op === "getSession") return "await authClient.getSession()";
      return `await authClient.${op}()`;
    }
  }
}

export const FrontendStepRowHeader: React.FC<FrontendStepRowHeaderProps> = ({
  step,
  index,
  expanded,
  allNodes,
  endpoints,
  dragHandleProps,
  onToggleExpand,
  onDelete,
}) => {
  const meta = FRONTEND_STEP_TYPE_META[step.type];
  const codePreview = formatStepCodePreview(step, allNodes, endpoints);

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none bg-muted/20 hover:bg-muted/40 transition-colors"
      onClick={onToggleExpand}
    >
      {/* Drag Grip */}
      <div
        {...dragHandleProps}
        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted/40"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} className="shrink-0" />
      </div>

      {/* Step Number */}
      <span className="text-[11px] text-muted-foreground/60 w-3.5 shrink-0 font-mono">
        {index + 1}
      </span>

      {/* Type Badge */}
      <span
        className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.color}`}
      >
        {meta.icon}
        {meta.label}
      </span>

      {/* Inline Code Preview */}
      <span className="text-xs font-mono font-medium text-foreground/90 flex-1 truncate min-w-0">
        {codePreview}
      </span>

      {/* Delete Button */}
      <button
        type="button"
        className="p-1 text-muted-foreground/40 hover:text-destructive transition-colors rounded hover:bg-destructive/10 shrink-0"
        title="Delete step"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={12} />
      </button>

      {/* Expand / Collapse Chevron */}
      <div className="text-muted-foreground shrink-0 ml-0.5">
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </div>
    </div>
  );
};
