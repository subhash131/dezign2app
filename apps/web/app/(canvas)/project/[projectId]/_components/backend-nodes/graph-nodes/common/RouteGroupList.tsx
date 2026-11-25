import React, { useState, useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { Plus, Trash, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { BackendNode, Endpoint } from "@/types/canvas";
import { generateId } from "./utils";
import { LocalInput } from "./LocalInput";
import { EndpointRow, EndpointList } from "./EndpointList";
import {
  parseEndpointRouteWithParams,
  reconcileEndpointPathParams,
} from "@workspace/canvas";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { cn } from "@workspace/ui/lib/utils";

export interface RouteGroupEditorProps {
  group: NonNullable<BackendNode["data"]["routeGroups"]>[0];
  groupIndex: number;
  nodeId: string;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
}

export const RouteGroupEditor = ({
  group,
  groupIndex,
  nodeId,
  updateNode,
  data,
}: RouteGroupEditorProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(!group.name);
  const [nameValue, setNameValue] = useState(group.name || "");
  const [editingBasePath, setEditingBasePath] = useState(false);
  const [basePathValue, setBasePathValue] = useState(group.basePath || "");

  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (typeof updateNodeInternals === "function") {
      updateNodeInternals(nodeId);
    }
  }, [collapsed, group.endpoints, nodeId, updateNodeInternals]);

  // Endpoint editing state
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(
    null,
  );
  const [editingEndpointName, setEditingEndpointName] = useState("");
  const [editingEndpointType, setEditingEndpointType] = useState("GET");

  const routeGroups = data.routeGroups || [];

  const updateGroup = (
    changes: Partial<NonNullable<BackendNode["data"]["routeGroups"]>[0]>,
  ) => {
    const newGroups = [...routeGroups];
    if (!newGroups[groupIndex]) return;
    newGroups[groupIndex] = { ...newGroups[groupIndex]!, ...changes };
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  const deleteGroup = () => {
    const newGroups = routeGroups.filter((_, i: number) => i !== groupIndex);
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  const handleSaveName = (rawValue?: string) => {
    const trimmed = (rawValue ?? nameValue).trim();
    if (!trimmed && !group.endpoints?.length) {
      deleteGroup();
      return;
    }
    updateGroup({ name: trimmed || "Untitled Group" });
    setEditingName(false);
  };

  const handleSaveBasePath = (rawValue?: string) => {
    updateGroup({ basePath: (rawValue ?? basePathValue).trim() });
    setEditingBasePath(false);
  };

  // Endpoint CRUD within this group
  const endpoints = group.endpoints || [];

  const handleAddEndpoint = () => {
    const newEndpoint = {
      id: generateId(),
      name: "",
      type: "GET",
      headers: [],
      pathParams: [],
      queryParams: [],
      requestBody: { id: generateId(), fields: [] },
      responseBody: { id: generateId(), fields: [] },
      processingSteps: [],
      publishedEvents: [],
      isIdempotent: false,
    } as Endpoint;
    updateGroup({ endpoints: [...endpoints, newEndpoint] });
    setEditingEndpointId(newEndpoint.id);
    setEditingEndpointName("");
    setEditingEndpointType("GET");
  };

  const handleUpdateEndpoint = (id: string, rawName: string, type: string) => {
    const target = endpoints.find((ep) => ep.id === id);
    const parsed = parseEndpointRouteWithParams(rawName);
    const sanitizedName = parsed.route;
    const oldRoute = target?.name || "";

    const reconciledPathParams = reconcileEndpointPathParams({
      currentPathParams: target?.pathParams || [],
      newRoute: sanitizedName,
      oldRoute,
    });

    const existingQueryParams = target?.queryParams || [];
    const mergedQueryParams = [...existingQueryParams];
    let queryParamsChanged = false;
    const pathParamNames = new Set(
      reconciledPathParams
        .map((p) => (p.name || "").trim().toLowerCase())
        .filter((n) => n.length > 0),
    );
    parsed.extractedQueryParams.forEach((eq) => {
      const lower = eq.name.toLowerCase();
      if (pathParamNames.has(lower)) return;
      if (!mergedQueryParams.some((q) => q.name.toLowerCase() === lower)) {
        mergedQueryParams.push(eq);
        queryParamsChanged = true;
      }
    });

    const newEndpoints = endpoints.map((ep) =>
      ep.id === id
        ? {
            ...ep,
            name: sanitizedName,
            type,
            ...(reconciledPathParams.length !== (ep.pathParams || []).length ||
            JSON.stringify(reconciledPathParams) !== JSON.stringify(ep.pathParams || [])
              ? { pathParams: reconciledPathParams }
              : {}),
            ...(queryParamsChanged ? { queryParams: mergedQueryParams } : {}),
          }
        : ep,
    );
    updateGroup({ endpoints: newEndpoints });
  };

  const handleDeleteEndpoint = (id: string) => {
    const newEndpoints = endpoints.filter((ep) => ep.id !== id);
    updateGroup({ endpoints: newEndpoints });
  };

  const handleUpdateEndpointItem = (id: string, changes: Partial<Endpoint>) => {
    const newEndpoints = endpoints.map((ep) =>
      ep.id === id ? { ...ep, ...changes } : ep,
    );
    updateGroup({ endpoints: newEndpoints });
  };

  return (
    <div className="border-t">
      {/* Source handle for wiring this group to a DB node */}
      <Handle
        type="source"
        position={Position.Right}
        id={`routeGroup-${group.id}`}
        className={cn(CANVAS_HANDLE_CLASS, CANVAS_HANDLE_RIGHT_OFFSET_CLASS, "border-2 border-background transition-all hover:scale-125")}
        style={{ top: "auto" }}
      />

      {/* Group Header */}
      <div
        className="px-3 py-1.5 bg-blue-500/5 flex items-center justify-between group/grp cursor-pointer nodrag relative"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed && (
          <>
            {endpoints.map((ep) => (
              <React.Fragment key={ep.id}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`endpoint-in-${ep.id}`}
                  className={cn(CANVAS_HANDLE_CLASS, CANVAS_HANDLE_LEFT_OFFSET_CLASS, "border-2 border-background transition-all hover:scale-125")}
                  style={{ top: "50%" }}
                />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`endpoint-out-${ep.id}`}
                  className={cn(CANVAS_HANDLE_CLASS, CANVAS_HANDLE_RIGHT_OFFSET_CLASS, "border-2 border-background transition-all hover:scale-125")}
                  style={{ top: "50%" }}
                />
                {ep.publishedEvents?.map((ev) => (
                  <Handle
                    key={ev.id}
                    type="source"
                    position={Position.Right}
                    id={`publishedEvents-out-${ev.id}`}
                    className={cn(CANVAS_HANDLE_CLASS, CANVAS_HANDLE_RIGHT_OFFSET_CLASS, "border-2 border-background transition-all hover:scale-125")}
                    style={{ top: "50%" }}
                  />
                ))}
              </React.Fragment>
            ))}
          </>
        )}

        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
          <div className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-all shrink-0">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>

          {editingName ? (
            <LocalInput
              value={nameValue || ""}
              debounceMs={0}
              onChange={(e) => setNameValue(e.target.value)}
              className="h-5 text-xs px-1 w-24 nodrag"
              autoFocus
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") handleSaveName(e.currentTarget.value);
                if (e.key === "Escape") {
                  setNameValue(group.name || "");
                  setEditingName(false);
                }
              }}
              onBlur={(e) => handleSaveName(e.currentTarget.value)}
            />
          ) : (
            <span
              className="text-xs font-semibold truncate hover:text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setEditingName(true);
                setNameValue(group.name || "");
              }}
            >
              {group.name || "Untitled Group"}
            </span>
          )}

          {editingBasePath ? (
            <LocalInput
              value={basePathValue}
              debounceMs={0}
              onChange={(e) => setBasePathValue(e.target.value)}
              className="h-5 text-[10px] px-1 w-20 text-muted-foreground nodrag"
              placeholder="/path"
              autoFocus
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") handleSaveBasePath(e.currentTarget.value);
                if (e.key === "Escape") {
                  setBasePathValue(group.basePath || "");
                  setEditingBasePath(false);
                }
              }}
              onBlur={(e) => handleSaveBasePath(e.currentTarget.value)}
            />
          ) : (
            <span
              className="text-[10px] text-muted-foreground truncate hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setEditingBasePath(true);
                setBasePathValue(group.basePath || "");
              }}
            >
              {group.basePath || "/..."}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover/grp:opacity-100 transition-all shrink-0">
          <div
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleAddEndpoint();
              if (collapsed) setCollapsed(false);
            }}
          >
            <Plus size={12} />
          </div>
          <div
            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteGroup();
            }}
          >
            <Trash size={14} />
          </div>
        </div>
      </div>

      {/* Endpoints within this group */}
      {!collapsed && (
        <div className="flex flex-col">
          {endpoints.length === 0 ? (
            <div className="bg-secondary/10 p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleAddEndpoint}
              >
                <Plus size={12} className="mr-1" /> Add endpoint
              </Button>
            </div>
          ) : (
            endpoints.map((ep) => (
              <EndpointRow
                key={ep.id}
                nodeId={nodeId}
                item={ep}
                isEditing={editingEndpointId === ep.id}
                setEditingId={setEditingEndpointId}
                editingName={editingEndpointName}
                setEditingName={setEditingEndpointName}
                editingType={editingEndpointType}
                setEditingType={setEditingEndpointType}
                handleUpdate={handleUpdateEndpoint}
                handleDelete={handleDeleteEndpoint}
                handleUpdateItem={handleUpdateEndpointItem}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const RouteGroupList = ({
  nodeId,
  data,
  updateNode,
}: {
  nodeId: string;
  data: BackendNode["data"];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
}) => {
  const routeGroups = data.routeGroups || [];
  const ungroupedEndpoints = data.endpoints || [];

  const handleAddGroup = () => {
    const newGroup = {
      id: generateId(),
      name: "",
      basePath: "",
      endpoints: [],
    };
    const newGroups = [...routeGroups, newGroup];
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  const moveToGroup = (endpointId: string, groupIndex: number) => {
    const ep = ungroupedEndpoints.find((e) => e.id === endpointId);
    if (!ep) return;

    const newUngrouped = ungroupedEndpoints.filter((e) => e.id !== endpointId);
    const newGroups = [...routeGroups];
    if (!newGroups[groupIndex]) return;

    newGroups[groupIndex] = {
      ...newGroups[groupIndex]!,
      endpoints: [...(newGroups[groupIndex]!.endpoints || []), ep],
    };

    updateNode(nodeId, {
      data: { ...data, endpoints: newUngrouped, routeGroups: newGroups },
    });
  };

  return (
    <div className="flex flex-col">
      {/* Ungrouped endpoints (backward compat) */}
      {ungroupedEndpoints.length > 0 && (
        <EndpointList nodeId={nodeId} title="Routes (ungrouped)" />
      )}

      {/* Route Groups */}
      {routeGroups.map((group, index: number) => (
        <RouteGroupEditor
          key={group.id}
          group={group}
          groupIndex={index}
          nodeId={nodeId}
          updateNode={updateNode}
          data={data}
        />
      ))}

      {/* Add route group button */}
      <div className="bg-secondary/20 p-1.5 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleAddGroup}
        >
          <Plus size={12} className="mr-1" /> Add route group
        </Button>
      </div>
    </div>
  );
};
