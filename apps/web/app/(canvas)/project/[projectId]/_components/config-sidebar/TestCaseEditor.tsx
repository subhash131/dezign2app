import React, { useState, useEffect, useRef } from "react";
import { Parameter, JSONValue, Endpoint } from "@/types/canvas";
import { SimulationTestCase } from "@workspace/canvas";
import { endpointInputParams, getInitialBody } from "../backend-nodes/graph-nodes/shared";
import { JsonPayloadEditor } from "../backend-nodes/graph-nodes/Editors";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Trash } from "lucide-react";

export const TestCaseEditor = ({ 
  initialCase, 
  endpoint, 
  mockables,
  triggerLabel,
  onSave,
  onDelete
}: { 
  initialCase: SimulationTestCase; 
  endpoint: Endpoint;
  mockables: { id: string, label: string, type: string, description: string, isInitial?: boolean }[];
  triggerLabel: string;
  onSave: (updated: SimulationTestCase) => void;
  onDelete: () => void;
}) => {
  const [headers, setHeaders] = useState<Parameter[]>(() => 
    endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: initialCase.request?.headers?.[(h.name || "").toLowerCase()] ?? h.defaultValue ?? "" })) || []
  );
  
  const [params, setParams] = useState<Parameter[]>(() => 
    endpointInputParams(endpoint).map(param => ({ ...param, value: initialCase.request?.params?.[param.key || param.name] ?? param.value ?? "" }))
  );
  
  const [body, setBody] = useState<JSONValue | undefined>(initialCase.request?.body === undefined ? getInitialBody(endpoint) : initialCase.request.body);
  const [expectedStatus, setExpectedStatus] = useState<number | undefined>(initialCase.expectedStatus);
  const [expectedBody, setExpectedBody] = useState<JSONValue | undefined>(initialCase.expectedBody);
  const [mocks, setMocks] = useState<Record<string, { returnData: JSONValue; status: number }>>(initialCase.mocks || {});
  
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
       isMounted.current = true;
       return;
    }
    const handler = setTimeout(() => {
       const queryParams: Record<string, string> = {};
       params.forEach(p => { if (p.key) queryParams[p.key] = p.value || `[${p.type || "string"}]`; });
       const reqHeaders: Record<string, string> = {};
       headers.forEach(h => { if (h.key) reqHeaders[h.key.toLowerCase()] = h.value || ""; });
       
       onSave({
         ...initialCase,
         request: { headers: reqHeaders, params: queryParams, body },
         expectedStatus,
         expectedBody,
         mocks
       });
    }, 500);
    return () => clearTimeout(handler);
  }, [headers, params, body, expectedStatus, expectedBody, mocks]);

  return (
    <div className="flex flex-col gap-4 bg-secondary/5 border rounded-lg p-3 font-sans mt-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b pb-2">
         <span className="text-[10px] font-bold uppercase text-muted-foreground">{triggerLabel}</span>
         <AlertDialog>
           <AlertDialogTrigger asChild>
             <Button variant="ghost" size="sm" className="h-5 px-1.5 text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
               <Trash className="w-3 h-3" />
             </Button>
           </AlertDialogTrigger>
           <AlertDialogContent onClick={(e) => e.stopPropagation()}>
             <AlertDialogHeader>
               <AlertDialogTitle>Delete Test Case</AlertDialogTitle>
               <AlertDialogDescription>
                 Are you sure you want to delete this test case? This action cannot be undone.
               </AlertDialogDescription>
             </AlertDialogHeader>
             <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction onClick={() => onDelete()}>Delete</AlertDialogAction>
             </AlertDialogFooter>
           </AlertDialogContent>
         </AlertDialog>
      </div>

      {(params.length > 0 || headers.length > 0) && (
        <div className="flex flex-col gap-3">
          {params.map((param, idx) => (
            <div key={`param-${idx}`} className="flex items-center gap-2">
              <Label className="text-xs font-mono text-muted-foreground w-24 truncate">{param.key || param.name}</Label>
              <Input 
                className="h-7 text-xs bg-background flex-1" 
                value={param.value || ""} 
                placeholder={`[${param.type || "string"}]`}
                onChange={(e) => {
                  const newParams = [...params];
                  if (newParams[idx]) newParams[idx].value = e.target.value;
                  setParams(newParams);
                }}
              />
            </div>
          ))}
          {headers.map((header, idx) => (
            <div key={`header-${idx}`} className="flex items-center gap-2">
              <Label className="text-xs font-mono text-muted-foreground w-24 truncate">H: {header.key || header.name}</Label>
              <Input 
                className="h-7 text-xs bg-background flex-1" 
                value={header.value || ""} 
                placeholder={header.defaultValue || ""}
                onChange={(e) => {
                  const newHeaders = [...headers];
                  if (newHeaders[idx]) newHeaders[idx].value = e.target.value;
                  setHeaders(newHeaders);
                }}
              />
            </div>
          ))}
        </div>
      )}
      
      <div className="flex flex-col gap-2">
         <JsonPayloadEditor title="Request Body" schema={endpoint.requestBody} value={body} onChange={setBody} />
      </div>

      {mockables.length > 0 && mockables.map(m => (
         <div key={m.id} className="flex flex-col gap-2 pt-3 border-t">
           <h5 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
             <span className="normal-case font-mono bg-background border px-1 rounded text-[9px]">{m.label}</span>
             <span className="px-1 py-0.5 rounded text-[8px] uppercase tracking-wider font-mono border bg-secondary text-muted-foreground">{m.description}</span>
           </h5>
           <div className="flex items-center gap-2">
             <Label className="text-xs font-mono text-muted-foreground w-24">Status</Label>
             <Input 
               type="number" 
               placeholder="200" 
               className="h-7 text-xs font-mono bg-background w-24"
               value={m.isInitial ? (expectedStatus || "") : (mocks[m.id]?.status || "")}
               onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : undefined;
                  if (m.isInitial) {
                      setExpectedStatus(val);
                  } else {
                      setMocks(prev => ({ ...prev, [m.id]: { ...(prev[m.id] || { returnData: {} }), status: val || 200 } }));
                  }
               }}
             />
           </div>
           <JsonPayloadEditor
              title="Expected Output"
              value={m.isInitial ? expectedBody : mocks[m.id]?.returnData}
              onChange={(val) => {
                  if (m.isInitial) {
                      setExpectedBody(val);
                  } else {
                      setMocks(prev => ({ ...prev, [m.id]: { ...(prev[m.id] || { status: 200 }), returnData: val } }));
                  }
              }}
           />
         </div>
      ))}
    </div>
  )
}
