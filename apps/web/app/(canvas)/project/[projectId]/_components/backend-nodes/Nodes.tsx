import React, { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Database, Table2, User, Globe, Plus, Check, X, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { COLUMN_TYPES } from "@/lib/schema/columnTypes";
import { SchemaGroupNode } from "./SchemaGroupNode";
import { Textarea } from "@workspace/ui/components/textarea";



// Graph nodes (Service, Database, Queue, External, Actor) are now imported from GraphNodes.tsx



type ColumnItem = NonNullable<BackendNode["data"]["columns"]>[0];

interface ColumnRowProps {
  col: ColumnItem;
  index: number;
  isEditing: boolean;
  setEditingIndex: (idx: number | null) => void;
  editingName: string;
  setEditingName: (name: string) => void;
  editingType: string;
  setEditingType: (type: string) => void;
  handleUpdate: (index: number, changes: Partial<ColumnItem>) => void;
  handleDelete: (index: number) => void;
  isVector: boolean;
  nameError: boolean;
  setNameError: (err: boolean) => void;
}

const ColumnRow = ({ 
  col, 
  index, 
  isEditing, 
  setEditingIndex, 
  editingName, 
  setEditingName, 
  editingType, 
  setEditingType, 
  handleUpdate, 
  handleDelete,
  isVector,
  nameError,
  setNameError
}: ColumnRowProps) => {
  const [expanded, setExpanded] = useState(false);

  const saveInlineEdit = () => {
    if (!editingName.trim()) {
      handleDelete(index);
      setEditingIndex(null);
      return;
    }
    handleUpdate(index, { name: editingName.trim(), type: editingType });
    setEditingIndex(null);
  };

  return (
    <div className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag">
      <Handle type="source" position={Position.Right} id={`source-${index}`} className="w-2 h-2 -right-1" style={{ top: '15px' }} />
      <Handle type="target" position={Position.Left} id={`target-${index}`} className="w-2 h-2 -left-1" style={{ top: '15px' }} />
      
      {isEditing ? (
        <div className="flex items-center gap-1 w-full nodrag">
          <Input 
            value={editingName} 
            onChange={(e) => { setEditingName(e.target.value); setNameError(false); }} 
            className={cn("h-6 text-xs flex-1 nodrag", nameError && "border-destructive")}
            placeholder="Name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") saveInlineEdit();
              if (e.key === "Escape") setEditingIndex(null);
            }}
          />
          <Select value={editingType} onValueChange={setEditingType}>
            <SelectTrigger className="h-6 text-[10px] px-1.5 w-[80px] py-0 nodrag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMN_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={saveInlineEdit}>
             <Check size={14} />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { 
          setEditingIndex(index); 
          setEditingName(col.name); 
          setEditingType(col.type || "VARCHAR"); 
          setNameError(false);
        }}>
          <div className="flex items-center gap-2 overflow-hidden">
            {col.isPrimaryKey && <Badge className="text-[9px] px-1 rounded font-bold" variant="secondary">PK</Badge>}
            {col.isForeignKey && <Badge className="text-[9px] px-1 rounded font-bold" variant="secondary">FK</Badge>}
            <span className="font-medium truncate max-w-[120px]">{col.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2 opacity-100 group-hover/row:opacity-100 transition-all">
            <span className="text-muted-foreground truncate max-w-[60px]">{col.type}</span>
            {col.isNotNull && <Badge className="text-[9px] px-1 rounded font-bold" variant="outline">NN</Badge>}
            {col.isUnique && <Badge className="text-[9px] px-1 rounded font-bold" variant="outline">UQ</Badge>}
            <div className="flex items-center gap-1">
              <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                 {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
              <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(index); }}>
                 <X size={14} />
              </div>
            </div>
          </div>
        </div>
      )}

      {expanded && !isEditing && (
        <div className="flex flex-col gap-3 pt-3 mt-2 border-t cursor-default nodrag" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Primary Key</Label>
            <Switch checked={!!col.isPrimaryKey} onCheckedChange={(val) => handleUpdate(index, { isPrimaryKey: val })} className="scale-75 origin-right" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Not Null</Label>
            <Switch checked={!!col.isNotNull} onCheckedChange={(val) => handleUpdate(index, { isNotNull: val })} className="scale-75 origin-right" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Unique</Label>
            <Switch checked={!!col.isUnique} onCheckedChange={(val) => handleUpdate(index, { isUnique: val })} className="scale-75 origin-right" />
          </div>
          <div className="flex flex-col gap-1.5 border-t pt-2 mt-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Foreign Key</Label>
              <Switch checked={!!col.isForeignKey} onCheckedChange={(val) => handleUpdate(index, { isForeignKey: val })} className="scale-75 origin-right" />
            </div>
            {col.isForeignKey && (
              <div className="flex items-center gap-1 mt-1">
                <Input 
                  className="h-6 text-[10px] px-1.5 flex-1 nodrag" 
                  placeholder="Ref Table" 
                  value={col.references?.table || ""} 
                  onChange={e => handleUpdate(index, { references: { ...col.references, table: e.target.value, column: col.references?.column || "" } })} 
                />
                <Input 
                  className="h-6 text-[10px] px-1.5 flex-1 nodrag" 
                  placeholder="Ref Column" 
                  value={col.references?.column || ""} 
                  onChange={e => handleUpdate(index, { references: { ...col.references, table: col.references?.table || "", column: e.target.value } })} 
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ColumnListProps {
  nodeId: string;
  items?: ColumnItem[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
  isVector: boolean;
}

const ColumnList = ({ nodeId, items = [], updateNode, data, isVector }: ColumnListProps) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("VARCHAR");
  const [nameError, setNameError] = useState(false);

  const handleAdd = () => {
    const newItems = [...items, { name: "", type: "VARCHAR" }];
    updateNode(nodeId, { data: { ...data, columns: newItems } });
    setEditingIndex(newItems.length - 1);
    setEditingName("");
    setEditingType("VARCHAR");
    setNameError(false);
  };

  const handleUpdate = (index: number, changes: Partial<ColumnItem>) => {
    let newCols = [...items];
    if (changes.name && changes.name.trim() !== "" && changes.name !== items[index]?.name) {
       const isDuplicate = newCols.some((c, idx) => idx !== index && c.name.toLowerCase() === changes.name!.toLowerCase());
       if (isDuplicate) {
         setNameError(true);
         return;
       }
    }
    newCols[index] = { ...newCols[index]!, ...changes };
    updateNode(nodeId, { data: { ...data, columns: newCols } });
  };

  const handleDelete = (index: number) => {
    let newCols = [...items];
    newCols.splice(index, 1);
    updateNode(nodeId, { data: { ...data, columns: newCols } });
  };

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        Columns
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((col, i) => (
          <ColumnRow
            key={i}
            col={col}
            index={i}
            isEditing={editingIndex === i}
            setEditingIndex={setEditingIndex}
            editingName={editingName}
            setEditingName={setEditingName}
            editingType={editingType}
            setEditingType={setEditingType}
            handleUpdate={handleUpdate}
            handleDelete={handleDelete}
            isVector={isVector}
            nameError={nameError && editingIndex === i}
            setNameError={setNameError}
          />
        ))}
      </div>
    </div>
  )
}


// --- Entity Node ---
export const EntityNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setNodesPendingDeletion = useBackendCanvasStore((s) => s.setNodesPendingDeletion);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(data.label);
  const [isEditingName, setIsEditingName] = useState(data.label === "");
  const [nameError, setNameError] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const nodeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isEditingName) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isEditingName]);

  const columns = data.columns || [];
  const indexes = data.indexes || [];

  const addIndex = () => {
    updateNode(id, {
      data: {
        ...data,
        indexes: [...indexes, { name: "", columns: "" }]
      }
    });
    setEditingIndex(indexes.length);
  };

  const updateIndexObj = (idx: number, changes: Partial<NonNullable<BackendNode["data"]["indexes"]>[0]>) => {
    const newIndexes = [...indexes];
    newIndexes[idx] = { ...newIndexes[idx], ...changes } as NonNullable<BackendNode["data"]["indexes"]>[0];
    updateNode(id, { data: { ...data, indexes: newIndexes } });
  };

  const saveName = (e?: React.FocusEvent | React.KeyboardEvent) => {
    let finalName = editingName.trim();
    if (!finalName) {
      if (!data.label) {
        const isBlur = e?.type === "blur";
        if (isBlur) {
          const relatedTarget = (e as React.FocusEvent).relatedTarget as Node | null;
          if (nodeRef.current?.contains(relatedTarget)) {
             const defaultName = "Untitled_Table";
             const latestNode = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
             if (latestNode) {
                 updateNode(id, { data: { ...latestNode.data, label: defaultName } });
             }
             setEditingName(defaultName);
             setNameError(false);
             setIsEditingName(false);
             return;
          }
        }

        const latestNode = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
        if (!latestNode) return;
        
        const latestCols = latestNode.data.columns || [];
        const latestIdxs = latestNode.data.indexes || [];
        
        const isEmpty = latestCols.length === 0 && latestIdxs.length === 0;
        const isInitial = latestCols.length === 1 && latestCols[0]?.name === "_id" && latestIdxs.length === 0;
        
        if (isEmpty || isInitial) {
          useBackendCanvasStore.getState().deleteNode(id);
        } else {
          const defaultName = "Untitled_Table";
          updateNode(id, { data: { ...latestNode.data, label: defaultName } });
          setEditingName(defaultName);
          setNameError(false);
          setIsEditingName(false);
        }
        return;
      }
      finalName = data.label; // revert to original valid name
      setEditingName(finalName);
      setNameError(false);
      setIsEditingName(false);
      return;
    }
    
    // Check global uniqueness for entities
    const allNodes = useBackendCanvasStore.getState().nodes;
    const exists = allNodes.some(n => n.id !== id && n.type === "entity" && n.data.label.toLowerCase() === finalName.toLowerCase());
    
    if (exists) {
      setNameError(true);
      if (e?.type === "blur") {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return;
    }
    
    setNameError(false);
    const latestNode = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
    if (latestNode) {
        updateNode(id, { data: { ...latestNode.data, label: finalName } });
    } else {
        updateNode(id, { data: { ...data, label: finalName } });
    }
    setEditingName(finalName);
    setIsEditingName(false);
  };

  return (
    <div 
      ref={nodeRef}
      tabIndex={-1}
      className={cn("shadow-md rounded-xl bg-card border-2 min-w-[250px] max-w-[350px] focus:outline-none", selected ? "border-primary" : "border-border")}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      <div className={cn("px-3 py-2 border-b flex items-center justify-between group rounded-t-[10px]", data.dbType === "vector" ? "bg-violet-500/10 text-violet-700 dark:text-violet-400" : "bg-secondary/80")}>
        <div className="flex items-center flex-1">
          {data.dbType === "vector" ? (
            <Database size={14} className="mr-2 shrink-0" />
          ) : (
            <Table2 size={14} className="mr-2 text-muted-foreground shrink-0" />
          )}
          {isEditingName ? (
            <div className="flex flex-1 items-center gap-1">
              <Input 
                ref={inputRef}
                value={editingName} 
                onChange={(e) => {
                  setEditingName(e.target.value);
                  if (nameError) setNameError(false);
                }} 
                className={cn("h-6 text-xs px-1", nameError && "border-destructive focus-visible:ring-destructive")} 
                autoFocus 
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName(e);
                  if (e.key === "Escape") {
                    setEditingName(data.label);
                    setNameError(false);
                    setIsEditingName(false);
                  }
                }}
                onBlur={saveName}
              />
            </div>
          ) : (
            <span 
              className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors flex-1 truncate"
              onClick={() => setIsEditingName(true)}
            >
              {data.label}
            </span>
          )}
        </div>
        <div 
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer ml-2 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            const cols = data.columns || [];
            const idxs = data.indexes || [];
            const isEmpty = cols.length === 0 && idxs.length === 0;
            const isInitial = cols.length === 1 && cols[0]?.name === "_id" && idxs.length === 0;
            
            if (!isEmpty && !isInitial) {
              const node = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
              if (node) setNodesPendingDeletion([node]);
            } else {
              useBackendCanvasStore.getState().deleteNode(id);
            }
          }}
        >
          <Trash2 size={14} />
        </div>
      </div>
      
      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Vector Collection Settings */}
      {data.dbType === "vector" && (
        <div className="flex flex-col gap-2 p-3 bg-secondary/10 border-b border-border/50 nodrag">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Embedding Model</span>
            <Input
              className="h-6 text-xs w-[140px] bg-background"
              placeholder="text-embedding-3-small"
              value={data.embeddingModel || ""}
              onChange={(e) => updateNode(id, { data: { ...data, embeddingModel: e.target.value } })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Dimensions</span>
            <Input
              type="number"
              className="h-6 text-xs w-20 text-right bg-background"
              placeholder="1536"
              value={data.dimensions ?? ""}
              onChange={(e) => updateNode(id, { data: { ...data, dimensions: parseInt(e.target.value) || undefined } })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Metric</span>
            <Select
              value={data.metric || "Cosine"}
              onValueChange={(v) => updateNode(id, { data: { ...data, metric: v as typeof data.metric } })}
            >
              <SelectTrigger className="h-6 text-xs w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Cosine" className="text-xs">Cosine</SelectItem>
                <SelectItem value="Dot Product" className="text-xs">Dot Product</SelectItem>
                <SelectItem value="Euclidean" className="text-xs">Euclidean</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <ColumnList 
        nodeId={id} 
        items={columns} 
        updateNode={updateNode} 
        data={data} 
        isVector={data.dbType === "vector"} 
      />

      {/* Indexes Section */}
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        Indexes
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={addIndex}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {indexes.map((idxObj, i) => {
          const isEditing = editingIndex === i;
          return (
            <div key={i} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20">
              {isEditing ? (
                <div 
                  className="flex flex-col gap-1 w-full"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      const newIdxs = [...indexes];
                      if (newIdxs[i]?.name.trim() === "") {
                        newIdxs.splice(i, 1);
                        updateNode(id, { data: { ...data, indexes: newIdxs } });
                      }
                      setEditingIndex(null);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Input 
                      value={idxObj.name} 
                      onChange={(e) => updateIndexObj(i, { name: e.target.value })} 
                      className="h-6 text-xs flex-1"
                      placeholder="Index name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          const newIdxs = [...indexes];
                          if (newIdxs[i]?.name.trim() === "") {
                            newIdxs.splice(i, 1);
                            updateNode(id, { data: { ...data, indexes: newIdxs } });
                          }
                          setEditingIndex(null);
                        }
                      }}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                       <input 
                         type="checkbox" 
                         id={`unique-${i}`}
                         checked={!!idxObj.isUnique} 
                         onChange={(e) => updateIndexObj(i, { isUnique: e.target.checked })}
                         className="w-3 h-3"
                       />
                       <label htmlFor={`unique-${i}`} className="text-[10px]">UQ</label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto pr-1">
                    {columns.filter(c => c.name.trim() !== "").map(col => {
                      const selectedCols = (idxObj.columns || "").split(',').map(s => s.trim()).filter(Boolean);
                      const isSelected = selectedCols.includes(col.name);
                      return (
                        <div 
                          key={col.name}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            let newCols = [...selectedCols];
                            if (isSelected) {
                              newCols = newCols.filter(c => c !== col.name);
                            } else {
                              newCols.push(col.name);
                            }
                            updateIndexObj(i, { columns: newCols.join(", ") });
                          }}
                          className={cn(
                            "nodrag px-1.5 py-0.5 rounded text-[10px] cursor-pointer border transition-colors select-none", 
                            isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary"
                          )}
                        >
                          {col.name}
                        </div>
                      )
                    })}
                    {columns.filter(c => c.name.trim() !== "").length === 0 && (
                      <span className="text-[10px] text-muted-foreground italic px-1">Add columns to table first</span>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  className="flex flex-col w-full cursor-pointer"
                  onClick={() => setEditingIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-medium truncate max-w-[120px]">{idxObj.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {idxObj.isUnique && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded font-bold">UQ</span>}
                      <div 
                        className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newIdxs = [...indexes];
                          newIdxs.splice(i, 1);
                          updateNode(id, { data: { ...data, indexes: newIdxs } });
                        }}
                      >
                        <X size={12} />
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate w-full mt-0.5">
                    ({idxObj.columns || "no columns"})
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="h-2 w-full border-t border-transparent rounded-b-[10px]" />
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
};

// Import Graph Nodes
import { 
  ServiceNode, 
  DatabaseTableRefNode, 
  QueueNode,
  PubSubNode,
  EventStreamNode,
  KafkaNode,
  RedisStreamsNode,
  SQSNode,
  RedisPubSubNode,
  RedisCacheNode,
  StorageNode,
  ExternalNode, 
  WebClientNode,
  // New nodes
  WorkerNode,
  ServerlessNode,
  SearchIndexNode,
  APIGatewayNode,
  LoadBalancerNode,
  WebhookNode,
  LLMNode,
  MCPServerNode,
  VectorDBRefNode,
  IdentityProviderNode,
} from "./graph-nodes";
import { Badge } from "@workspace/ui/components/badge";

// Map for React Flow
export const nodeTypes = {
  service: ServiceNode,
  db_ref: DatabaseTableRefNode,
  queue: QueueNode,
  pubsub: PubSubNode,
  eventstream: EventStreamNode,
  kafka: KafkaNode,
  "redis-streams": RedisStreamsNode,
  sqs: SQSNode,
  "redis-pubsub": RedisPubSubNode,
  "redis-cache": RedisCacheNode,
  storage: StorageNode,
  entity: EntityNode,
  external: ExternalNode,
  webClient: WebClientNode,
  group: SchemaGroupNode,
  // New nodes
  worker: WorkerNode,
  serverless: ServerlessNode,
  search_index: SearchIndexNode,
  api_gateway: APIGatewayNode,
  load_balancer: LoadBalancerNode,
  webhook: WebhookNode,
  llm: LLMNode,
  mcp_server: MCPServerNode,
  vector_db_ref: VectorDBRefNode,
  identity_provider: IdentityProviderNode,
};
