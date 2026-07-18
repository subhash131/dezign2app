import React from "react";
import { Plus, X, Text } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Parameter, Schema, ProcessingStep } from "@/types/canvas";
import { generateId, LocalInput, LocalTextarea } from "./shared";

// --- Processing Steps Editor ---

export const ProcessingStepsEditor = ({ steps, onChange }: { steps: ProcessingStep[], onChange: (steps: ProcessingStep[]) => void }) => {
  const addStep = () => {
    onChange([...steps, { id: generateId(), text: "", operation: "passthrough" }]);
  };

  const updateStep = (id: string, text: string) => {
    onChange(steps.map(s => s.id === id ? { ...s, text } : s));
  };

  const updateOperation = (id: string, operation: ProcessingStep["operation"]) => {
    onChange(steps.map(s => s.id === id ? { ...s, operation } : s));
  };

  const updateConfig = (id: string, raw: string) => {
    try {
      const config = raw.trim() ? JSON.parse(raw) : {};
      onChange(steps.map(s => s.id === id ? { ...s, config } : s));
    } catch {
      // Keep the last valid config while the user is typing JSON.
    }
  };

  const removeStep = (id: string) => {
    onChange(steps.filter(s => s.id !== id));
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Processing Steps</span>
        <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1 rounded-full px-3" onClick={addStep}>
          <Plus size={12} /> Add Step
        </Button>
      </div>
      
      <div className="flex flex-col gap-2.5 mt-1">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col gap-2 rounded-lg border bg-background/50 p-2.5 group/step transition-all hover:border-primary/30 hover:shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
                {index + 1}
              </div>
              <LocalInput
                className="h-7 text-xs flex-1 nodrag bg-background border-none shadow-none focus-visible:ring-1"
                placeholder="Describe this step..."
                value={step.text || ""}
                onBlur={e => updateStep(step.id, e.target.value)}
              />
              <Select value={step.operation || "passthrough"} onValueChange={(value) => updateOperation(step.id, value as ProcessingStep["operation"])}>
                <SelectTrigger className="h-7 w-[120px] text-xs nodrag bg-secondary/50 border-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['passthrough', 'validate', 'pick', 'omit', 'rename', 'set', 'filter', 'map', 'db_get', 'db_get_many', 'db_insert', 'db_update', 'db_delete', 'return'].map(operation => (
                    <SelectItem key={operation} value={operation} className="text-xs">{operation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/step:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 transition-all rounded-full" onClick={() => removeStep(step.id)}>
                <X size={14} />
              </Button>
            </div>
            {step.operation && step.operation !== "passthrough" && (
              <div className="pl-7 pr-9">
                <LocalTextarea
                  className="min-h-[48px] text-[11px] p-2 nodrag bg-secondary/30 font-mono border-dashed border-secondary-foreground/20 focus-visible:ring-1 focus-visible:border-solid rounded-md resize-none"
                  placeholder={'Config JSON, e.g. {"tableRef":"users-ref","where":{"id":"$request.params.userId"}}'}
                  value={JSON.stringify(step.config || {}, null, 2)}
                  onBlur={e => updateConfig(step.id, e.target.value)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Parameter / Schema Editor ---

export const ParameterEditor = ({ 
  title, 
  parameters, 
  onChange 
}: { 
  title: string, 
  parameters: Parameter[], 
  onChange: (params: Parameter[]) => void 
}) => {
  const addParam = () => {
    onChange([...parameters, { id: generateId(), name: "", type: "string", required: true }]);
  };

  const updateParam = (id: string, changes: Partial<Parameter>) => {
    onChange(parameters.map(p => p.id === id ? { ...p, ...changes } : p));
  };

  const removeParam = (id: string) => {
    onChange(parameters.filter(p => p.id !== id));
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1 rounded-full px-3" onClick={addParam}>
          <Plus size={12} /> Add Field
        </Button>
      </div>
      
      <div className="flex flex-col gap-2.5 mt-1">
        {parameters.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-lg border bg-background/50 p-2.5 relative group/param transition-all hover:border-primary/30 hover:shadow-sm">
            <div className="flex items-center gap-2">
              <LocalInput 
                className="h-7 text-xs flex-1 nodrag bg-background font-mono border-none shadow-none focus-visible:ring-1 placeholder:font-sans" 
                placeholder="Field name" 
                value={p.name || ""} 
                onBlur={e => updateParam(p.id, { name: e.target.value })} 
              />
              <Select value={p.type} onValueChange={v => updateParam(p.id, { type: v })}>
                <SelectTrigger className="h-7 w-[95px] text-xs py-0 nodrag bg-secondary/50 border-none font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string" className="text-xs">string</SelectItem>
                  <SelectItem value="number" className="text-xs">number</SelectItem>
                  <SelectItem value="boolean" className="text-xs">boolean</SelectItem>
                  <SelectItem value="UUID" className="text-xs">UUID</SelectItem>
                  <SelectItem value="timestamp" className="text-xs">timestamp</SelectItem>
                  <SelectItem value="object" className="text-xs">object</SelectItem>
                  <SelectItem value="array" className="text-xs">array</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                 variant="ghost" 
                 size="sm" 
                 className={`h-7 px-2.5 text-[10px] nodrag rounded-full transition-colors ${p.required ? 'text-primary font-bold bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground bg-secondary/50 hover:bg-secondary'}`}
                 onClick={() => updateParam(p.id, { required: !p.required })}
              >
                {p.required ? "REQUIRED" : "OPTIONAL"}
              </Button>
              {p.description === undefined && (
                <Button size="icon" variant="ghost" title="Add Description" className="h-7 w-7 opacity-0 group-hover/param:opacity-100 text-muted-foreground hover:bg-secondary shrink-0 transition-all rounded-full" onClick={() => updateParam(p.id, { description: "" })}>
                  <Text size={14} />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/param:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 transition-all rounded-full" onClick={() => removeParam(p.id)}>
                <X size={14} />
              </Button>
            </div>
            {p.description !== undefined && (
              <div className="relative w-full">
                <LocalInput 
                   className="h-6 text-[10px] pl-2.5 pr-6 w-full nodrag bg-transparent border-none shadow-none text-muted-foreground placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:bg-secondary/30 rounded" 
                   placeholder="Add a description..." 
                   value={p.description || ""} 
                   onBlur={e => updateParam(p.id, { description: e.target.value })} 
                />
                <Button size="icon" variant="ghost" className="h-5 w-5 absolute right-0.5 top-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 shrink-0 transition-all rounded" onClick={() => updateParam(p.id, { description: undefined })}>
                  <X size={10} />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const SchemaEditor = ({
  title,
  schema,
  onChange,
}: {
  title: string;
  schema: Schema | undefined;
  onChange: (schema: Schema) => void;
}) => {
  const safeSchema = schema || { id: generateId(), fields: [] };
  return (
    <ParameterEditor 
      title={title} 
      parameters={safeSchema.fields} 
      onChange={(fields) => onChange({ ...safeSchema, fields })} 
    />
  );
};
