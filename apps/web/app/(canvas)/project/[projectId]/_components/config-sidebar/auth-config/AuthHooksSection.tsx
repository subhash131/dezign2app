import React from "react";
import { LocalInput, LocalTextarea } from "./LocalInput";

import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Sparkles, Code2, Zap, Database, Plus, Trash, Wand2 } from "lucide-react";
import {
  AuthHookConfig,
  EndpointHookConfig,
  DbHookConfig,
  AUTH_DB_HOOK_PHASES,
  AUTH_DB_HOOK_OPERATIONS,
} from "@workspace/canvas";
import { AuthConfigSectionProps } from "./types";

const COMMON_ENDPOINTS = [
  { value: "/sign-up", label: "/sign-up" },
  { value: "/sign-in/email", label: "/sign-in/email" },
  { value: "/sign-out", label: "/sign-out" },
  { value: "/reset-password", label: "/reset-password" },
  { value: "/verify-email", label: "/verify-email" },
  { value: "/forget-password", label: "/forget-password" },
  { value: "custom", label: "Custom endpoint path..." },
];

const COMMON_MODELS = [
  { value: "user", label: "user" },
  { value: "session", label: "session" },
  { value: "account", label: "account" },
  { value: "organization", label: "organization" },
  { value: "member", label: "member" },
  { value: "custom", label: "Custom model/table..." },
];

function isHookPhase(val: string): val is "before" | "after" {
  return val === "before" || val === "after";
}

function isDbOperation(val: string): val is "create" | "update" | "delete" {
  return val === "create" || val === "update" || val === "delete";
}

function generateCodeFromPrompt(hook: AuthHookConfig): string {
  if (hook.hookType === "endpoint") {
    const path = hook.event || "/sign-up";
    const promptComment = hook.prompt ? `// ${hook.prompt}\n  ` : "";
    if (hook.phase === "before") {
      return `if (ctx.path === "${path}") {\n  ${promptComment}if (!ctx.body) {\n    throw new APIError("BAD_REQUEST", { message: "Invalid payload" });\n  }\n}`;
    } else {
      return `if (ctx.path === "${path}") {\n  ${promptComment}const newSession = ctx.context.newSession;\n  if (newSession) {\n    ctx.context.runInBackground(async () => {\n      // Execute background side-effects\n    });\n  }\n}`;
    }
  } else {
    const model = hook.model || "user";
    const op = hook.operation || "create";
    const phase = hook.phase || "after";
    const promptComment = hook.prompt ? `// ${hook.prompt}\n  ` : "";
    if (phase === "before") {
      return `async (${model}, ctx) => {\n  ${promptComment}return { data: { ...${model} } };\n}`;
    } else {
      return `async (${model}, ctx) => {\n  ${promptComment}// Perform post-${op} side effects\n}`;
    }
  }
}

export const AuthHooksSection: React.FC<AuthConfigSectionProps> = ({
  data,
  updateData,
  allNodes,
}) => {
  const rawHooks: AuthHookConfig[] = data.hooks || [];

  // Normalize legacy hooks saved in Convex DB prior to refactor
  const hooks: AuthHookConfig[] = rawHooks.map((h) => {
    if (!h.hookType) {
      if ("model" in h && h.model) {
        const op = ("operation" in h && typeof h.operation === "string" && isDbOperation(h.operation))
          ? h.operation
          : "create";
        const dbHook: DbHookConfig = {
          hookType: "db",
          model: h.model,
          operation: op,
          phase: h.phase || "after",
          enabled: h.enabled ?? true,
          mode: h.mode || "naturalLanguage",
          prompt: h.prompt,
          code: h.code,
        };
        return dbHook;
      } else {
        const eventMap: Record<string, string> = {
          onSignUp: "/sign-up",
          onSignIn: "/sign-in/email",
          onSignOut: "/sign-out",
          onPasswordReset: "/reset-password",
          onEmailVerify: "/verify-email",
        };
        const mappedEvent = (h.event && eventMap[h.event]) || h.event || "/sign-up";
        const epHook: EndpointHookConfig = {
          hookType: "endpoint",
          event: mappedEvent,
          phase: h.phase || "after",
          enabled: h.enabled ?? true,
          mode: h.mode || "naturalLanguage",
          prompt: h.prompt,
          code: h.code,
        };
        return epHook;
      }
    }
    return h;
  });

  // Filter hooks by type
  const endpointHooks = hooks.filter(
    (h): h is EndpointHookConfig => h.hookType === "endpoint"
  );
  const dbHooks = hooks.filter(
    (h): h is DbHookConfig => h.hookType === "db"
  );

  // Available entity nodes from canvas for model choices
  const entityNodes = (allNodes || []).filter((n) => n.type === "entity");
  const canvasEntityNames = entityNodes.map((n) => n.data.label.toLowerCase());

  // Combined model options
  const modelOptions = [
    ...COMMON_MODELS,
    ...canvasEntityNames
      .filter((name) => !COMMON_MODELS.some((m) => m.value === name))
      .map((name) => ({ value: name, label: `${name} (Canvas Entity)` })),
  ];

  // Helper to update the hooks array
  const setHooks = (newHooks: AuthHookConfig[]) => {
    updateData({ hooks: newHooks });
  };

  // Add new Endpoint Hook
  const handleAddEndpointHook = (defaultEvent = "/sign-up") => {
    const newHook: EndpointHookConfig = {
      hookType: "endpoint",
      event: defaultEvent,
      phase: "after",
      enabled: true,
      mode: "naturalLanguage",
      prompt: defaultEvent === "/sign-up"
        ? "After sign up, create default workspace and send welcome email."
        : "Execute custom endpoint logic.",
    };
    setHooks([...hooks, newHook]);
  };

  // Add new Database Hook
  const handleAddDbHook = (defaultModel = "user", defaultOp: "create" | "update" | "delete" = "create") => {
    const newHook: DbHookConfig = {
      hookType: "db",
      model: defaultModel,
      operation: defaultOp,
      phase: "after",
      enabled: true,
      mode: "naturalLanguage",
      prompt: `After ${defaultModel} ${defaultOp}, perform custom database side-effects.`,
    };
    setHooks([...hooks, newHook]);
  };

  // Remove hook by index in full array
  const handleRemoveHook = (index: number) => {
    const updated = hooks.filter((_, i) => i !== index);
    setHooks(updated);
  };

  // Update specific hook in array by global index
  const handleUpdateHook = (index: number, changes: Partial<AuthHookConfig>) => {
    const updated = hooks.map((h, i) => {
      if (i !== index) return h;
      if (h.hookType === "endpoint") {
        return { ...h, ...changes } as EndpointHookConfig;
      } else {
        return { ...h, ...changes } as DbHookConfig;
      }
    });
    setHooks(updated);
  };

  // Generate code action
  const handleGenerateCode = (index: number) => {
    const targetHook = hooks[index];
    if (!targetHook) return;
    const generated = generateCodeFromPrompt(targetHook);
    handleUpdateHook(index, { code: generated, mode: "code" });
  };

  const activeCount = hooks.filter((h) => h.enabled !== false).length;

  return (
    <AccordionItem
      value="hooks"
      className="rounded-xl border bg-card/50 shadow-sm backdrop-blur-sm overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 text-left flex-1">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dynamic Auth Hooks
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
            {activeCount} Configured
          </span>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-6 pt-2">

          {/* ── Section 1: Endpoint Hooks ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                <Label className="text-xs font-semibold">Endpoint Hooks</Label>
                <code className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded">
                  hooks.before / hooks.after
                </code>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] bg-background gap-1"
                onClick={() => handleAddEndpointHook()}
              >
                <Plus className="w-3 h-3" /> Add Endpoint Hook
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Intercept HTTP endpoints with{" "}
              <code className="font-mono text-[10px] bg-muted px-1 rounded">
                createAuthMiddleware
              </code>
              . Multiple hooks of the same phase are combined cleanly into an{" "}
              <code className="font-mono text-[10px] bg-muted px-1 rounded">
                else if
              </code>{" "}
              chain.
            </p>

            {/* Quick Preset Buttons if no endpoint hooks */}
            {endpointHooks.length === 0 && (
              <div className="p-3 bg-muted/30 border border-dashed border-border/60 rounded-lg flex flex-col gap-2 items-center text-center">
                <span className="text-xs text-muted-foreground">
                  No endpoint hooks added yet.
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] font-mono"
                    onClick={() => handleAddEndpointHook("/sign-up")}
                  >
                    + /sign-up
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] font-mono"
                    onClick={() => handleAddEndpointHook("/sign-in/email")}
                  >
                    + /sign-in/email
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] font-mono"
                    onClick={() => handleAddEndpointHook("/reset-password")}
                  >
                    + /reset-password
                  </Button>
                </div>
              </div>
            )}

            {/* List of configured Endpoint Hooks */}
            <div className="flex flex-col gap-3">
              {hooks.map((hook, globalIdx) => {
                if (hook.hookType !== "endpoint") return null;

                const mode = hook.mode || "naturalLanguage";
                const phase = hook.phase || "after";
                const isPreset = COMMON_ENDPOINTS.some((e) => e.value === hook.event && e.value !== "custom");

                return (
                  <div
                    key={globalIdx}
                    className="flex flex-col gap-3 p-3.5 rounded-lg border border-border/50 bg-background/80 text-xs shadow-xs"
                  >
                    {/* Row 1: Target Route Selectors + Delete Button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        {/* Endpoint Path Selector */}
                        <div className="min-w-[150px] flex-1">
                          <Select
                            value={isPreset ? hook.event : "custom"}
                            onValueChange={(val) => {
                              if (val !== "custom") {
                                handleUpdateHook(globalIdx, { event: val });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs font-mono bg-background">
                              <SelectValue placeholder="Select path..." />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {COMMON_ENDPOINTS.map((ep) => (
                                <SelectItem
                                  key={ep.value}
                                  value={ep.value}
                                  className="text-xs font-mono"
                                >
                                  {ep.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {!isPreset && (
                          <div className="min-w-[140px] flex-1">
                            <LocalInput
                              className="h-7 text-xs font-mono bg-background"
                              placeholder="e.g. /custom-route"
                              value={hook.event}
                              onChange={(e) =>
                                handleUpdateHook(globalIdx, { event: e.target.value })
                              }
                            />
                          </div>
                        )}

                        {/* Phase Selector */}
                        <div className="w-28 shrink-0">
                          <Select
                            value={phase}
                            onValueChange={(val) => {
                              if (isHookPhase(val)) {
                                handleUpdateHook(globalIdx, { phase: val });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs font-mono bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {AUTH_DB_HOOK_PHASES.map((p) => (
                                <SelectItem key={p} value={p} className="text-xs font-mono">
                                  hooks.{p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveHook(globalIdx)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1"
                        title="Delete Hook"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Row 2: Mode Toggle + Generate Button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                      <div className="flex items-center rounded border border-border/50 bg-muted/40 p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateHook(globalIdx, { mode: "naturalLanguage" })
                          }
                          className={`px-2.5 py-1 text-[10px] font-medium rounded flex items-center gap-1 transition-colors ${
                            mode === "naturalLanguage"
                              ? "bg-background text-primary shadow-xs font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" /> AI Prompt
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateHook(globalIdx, { mode: "code" })
                          }
                          className={`px-2.5 py-1 text-[10px] font-medium rounded flex items-center gap-1 transition-colors ${
                            mode === "code"
                              ? "bg-background text-primary shadow-xs font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Code2 className="w-3 h-3" /> Code
                        </button>
                      </div>

                      {mode === "naturalLanguage" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[10px] font-mono gap-1 text-primary hover:text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20"
                          onClick={() => handleGenerateCode(globalIdx)}
                        >
                          <Wand2 className="w-3 h-3" /> Generate Code
                        </Button>
                      )}
                    </div>

                    {/* Row 3: Content Input Area */}
                    <div>
                      {mode === "naturalLanguage" ? (
                        <LocalTextarea
                          className="min-h-[70px] text-xs font-mono bg-background/80 leading-relaxed"
                          placeholder="Describe logic (e.g. After sign up, create default workspace and send welcome email)"
                          value={hook.prompt || ""}
                          onChange={(e) =>
                            handleUpdateHook(globalIdx, { prompt: e.target.value })
                          }
                        />
                      ) : (
                        <LocalTextarea
                          className="min-h-[90px] text-xs font-mono bg-muted/90 text-foreground leading-relaxed"
                          placeholder={`if (ctx.path === "${hook.event}") {\n  // custom code\n}`}
                          value={hook.code || ""}
                          onChange={(e) =>
                            handleUpdateHook(globalIdx, { code: e.target.value })
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Section 2: Database Hooks ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-primary shrink-0" />
                <Label className="text-xs font-semibold">Database Hooks</Label>
                <code className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded">
                  databaseHooks.&#123;model&#125;.&#123;op&#125;
                </code>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] bg-background gap-1"
                onClick={() => handleAddDbHook()}
              >
                <Plus className="w-3 h-3" /> Add DB Hook
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              React to database writes on core models (<strong>user</strong>, <strong>session</strong>, <strong>account</strong>) or custom tables.{" "}
              <code className="font-mono text-[10px] bg-muted px-1 rounded">before</code> hooks can mutate via{" "}
              <code className="font-mono text-[10px] bg-muted px-1 rounded">{"{ data: ... }"}</code> or return{" "}
              <code className="font-mono text-[10px] bg-muted px-1 rounded">false</code> to abort.
            </p>

            {/* Quick Preset Buttons if no DB hooks */}
            {dbHooks.length === 0 && (
              <div className="p-3 bg-muted/30 border border-dashed border-border/60 rounded-lg flex flex-col gap-2 items-center text-center">
                <span className="text-xs text-muted-foreground">
                  No database hooks added yet.
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] font-mono"
                    onClick={() => handleAddDbHook("user", "create")}
                  >
                    + user.create
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] font-mono"
                    onClick={() => handleAddDbHook("session", "create")}
                  >
                    + session.create
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] font-mono"
                    onClick={() => handleAddDbHook("account", "create")}
                  >
                    + account.create
                  </Button>
                </div>
              </div>
            )}

            {/* List of configured Database Hooks */}
            <div className="flex flex-col gap-3">
              {hooks.map((hook, globalIdx) => {
                if (hook.hookType !== "db") return null;

                const mode = hook.mode || "naturalLanguage";
                const phase = hook.phase || "after";
                const operation = hook.operation || "create";
                const isModelPreset = modelOptions.some((m) => m.value === hook.model && m.value !== "custom");

                return (
                  <div
                    key={globalIdx}
                    className="flex flex-col gap-3 p-3.5 rounded-lg border border-border/50 bg-background/80 text-xs shadow-xs"
                  >
                    {/* Row 1: Target Model & Op Selectors + Delete Button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        {/* Model Selector */}
                        <div className="min-w-[120px] flex-1">
                          <Select
                            value={isModelPreset ? hook.model : "custom"}
                            onValueChange={(val) => {
                              if (val !== "custom") {
                                handleUpdateHook(globalIdx, { model: val });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs font-mono bg-background">
                              <SelectValue placeholder="Model..." />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {modelOptions.map((m) => (
                                <SelectItem
                                  key={m.value}
                                  value={m.value}
                                  className="text-xs font-mono"
                                >
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {!isModelPreset && (
                          <div className="min-w-[120px] flex-1">
                            <LocalInput
                              className="h-7 text-xs font-mono bg-background"
                              placeholder="Custom model/table..."
                              value={hook.model}
                              onChange={(e) =>
                                handleUpdateHook(globalIdx, { model: e.target.value })
                              }
                            />
                          </div>
                        )}

                        {/* Operation Selector */}
                        <div className="w-24 shrink-0">
                          <Select
                            value={operation}
                            onValueChange={(val) => {
                              if (isDbOperation(val)) {
                                handleUpdateHook(globalIdx, { operation: val });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs font-mono bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {AUTH_DB_HOOK_OPERATIONS.map((op) => (
                                <SelectItem key={op} value={op} className="text-xs font-mono">
                                  .{op}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Phase Selector */}
                        <div className="w-22 shrink-0">
                          <Select
                            value={phase}
                            onValueChange={(val) => {
                              if (isHookPhase(val)) {
                                handleUpdateHook(globalIdx, { phase: val });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs font-mono bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {AUTH_DB_HOOK_PHASES.map((p) => (
                                <SelectItem key={p} value={p} className="text-xs font-mono">
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveHook(globalIdx)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1"
                        title="Delete Hook"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Row 2: Mode Toggle + Generate Button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                      <div className="flex items-center rounded border border-border/50 bg-muted/40 p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateHook(globalIdx, { mode: "naturalLanguage" })
                          }
                          className={`px-2.5 py-1 text-[10px] font-medium rounded flex items-center gap-1 transition-colors ${
                            mode === "naturalLanguage"
                              ? "bg-background text-primary shadow-xs font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" /> AI Prompt
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateHook(globalIdx, { mode: "code" })
                          }
                          className={`px-2.5 py-1 text-[10px] font-medium rounded flex items-center gap-1 transition-colors ${
                            mode === "code"
                              ? "bg-background text-primary shadow-xs font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Code2 className="w-3 h-3" /> TypeScript Code
                        </button>
                      </div>

                      {mode === "naturalLanguage" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[10px] font-mono gap-1 text-primary hover:text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20"
                          onClick={() => handleGenerateCode(globalIdx)}
                        >
                          <Wand2 className="w-3 h-3" /> Generate Code
                        </Button>
                      )}
                    </div>

                    {/* Row 3: Content Input Area */}
                    <div>
                      {mode === "naturalLanguage" ? (
                        <LocalTextarea
                          className="min-h-[70px] text-xs font-mono bg-background/80 leading-relaxed"
                          placeholder="Describe DB side-effect or data mutation..."
                          value={hook.prompt || ""}
                          onChange={(e) =>
                            handleUpdateHook(globalIdx, { prompt: e.target.value })
                          }
                        />
                      ) : (
                        <LocalTextarea
                          className="min-h-[90px] text-xs font-mono bg-muted/90 text-foreground leading-relaxed"
                          placeholder={`async (${hook.model}, ctx) => {\n  // logic\n}`}
                          value={hook.code || ""}
                          onChange={(e) =>
                            handleUpdateHook(globalIdx, { code: e.target.value })
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
