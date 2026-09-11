import React from "react";
import { BackendNode, AnyMessagingResource } from "@/types/canvas";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@workspace/ui/components/combobox";
import { SchemaEditor } from "../../backend-nodes/graph-nodes/Editors";
import { LocalInput } from "../../backend-nodes/graph-nodes/shared";
import { ConfigItemData } from "./types";

interface CacheConfigProps {
  item: ConfigItemData;
  nodes: BackendNode[];
  handleUpdate: (eventId: string, changes: Partial<AnyMessagingResource>) => void;
}

export const CacheConfig: React.FC<CacheConfigProps> = ({
  item,
  nodes,
  handleUpdate,
}) => {
  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border bg-primary/5 p-4 shadow-sm border-primary/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">
            AI fill
            <Badge className="ml-2">Beta</Badge>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocalInput
            className="flex-1 text-xs bg-background/50"
            placeholder="e.g. User profile cache with fields username, email."
            value={""}
            onChange={(e) =>
              handleUpdate(item.id, { description: e.target.value })
            }
          />
          <Button
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={async (e) => {
              const btn = e.currentTarget;
              const originalText = btn.innerText;
              btn.innerText = "Generating...";
              btn.disabled = true;
              try {
                const description = item?.description || item?.name;
                const res = await fetch("/api/cache-ai", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ description }),
                });
                if (res.ok) {
                  const config = await res.json();
                  handleUpdate(item.id, {
                    namespace: config.namespace,
                    keyPattern: config.keyPattern,
                    ttl: config.ttl,
                    cacheStrategy: config.cacheStrategy,
                    sourceOfTruth: config.sourceOfTruth,
                    invalidationRules: config.invalidationRules,
                    serialization: config.serialization,
                    cacheEviction: config.cacheEviction,
                    replication: config.replication,
                    persistence: config.persistence,
                    compression: config.compression,
                    maxObjectSize: config.maxObjectSize,
                    payloadSchema: config.payloadSchema,
                  });
                }
              } catch (err) {
                console.error(err);
              } finally {
                btn.innerText = originalText;
                btn.disabled = false;
              }
            }}
          >
            Generate
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Identity
        </span>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Namespace
          </span>
          <LocalInput
            className="text-xs font-mono"
            placeholder="e.g. user:profile"
            value={item.namespace || item.keyPrefix || ""}
            onBlur={(e) =>
              handleUpdate(item.id, {
                namespace: e.target.value,
                keyPrefix: e.target.value,
              })
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Key Pattern
          </span>
          <LocalInput
            className="text-xs font-mono"
            placeholder="e.g. user:{id}"
            value={item.keyPattern || ""}
            onBlur={(e) =>
              handleUpdate(item.id, { keyPattern: e.target.value })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Data
        </span>
        <SchemaEditor
          title="Cached Object Schema"
          schema={item.payloadSchema}
          onChange={(payloadSchema) =>
            handleUpdate(item.id, { payloadSchema })
          }
        />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Source of Truth
          </span>
          <Combobox
            value={item.sourceOfTruth || ""}
            onValueChange={(val) => {
              if (val) handleUpdate(item.id, { sourceOfTruth: val });
            }}
          >
            <ComboboxInput
              placeholder="e.g. Postgres.users"
              className="text-xs w-full"
              onBlur={(e) =>
                handleUpdate(item.id, { sourceOfTruth: e.target.value })
              }
            />
            <ComboboxContent>
              <ComboboxList>
                <ComboboxEmpty className={"bg-sidebar"}>
                  No tables found on canvas.
                </ComboboxEmpty>
                {nodes
                  .filter((n) => n.type === "entity" || n.type === "db_ref")
                  .map((n) => {
                    const label = n.data?.label || "Unnamed Table";
                    return (
                      <ComboboxItem key={n.id} value={label}>
                        {label}
                      </ComboboxItem>
                    );
                  })}
                </ComboboxList>
              </ComboboxContent>
          </Combobox>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Serialization
          </span>
          <Select
            value={item.serialization || "JSON"}
            onValueChange={(v) =>
              handleUpdate(item.id, { serialization: v })
            }
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="JSON" className="text-xs">
                JSON
              </SelectItem>
              <SelectItem value="MessagePack" className="text-xs">
                MessagePack
              </SelectItem>
              <SelectItem value="ProtoBuf" className="text-xs">
                ProtoBuf
              </SelectItem>
              <SelectItem value="String" className="text-xs">
                String
              </SelectItem>
              <SelectItem value="Binary" className="text-xs">
                Binary
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Behavior
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Cache Strategy
          </span>
          <Select
            value={item.cacheStrategy || "Cache Aside"}
            onValueChange={(v) =>
              handleUpdate(item.id, { cacheStrategy: v })
            }
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cache Aside" className="text-xs">
                Cache Aside
              </SelectItem>
              <SelectItem value="Read Through" className="text-xs">
                Read Through
              </SelectItem>
              <SelectItem value="Write Through" className="text-xs">
                Write Through
              </SelectItem>
              <SelectItem value="Write Behind" className="text-xs">
                Write Behind
              </SelectItem>
              <SelectItem value="Refresh Ahead" className="text-xs">
                Refresh Ahead
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            TTL (Time to Live)
          </span>
          <LocalInput
            className="w-24 text-xs text-right"
            placeholder="e.g. 3600s"
            value={item.ttl || ""}
            onBlur={(e) => handleUpdate(item.id, { ttl: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Invalidation Rules
          </span>
          <LocalInput
            className="text-xs"
            placeholder="e.g. On profile update"
            value={item.invalidationRules || ""}
            onBlur={(e) =>
              handleUpdate(item.id, { invalidationRules: e.target.value })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Infrastructure
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Eviction Policy
          </span>
          <Select
            value={item.cacheEviction || "volatile-lru"}
            onValueChange={(v) =>
              handleUpdate(item.id, { cacheEviction: v })
            }
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volatile-lru" className="text-xs">
                LRU (with TTL)
              </SelectItem>
              <SelectItem value="allkeys-lru" className="text-xs">
                LRU (All Keys)
              </SelectItem>
              <SelectItem value="volatile-lfu" className="text-xs">
                LFU (with TTL)
              </SelectItem>
              <SelectItem value="allkeys-lfu" className="text-xs">
                LFU (All Keys)
              </SelectItem>
              <SelectItem value="noeviction" className="text-xs">
                No Eviction
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Persistence
          </span>
          <Select
            value={item.persistence || "None"}
            onValueChange={(v) =>
              handleUpdate(item.id, { persistence: v })
            }
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None" className="text-xs">
                None
              </SelectItem>
              <SelectItem value="RDB" className="text-xs">
                RDB
              </SelectItem>
              <SelectItem value="AOF" className="text-xs">
                AOF
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Replication
          </span>
          <Select
            value={item.replication || "Standalone"}
            onValueChange={(v) =>
              handleUpdate(item.id, { replication: v })
            }
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Standalone" className="text-xs">
                Standalone
              </SelectItem>
              <SelectItem value="Primary/Replica" className="text-xs">
                Primary/Replica
              </SelectItem>
              <SelectItem value="Redis Cluster" className="text-xs">
                Redis Cluster
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Compression
          </span>
          <Select
            value={item.compression || "None"}
            onValueChange={(v) =>
              handleUpdate(item.id, { compression: v })
            }
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None" className="text-xs">
                None
              </SelectItem>
              <SelectItem value="gzip" className="text-xs">
                gzip
              </SelectItem>
              <SelectItem value="brotli" className="text-xs">
                brotli
              </SelectItem>
              <SelectItem value="lz4" className="text-xs">
                lz4
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
};
