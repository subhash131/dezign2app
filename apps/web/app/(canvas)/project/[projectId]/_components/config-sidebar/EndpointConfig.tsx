import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ParameterEditor, SchemaEditor, JsonPayloadEditor } from "../backend-nodes/graph-nodes/Editors";
import { MessagingResourceList, LocalTextarea, LocalInput } from "../backend-nodes/graph-nodes/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui/components/tabs";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useParams } from "next/navigation";
import { JSONValue, JSONObject } from "@/types/canvas";
import { Textarea } from "@workspace/ui/components/textarea";

interface EndpointConfigProps {
  id: string;
  nodeId: string;
}

export const EndpointConfig = ({ id, nodeId }: EndpointConfigProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  
  const endpoints = useBackendCanvasStore(s => s.endpoints);
  const updateEndpoint = useBackendCanvasStore(s => s.updateEndpoint);
  const node = useBackendCanvasStore(s => s.nodes.find(n => n.id === nodeId));
  const authRules = node?.data.authRules || [];

  const testCases = useSimulationStore(s => s.testCases);
  const updateTestCase = useSimulationStore(s => s.updateTestCase);
  const upsertBackendTestCase = useMutation(api.canvas.upsertBackendTestCase);

  const selectedCaseId = useSimulationStore(s => s.selectedCaseId) || "none";
  const selectTestCase = useSimulationStore(s => s.selectTestCase);

  const handleSelectCase = (caseId: string) => {
    selectTestCase(caseId === "none" ? undefined : caseId);
  };

  const item = endpoints.find(e => e.id === id);
  if (!item) return null;

  const selectedCase = testCases.find(tc => tc.id === selectedCaseId);
  const currentResponseMock = selectedCase?.mocks?.[id]?.returnData;

  const updateEventMock = (eventId: string, value: any) => {
    if (!selectedCase) return;
    const newMocks = { ...selectedCase.mocks, [eventId]: { returnData: value, status: 200 } };
    const updatedCase = { ...selectedCase, mocks: newMocks };
    updateTestCase(updatedCase.id, { mocks: newMocks });
    if (projectId) {
      upsertBackendTestCase({ projectId, testCaseId: updatedCase.id, data: updatedCase });
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-primary/15 text-primary rounded border border-primary/20 shadow-sm">{item.type}</span>
          <span className="text-lg font-semibold tracking-tight text-foreground">{item.name}</span>
        </div>
        <span className="text-sm text-muted-foreground">Configure endpoint details and behavior.</span>
      </div>

      {node?.type === "api_gateway" && (
        <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auth Rule</span>
            <Select
              value={item.authRuleId || "__none__"}
              onValueChange={authRuleId => updateEndpoint(item.id, { authRuleId: authRuleId === "__none__" ? undefined : authRuleId })}
            >
              <SelectTrigger className="bg-background"><SelectValue placeholder="Select an auth rule" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No auth rule</SelectItem>
                {authRules.filter(rule => rule.name.trim()).map(rule => (
                  <SelectItem key={rule.id} value={rule.id}>{rule.name} ({rule.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Choose a reusable gateway policy for this endpoint.</span>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Authorization</span>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Required Roles (Comma separated)</Label>
                <Input className="h-7 text-xs bg-background" placeholder="e.g. admin, user" value={item.requiredRoles?.join(", ") || ""} onChange={(e) => updateEndpoint(item.id, { requiredRoles: e.target.value.split(",").map(r => r.trim()).filter(Boolean) })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Required Scopes (Comma separated)</Label>
                <Input className="h-7 text-xs bg-background" placeholder="e.g. read:users, write:users" value={item.requiredScopes?.join(", ") || ""} onChange={(e) => updateEndpoint(item.id, { requiredScopes: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Audience</Label>
                <Input className="h-7 text-xs bg-background" placeholder="e.g. my-api" value={item.audience || ""} onChange={(e) => updateEndpoint(item.id, { audience: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Summary</Label>
        <Input className="bg-background/50" placeholder="e.g. Returns all users." value={item.summary || ""} onChange={(e) => updateEndpoint(item.id, { summary: e.target.value })} />
      </div>
      
      <ParameterEditor 
        title="Headers" 
        parameters={item.headers || []} 
        onChange={headers => updateEndpoint(item.id, { headers })} 
      />
      <ParameterEditor 
        title="Path Params" 
        parameters={item.pathParams || []} 
        onChange={pathParams => updateEndpoint(item.id, { pathParams })} 
      />
      <ParameterEditor 
        title="Query Params" 
        parameters={item.queryParams || []} 
        onChange={queryParams => updateEndpoint(item.id, { queryParams })} 
      />
      <SchemaEditor 
        title="Request Body Schema" 
        schema={item.requestBody} 
        onChange={requestBody => updateEndpoint(item.id, { requestBody })} 
      />
      <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Business Logic (Pseudo-code)
        </span>
        <LocalTextarea 
          key={`businessLogic-${item.id}`}
          className="min-h-[120px] text-sm resize-none bg-background/50 focus-visible:ring-1 font-mono"
          placeholder="e.g. 1. Validate user input&#10;2. Check if user exists&#10;3. Save to database"
          value={item.businessLogic || ""}
          onBlur={e => updateEndpoint(item.id, { businessLogic: e.target.value })}
        />
      </div>
      
      <div className="flex flex-col gap-3 mt-2">
        <MessagingResourceList
          nodeId={nodeId}
          title="Publish Events"
          items={item.publishedEvents || []}
          variant="publish"
          resourceType="topics"
          asCard={true}
          onChange={(publishedEvents) => updateEndpoint(item.id, { publishedEvents })}
        />
      </div>
      
      <SchemaEditor 
        title="Response Schema" 
        schema={item.responseBody} 
        onChange={responseBody => updateEndpoint(item.id, { responseBody })} 
      />

      <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Test Case Mock Response
          </span>
          <span className="text-xs text-muted-foreground">
            Set the JSON response this endpoint should return for a specific test case during simulation.
          </span>
        </div>
        
        <Select value={selectedCaseId} onValueChange={handleSelectCase}>
          <SelectTrigger className="h-7 text-xs bg-background"><SelectValue placeholder="Select a test case..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-- Select a test case --</SelectItem>
            {testCases.map((tc) => (
              <SelectItem key={tc.id} value={tc.id}>{tc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedCaseId !== "none" && (
          <div className="flex flex-col gap-4 mt-2">
            
            {/* Response Mock */}
            <JsonPayloadEditor
              key={`mock-${selectedCaseId}-${id}`}
              title="Response Payload"
              schema={item.responseBody}
              value={currentResponseMock}
              onChange={(newMock) => {
                if (selectedCase) {
                  const newMocks = { ...selectedCase.mocks, [id]: { returnData: newMock, status: 200 } };
                  const updatedCase = { ...selectedCase, mocks: newMocks };
                  updateTestCase(updatedCase.id, { mocks: newMocks });
                  if (projectId) {
                    upsertBackendTestCase({ projectId, testCaseId: updatedCase.id, data: updatedCase });
                  }
                }
              }}
            />

            {/* Published Events Mock */}
            {item.publishedEvents && item.publishedEvents.length > 0 && (
              <div className="flex flex-col gap-2 border p-3 rounded-lg bg-secondary/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Published Events Payload</span>
                <div className="grid gap-3">
                  {item.publishedEvents.map(event => {
                    const eventMock = selectedCase?.mocks?.[event.id!]?.returnData;
                    return (
                      <div key={event.id} className="pb-2">
                        <JsonPayloadEditor
                          key={`eventMock-${event.id}-${selectedCaseId}`}
                          title={`${event.name} Payload`}
                          schema={event.payloadSchema}
                          value={eventMock}
                          onChange={(val) => updateEventMock(event.id!, val)}
                          emptyText="No schema defined for this event. Use Raw JSON."
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
