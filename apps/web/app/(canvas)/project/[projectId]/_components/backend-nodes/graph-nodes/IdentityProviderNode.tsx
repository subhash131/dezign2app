import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Key, Settings, Plus, Check, X } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, LocalInput, generateId } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Button } from "@workspace/ui/components/button";
import { IdentityProvider } from "@workspace/canvas/types";
import { ProviderPresetCombobox, LABEL_TO_KEY } from "../../ProviderPresetCombobox";
import { IDENTITY_PROVIDER_PRESETS } from "@workspace/canvas";

const ProviderRow = ({ 
  nodeId, 
  item, 
  isEditing, 
  setEditingId, 
  setEditingName,
  handleUpdate, 
  handleDelete 
}: {
  nodeId: string;
  item: IdentityProvider;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  handleUpdate: (id: string, updates: Partial<IdentityProvider>) => void;
  handleDelete: (id: string) => void;
}) => {
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);
  const [localName, setLocalName] = useState(item.name || "");

  const isProviderEmpty = () => {
    const currentName = isEditing ? localName : (item.name || "");
    return currentName.trim().length === 0;
  };

  const isCustom = item.provider === "Custom JWT";
  const actualPresetKey = Object.entries(IDENTITY_PROVIDER_PRESETS).find(([_, v]) => v.provider === item.provider)?.[0] || "custom";
  const preset = IDENTITY_PROVIDER_PRESETS[actualPresetKey as keyof typeof IDENTITY_PROVIDER_PRESETS];
  const capabilities = isCustom ? (item.customCapabilities || preset?.capabilities || {}) : (preset?.capabilities || {});
  const outputs = isCustom ? (item.customOutputs || preset?.outputs || {}) : (preset?.outputs || {});

  return (
    <div 
      className="flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag"
      onBlur={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!e.currentTarget.contains(related)) {
          if (isProviderEmpty()) {
            handleDelete(item.id);
            if (isEditing) setEditingId(null);
          } else if (isEditing) {
            const wasEmpty = !item.name;
            handleUpdate(item.id, { name: localName.trim() });
            if (wasEmpty && localName.trim()) {
              setActiveConfigItem({ type: 'identityProvider', id: item.id, nodeId });
            }
            setEditingId(null);
          }
        }
      }}
    >
      <div className="absolute -right-1 top-0 bottom-0 flex flex-col justify-center gap-1.5 py-1 z-10">
        <Handle type="source" position={Position.Right} id={`out-${item.id}`} className="w-1.5 h-1.5 !relative !transform-none !right-0 !top-0 bg-blue-500 rounded-sm" title="Identity Provider" />
      </div>

      <div className="flex flex-col px-3 py-1.5 nodrag">
        {isEditing ? (
           <div className="flex items-center gap-1 w-full nodrag">
             <ProviderPresetCombobox 
                inputValue={localName}
                onInputValueChange={setLocalName}
                onValueChange={(label: string | null) => {
                  if (!label) return;
                  const key = LABEL_TO_KEY[label];
                  const preset = key ? IDENTITY_PROVIDER_PRESETS[key as keyof typeof IDENTITY_PROVIDER_PRESETS] : null;
                  
                  const updates: Partial<IdentityProvider> = preset ? {
                    name: preset.provider,
                    provider: preset.provider,
                    issuerUrl: preset.issuerUrl,
                    jwksUrl: preset.jwksUrl,
                    supportedAlgorithms: [...preset.supportedAlgorithms],
                    customCapabilities: { ...preset.capabilities },
                    customOutputs: { ...preset.outputs }
                  } : { name: label };
                  
                  handleUpdate(item.id, updates);
                  
                  const wasEmpty = !item.name;
                  if (wasEmpty) setActiveConfigItem({ type: 'identityProvider', id: item.id, nodeId });
                  
                  setEditingId(null);
                }}
                className="h-7 text-xs flex-1 nodrag"
                contentClassName="bg-popover! z-[999]"
                placeholder="e.g. Auth0, Keycloak..."
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Escape") {
                     if (!item.name) handleDelete(item.id);
                     setEditingId(null);
                  }
                }}
             />
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => {
                  if (!localName.trim()) handleDelete(item.id);
                  else {
                    const wasEmpty = !item.name;
                    handleUpdate(item.id, { name: localName.trim() });
                    if (wasEmpty) setActiveConfigItem({ type: 'identityProvider', id: item.id, nodeId });
                  }
                  setEditingId(null);
              }}>
                 <Check size={14} />
              </Button>
           </div>
        ) : (
          <div className="flex flex-col w-full gap-1.5">
            <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setLocalName(item.name || ""); }}>
               <div className="flex items-center gap-2 overflow-hidden">
                 <span className="font-medium truncate">{item.name}</span>
                 {item.provider && (
                   <span className="text-[10px] text-muted-foreground opacity-70">
                     ({item.provider})
                   </span>
                 )}
               </div>
               <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                  <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setActiveConfigItem({ type: 'identityProvider', id: item.id, nodeId }); }}>
                     <Settings size={14} />
                  </div>
                  <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                     <X size={14} />
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ProviderList = ({
  nodeId,
  title,
}: {
  nodeId: string;
  title: string;
}) => {
  const items = useBackendCanvasStore(s => s.identityProviders).filter(p => p.nodeId === nodeId);
  const addIdentityProvider = useBackendCanvasStore(s => s.addIdentityProvider);
  const updateIdentityProvider = useBackendCanvasStore(s => s.updateIdentityProvider);
  const deleteIdentityProvider = useBackendCanvasStore(s => s.deleteIdentityProvider);

  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    const newProvider: IdentityProvider = { id: generateId(), name: "" };
    addIdentityProvider(nodeId, newProvider);
    setEditingId(newProvider.id);
  };

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        <span>{title}</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity p-0" 
          onClick={(e) => { e.stopPropagation(); handleAdd(); }}
        >
          <Plus size={12} />
        </Button>
      </div>
      
      {items.length === 0 && !editingId ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center bg-secondary/10 flex items-center justify-center gap-2 cursor-pointer hover:bg-secondary/20 transition-colors" onClick={handleAdd}>
            <Plus size={12}/>
          <span className="opacity-70">Add Provider</span>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <ProviderRow
              key={item.id}
              nodeId={nodeId}
              item={item}
              isEditing={editingId === item.id}
              setEditingId={setEditingId}
              setEditingName={() => {}}
              handleUpdate={(id, updates) => updateIdentityProvider(id, updates)}
              handleDelete={(id) => deleteIdentityProvider(id)}
            />
          ))}
        </div>
      )}
    </>
  );
};

export const IdentityProviderNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const updateData = (changes: Partial<BackendNode["data"]>) =>
    updateNode(id, { data: { ...data, ...changes } });

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Key} title="Identity Provider" colorClass="bg-blue-500/10 text-blue-700 dark:text-blue-400" selected={selected} />
      
      <div className="px-3 py-2 bg-secondary/5 nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateData({ description: e.target.value })}
        />
      </div>

      <ProviderList nodeId={id} title="Providers" />
    </div>
  );
};
