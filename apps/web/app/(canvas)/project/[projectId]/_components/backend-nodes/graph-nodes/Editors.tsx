import React, { useState } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Parameter, Schema, ProcessingStep } from "@/types/canvas";
import { generateId, LocalInput } from "./shared";

// --- Processing Steps Editor ---

export const ProcessingStepsEditor = ({ steps, onChange }: { steps: ProcessingStep[], onChange: (steps: ProcessingStep[]) => void }) => {
  const addStep = () => {
    onChange([...steps, { id: generateId(), text: "" }]);
  };

  const updateStep = (id: string, text: string) => {
    onChange(steps.map(s => s.id === id ? { ...s, text } : s));
  };

  const removeStep = (id: string) => {
    onChange(steps.filter(s => s.id !== id));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-muted-foreground uppercase">Processing Steps</span>
        <Plus size={12} className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={addStep} />
      </div>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center gap-1 group/step">
          <span className="text-[9px] text-muted-foreground font-mono w-4 text-right select-none">{index + 1}.</span>
          <LocalInput 
            className="h-6 text-[10px] px-1.5 flex-1 nodrag bg-background" 
            placeholder="Describe step..." 
            value={step.text || ""} 
            onChange={e => updateStep(step.id, e.target.value)} 
          />
          <X size={12} className="cursor-pointer opacity-0 group-hover/step:opacity-100 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeStep(step.id)} />
        </div>
      ))}
      {steps.length === 0 && (
        <span className="text-[10px] text-muted-foreground italic">No steps added</span>
      )}
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-muted-foreground uppercase">{title}</span>
        <Plus size={12} className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={addParam} />
      </div>
      {parameters.map((p) => (
        <div key={p.id} className="flex flex-col gap-1 border-l-2 border-border/50 pl-2 py-1 relative group/param">
          <div className="absolute -left-[7px] top-1.5 opacity-0 group-hover/param:opacity-100 bg-background rounded-full p-0.5 border shadow-sm">
             <X size={10} className="cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => removeParam(p.id)} />
          </div>
          <div className="flex items-center gap-1">
            <LocalInput 
              className="h-6 text-[10px] px-1.5 flex-1 nodrag bg-background font-mono" 
              placeholder="Name" 
              value={p.name || ""} 
              onChange={e => updateParam(p.id, { name: e.target.value })} 
            />
            <Select value={p.type} onValueChange={v => updateParam(p.id, { type: v })}>
              <SelectTrigger className="h-6 w-[75px] text-[10px] px-1.5 py-0 nodrag bg-background font-mono">
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
               className={`h-6 px-1.5 text-[9px] nodrag ${p.required ? 'text-primary font-bold bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:bg-secondary'}`}
               onClick={() => updateParam(p.id, { required: !p.required })}
            >
              REQ
            </Button>
          </div>
          <LocalInput 
             className="h-5 text-[9px] px-1.5 w-full nodrag bg-background/50 border-dashed" 
             placeholder="Description (optional)" 
             value={p.description || ""} 
             onChange={e => updateParam(p.id, { description: e.target.value })} 
          />
        </div>
      ))}
      {parameters.length === 0 && (
        <span className="text-[10px] text-muted-foreground italic">None defined</span>
      )}
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
