import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { LocalTextarea, LocalInput } from "../backend-nodes/graph-nodes/shared";
import { SchemaEditor } from "../backend-nodes/graph-nodes/Editors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

interface SearchIndexConfigProps {
  id: string;
  nodeId: string;
}

export const SearchIndexConfig = ({ id, nodeId }: SearchIndexConfigProps) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const parentNode = nodes.find((n) => n.id === nodeId);
  if (!parentNode) return null;

  const item = parentNode.data.searchIndexes?.find((idx) => idx.id === id);
  if (!item) return null;

  const tableRefNodes = nodes.filter((n) => n.type === "entity" || n.type === "db_ref" || n.type === "vector_db_ref");
  const redisNodes = nodes.filter((n) => ["redis-cache", "redis-pubsub", "redis-streams"].includes(n.type));
  const kafkaNodes = nodes.filter((n) => n.type === "kafka");
  const apiNodes = nodes.filter((n) => ["service", "api_gateway", "serverless"].includes(n.type));

  const handleUpdate = (changes: any) => {
    if (parentNode.data.searchIndexes) {
      const updatedList = parentNode.data.searchIndexes.map((idx) =>
        idx.id === id ? { ...idx, ...changes } : idx
      );
      updateNode(nodeId, { data: { ...parentNode.data, searchIndexes: updatedList } });
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-sky-500/15 text-sky-500 rounded border border-sky-500/20 shadow-sm">
            INDEX
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {item.name || "Untitled Index"}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Configure index properties, mappings, and schemas.
        </span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Description
        </span>
        <LocalTextarea
          className="min-h-[60px] text-sm resize-none bg-background/50 focus-visible:ring-1"
          placeholder="Describe what data this index stores..."
          value={item.description || ""}
          onBlur={(e) => handleUpdate({ description: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Analyzer Override
        </span>
        <LocalInput
          className="h-8 text-sm bg-background/50 focus-visible:ring-1"
          placeholder="e.g. standard (leave empty to use global)"
          value={item.analyzer || ""}
          onBlur={(e) => handleUpdate({ analyzer: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data Source (Optional)
          </span>
          <span className="text-[10px] text-muted-foreground">
            Visual edges can also represent this. Add explicit details here if needed.
          </span>
        </div>
        <div className="flex flex-col gap-2.5 mt-1">
          <Select 
            value={item.dataSourceType || "None"} 
            onValueChange={(v) => handleUpdate({ dataSourceType: v === "None" ? undefined : v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select Data Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None" className="text-xs">None</SelectItem>
              <SelectItem value="Database" className="text-xs">Database</SelectItem>
              <SelectItem value="Kafka" className="text-xs">Kafka</SelectItem>
              <SelectItem value="API" className="text-xs">API</SelectItem>
              <SelectItem value="Redis" className="text-xs">Redis</SelectItem>
              <SelectItem value="File Storage" className="text-xs">File Storage</SelectItem>
              <SelectItem value="Manual" className="text-xs">Manual</SelectItem>
            </SelectContent>
          </Select>

          {item.dataSourceType === "Database" && (
            <div className="flex flex-col gap-2.5 p-3 rounded-md border bg-background/50 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-20 shrink-0">Table Ref</span>
                <Select value={item.dbTable || ""} onValueChange={(v) => handleUpdate({ dbTable: v })}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select Table Reference..." /></SelectTrigger>
                  <SelectContent>
                    {tableRefNodes.length === 0 && <SelectItem value="none" disabled className="text-xs">No table refs found</SelectItem>}
                    {tableRefNodes.map(n => (
                      <SelectItem key={n.id} value={n.id} className="text-xs">{n.data.label || "Untitled Table Ref"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-20 shrink-0">Primary Key</span>
                <LocalInput className="h-7 text-xs flex-1" placeholder="e.g. id" value={item.dbPrimaryKey || ""} onBlur={(e) => handleUpdate({ dbPrimaryKey: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-20 shrink-0">Sync Mode</span>
                <Select value={item.dbSyncMode || ""} onValueChange={(v) => handleUpdate({ dbSyncMode: v })}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Real-time (CDC)" className="text-xs">Real-time (CDC)</SelectItem>
                    <SelectItem value="Event-driven" className="text-xs">Event-driven</SelectItem>
                    <SelectItem value="Batch" className="text-xs">Batch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {item.dataSourceType === "Redis" && (
            <div className="flex flex-col gap-2.5 p-3 rounded-md border bg-background/50 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0">Redis Service</span>
                <Select value={item.redisNodeId || ""} onValueChange={(v) => handleUpdate({ redisNodeId: v })}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select Redis Node..." /></SelectTrigger>
                  <SelectContent>
                    {redisNodes.length === 0 && <SelectItem value="none" disabled className="text-xs">No Redis nodes found</SelectItem>}
                    {redisNodes.map(n => (
                      <SelectItem key={n.id} value={n.id} className="text-xs">{n.data.label || n.type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {item.dataSourceType === "File Storage" && (
            <div className="flex flex-col gap-2.5 p-3 rounded-md border bg-background/50 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0">File URL</span>
                <LocalInput className="h-7 text-xs flex-1" placeholder="e.g. s3://bucket/data.csv" value={item.fileLink || ""} onBlur={(e) => handleUpdate({ fileLink: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Description</span>
                <LocalTextarea className="min-h-[60px] text-xs bg-background/50 focus-visible:ring-1" placeholder="Describe the file format, schema, or content..." value={item.fileDescription || ""} onBlur={(e) => handleUpdate({ fileDescription: e.target.value })} />
              </div>
            </div>
          )}

          {item.dataSourceType === "Manual" && (
            <div className="flex flex-col gap-2.5 p-3 rounded-md border bg-background/50 mt-1">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Details</span>
                <LocalTextarea className="min-h-[80px] text-xs bg-background/50 focus-visible:ring-1" placeholder="Describe the manual ingestion process..." value={item.manualDetails || ""} onBlur={(e) => handleUpdate({ manualDetails: e.target.value })} />
              </div>
            </div>
          )}

          {item.dataSourceType === "Kafka" && (
            <div className="flex flex-col gap-2.5 p-3 rounded-md border bg-background/50 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0">Topic</span>
                <Select value={item.kafkaTopic || ""} onValueChange={(v) => handleUpdate({ kafkaTopic: v })}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select Topic..." /></SelectTrigger>
                  <SelectContent>
                    {kafkaNodes.flatMap(n => n.data.topics || []).length === 0 && <SelectItem value="none" disabled className="text-xs">No topics found</SelectItem>}
                    {kafkaNodes.flatMap(n => (n.data.topics || []).map(t => ({ ...t, brokerName: n.data.label }))).map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.brokerName ? `${t.brokerName} / ` : ""}{t.name || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0">Document ID</span>
                <LocalInput className="h-7 text-xs flex-1" placeholder="e.g. userId" value={item.kafkaDocumentId || ""} onBlur={(e) => handleUpdate({ kafkaDocumentId: e.target.value })} />
              </div>
            </div>
          )}

          {item.dataSourceType === "API" && (
            <div className="flex flex-col gap-2.5 p-3 rounded-md border bg-background/50 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0">Endpoint</span>
                <Select value={item.apiEndpoint || ""} onValueChange={(v) => handleUpdate({ apiEndpoint: v })}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select Endpoint..." /></SelectTrigger>
                  <SelectContent>
                    {endpoints.filter(ep => apiNodes.some(n => n.id === ep.nodeId)).length === 0 && <SelectItem value="none" disabled className="text-xs">No endpoints found</SelectItem>}
                    {endpoints.filter(ep => apiNodes.some(n => n.id === ep.nodeId)).map(ep => {
                       const node = apiNodes.find(n => n.id === ep.nodeId);
                       return (
                         <SelectItem key={ep.id} value={ep.id} className="text-xs">
                           {node?.data.label ? `${node.data.label} / ` : ""}{ep.type} {ep.name || "Untitled"}
                         </SelectItem>
                       );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0">Poll Interval</span>
                <LocalInput className="h-7 text-xs flex-1" placeholder="e.g. 5 min" value={item.apiPollingInterval || ""} onBlur={(e) => handleUpdate({ apiPollingInterval: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <SchemaEditor
          title="Document Schema"
          schema={item.schema}
          onChange={(schema) => handleUpdate({ schema })}
        />
      </div>
    </div>
  );
};
