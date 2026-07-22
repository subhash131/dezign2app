import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ParameterEditor, SchemaEditor } from "../backend-nodes/graph-nodes/Editors";
import { MessagingResourceList, LocalTextarea, LocalInput } from "../backend-nodes/graph-nodes/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
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
  
  let responseMockObj: JSONObject = {};
  if (typeof currentResponseMock === "object" && currentResponseMock !== null && !Array.isArray(currentResponseMock)) {
    responseMockObj = currentResponseMock;
  }

  const updateResponseMockField = (fieldName: string, value: string) => {
    if (!selectedCase) return;
    const newObj: JSONObject = { ...responseMockObj, [fieldName]: value };
    const newMocks = { ...selectedCase.mocks, [id]: { returnData: newObj, status: 200 } };
    const updatedCase = { ...selectedCase, mocks: newMocks };
    updateTestCase(updatedCase.id, { mocks: newMocks });
    if (projectId) {
      upsertBackendTestCase({ projectId, testCaseId: updatedCase.id, data: updatedCase });
    }
  };

  const updateEventMock = (eventId: string, value: string) => {
    if (!selectedCase) return;
    let parsed: JSONValue = value;
    try { parsed = JSON.parse(value); } catch {}
    const newMocks = { ...selectedCase.mocks, [eventId]: { returnData: parsed, status: 200 } };
    const updatedCase = { ...selectedCase, mocks: newMocks };
    updateTestCase(updatedCase.id, { mocks: newMocks });
    if (projectId) {
      upsertBackendTestCase({ projectId, testCaseId: updatedCase.id, data: updatedCase });
    }
  };

  const getFieldValue = (name: string): string => {
    const v = responseMockObj[name];
    if (typeof v === "string") return v;
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
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
        <Textarea 
          key={`businessLogic-${item.id}`}
          className="min-h-[120px] text-sm resize-none bg-background/50 focus-visible:ring-1 font-mono"
          placeholder="e.g. 1. Validate user input&#10;2. Check if user exists&#10;3. Save to database"
          defaultValue={item.businessLogic || ""}
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
            <div className="flex flex-col gap-2 border p-3 rounded-lg bg-secondary/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Response Payload</span>
              {(!item.responseBody?.fields || item.responseBody.fields.length === 0) ? (
                <span className="text-xs text-muted-foreground italic">No fields defined in response schema.</span>
              ) : (
                <div className="grid gap-2">
                  {item.responseBody.fields.map(field => (
                    <div key={field.id || field.name} className="grid grid-cols-3 items-center gap-2">
                      <Label className="text-xs font-mono text-muted-foreground">
                        {field.name}{field.required ? "*" : ""}
                      </Label>
                      <LocalInput
                        className="col-span-2 h-7 text-xs font-mono bg-background"
                        placeholder={`<${field.type}>`}
                        value={getFieldValue(field.name)}
                        onBlur={(e) => updateResponseMockField(field.name, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Published Events Mock */}
            {item.publishedEvents && item.publishedEvents.length > 0 && (
              <div className="flex flex-col gap-2 border p-3 rounded-lg bg-secondary/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Published Events Payload</span>
                <div className="grid gap-3">
                  {item.publishedEvents.map(event => {
                    const eventMock = selectedCase?.mocks?.[event.id!]?.returnData;
                    const eventMockText = eventMock === undefined ? "" : (typeof eventMock === "string" ? eventMock : JSON.stringify(eventMock, null, 2));
                    return (
                      <div key={event.id} className="flex flex-col gap-1.5">
                        <Label className="text-xs font-mono font-semibold">{event.name}</Label>
                        <Textarea
                          key={`eventMock-${event.id}`}
                          className="min-h-[60px] text-xs resize-y bg-background font-mono"
                          placeholder={'{"key": "value"}'}
                          defaultValue={eventMockText}
                          onBlur={(e) => updateEventMock(event.id!, e.target.value)}
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
