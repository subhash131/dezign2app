import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import {
  Network,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash,
  Settings,
} from "lucide-react";
import { BackendNode, AuthRule, IdentityProvider } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EndpointList } from "../../common";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";

const authTypes = [
  { label: "JWT", value: "jwt" },
  { label: "OAuth2", value: "oauth2" },
  { label: "API Key", value: "apiKey" },
  { label: "mTLS", value: "mtls" },
  { label: "Basic", value: "basic" },
  { label: "None", value: "none" },
];

export const APIGatewayNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<{ id: string; name: string } | null>(null);
  const rules = data.authRules || [];

  const updateData = (changes: Partial<BackendNode["data"]>) =>
    updateNode(id, { data: { ...data, ...changes } });

  const addRule = () => {
    const rule: AuthRule = {
      id: crypto.randomUUID(),
      name: "",
      type: "none",
      description: "",
    };
    updateData({ authRules: [...rules, rule] });
  };

  const updateRule = (ruleId: string, newRule: AuthRule) =>
    updateData({
      authRules: rules.map((rule) => (rule.id === ruleId ? newRule : rule)),
    });

  const deleteRule = (ruleId: string) => {
    endpoints
      .filter(
        (endpoint) => endpoint.nodeId === id && endpoint.authRuleId === ruleId,
      )
      .forEach((endpoint) =>
        updateEndpoint(endpoint.id, { authRuleId: undefined }),
      );
    updateData({
      authRules: rules.filter((rule) => rule.id !== ruleId),
    });
  };

  const hasPipelineError = useNodePipelineError(id);

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[320px] max-w-[440px] flex flex-col transition-all duration-300 relative",
        hasPipelineError
          ? cn(
              "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
              selected && "ring-2 ring-destructive/60 border-destructive",
            )
          : selected
          ? "border-primary"
          : "border-border",
      )}
    >
      <NodeHeader
        id={id}
        data={data}
        icon={Network}
        title="API Gateway"
        colorClass="bg-teal-500/10 text-teal-700 dark:text-teal-400"
        selected={selected}
        badges={
          hasPipelineError ? (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 text-[9px] font-semibold shrink-0"
              title="Pipeline has unmapped required inputs! Check endpoints."
            >
              <AlertTriangle size={10} className="shrink-0" />
              <span>Pipeline Error</span>
            </div>
          ) : undefined
        }
      />

      {/* Pipeline unmapped error banner */}
      {hasPipelineError && (
        <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/25 flex items-center gap-1.5 text-[10px] text-destructive font-medium leading-tight nodrag">
          <AlertCircle size={12} className="shrink-0 text-destructive animate-pulse" />
          <span>Required pipeline field(s) not mapped</span>
        </div>
      )}

      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateData({ description: e.target.value })}
        />
      </div>

      <section className="border-b nodrag">
        <div className="px-3 py-1 bg-secondary/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
          <span>Auth Rules</span>
          <button
            type="button"
            aria-label="Add auth rule"
            className="text-muted-foreground hover:text-foreground"
            onClick={addRule}
          >
            <Plus size={12} />
          </button>
        </div>
        {rules.map((rule) => {
          return (
            <div
              key={rule.id}
              className="px-3 py-2 border-t first:border-t-0 flex flex-col gap-1.5 group/rule"
            >
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-6 text-xs flex-1 bg-background"
                  placeholder="Rule name"
                  value={rule.name}
                  onChange={(e) =>
                    updateRule(rule.id, { ...rule, name: e.target.value })
                  }
                />
                <Select
                  value={rule.type}
                  onValueChange={(newType) => {
                    const base = {
                      id: rule.id,
                      name: rule.name,
                      description: rule.description,
                    };
                    switch (newType) {
                      case "jwt":
                        updateRule(rule.id, {
                          ...base,
                          type: "jwt",
                          config: {},
                        });
                        break;
                      case "oauth2":
                        updateRule(rule.id, {
                          ...base,
                          type: "oauth2",
                          config: {},
                        });
                        break;
                      case "apiKey":
                        updateRule(rule.id, {
                          ...base,
                          type: "apiKey",
                          config: {},
                        });
                        break;
                      case "mtls":
                        updateRule(rule.id, {
                          ...base,
                          type: "mtls",
                          config: {},
                        });
                        break;
                      case "basic":
                        updateRule(rule.id, { ...base, type: "basic" });
                        break;
                      case "none":
                        updateRule(rule.id, { ...base, type: "none" });
                        break;
                    }
                  }}
                >
                  <SelectTrigger className="h-6 text-[11px] w-[92px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {authTypes.map((t) => (
                      <SelectItem
                        key={t.value}
                        value={t.value}
                        className="text-xs"
                      >
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  aria-label="Configure auth rule"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setActiveConfigItem({
                      type: "authRule",
                      id: rule.id,
                      nodeId: id,
                    })
                  }
                >
                  <Settings size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Delete auth rule"
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={() => setRuleToDelete({ id: rule.id, name: rule.name || "Auth Rule" })}
                >
                  <Trash size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {rules.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            Add reusable policies such as Public, User JWT, Admin, or Internal.
          </div>
        )}
      </section>

      {/* Delete Rule Confirmation Dialog */}
      <AlertDialog open={!!ruleToDelete} onOpenChange={(open) => !open && setRuleToDelete(null)}>
        <AlertDialogContent
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111216] border-zinc-800 text-zinc-100 max-w-md shadow-2xl ring-1 ring-white/10"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100 font-semibold">
              Delete Auth Rule "{ruleToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-xs leading-relaxed">
              Are you sure you want to delete this auth rule policy from the API Gateway? Endpoints referencing this policy will revert to unauthenticated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setRuleToDelete(null)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:text-zinc-100"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ruleToDelete) {
                  deleteRule(ruleToDelete.id);
                  setRuleToDelete(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Delete Rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EndpointList nodeId={id} title="Endpoints" />

      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
        <div
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground">
            Advanced
          </span>
          <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground">
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        {advancedOpen && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50 nodrag">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                Implementation
              </Label>
              <Select
                value={data.implementation || "__none__"}
                onValueChange={(v) =>
                  updateData({
                    implementation: v === "__none__" ? undefined : v,
                  })
                }
              >
                <SelectTrigger className="h-6 text-xs w-[160px]">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">
                    Select...
                  </SelectItem>
                  {[
                    "AWS API Gateway",
                    "Kong",
                    "Nginx",
                    "Traefik",
                    "Custom",
                    "Other",
                  ].map((value) => (
                    <SelectItem key={value} value={value} className="text-xs">
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                Rate Limit
              </Label>
              <Input
                className="h-6 text-xs w-[130px] bg-background text-right"
                placeholder="1000/min"
                value={data.rateLimit || ""}
                onChange={(e) => updateData({ rateLimit: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                Timeout
              </Label>
              <Input
                className="h-6 text-xs w-[130px] bg-background text-right"
                placeholder="30s"
                value={data.timeout || ""}
                onChange={(e) => updateData({ timeout: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                CORS Origins
              </Label>
              <Input
                className="h-6 text-xs w-[180px] bg-background"
                placeholder="* or https://app.example.com"
                value={data.corsOrigins || ""}
                onChange={(e) =>
                  updateData({
                    cors: Boolean(e.target.value),
                    corsOrigins: e.target.value,
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
