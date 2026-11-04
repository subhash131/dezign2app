import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LocalInput } from "../LocalInput";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { CheckCircle2, AlertCircle, Pencil, Plus } from "lucide-react";
import { arePageRoutesEqual } from "@workspace/canvas";
import { RedirectRouteSelectorProps } from "./types";

export const RedirectRouteSelector: React.FC<RedirectRouteSelectorProps> = ({
  label,
  value,
  nodeIdValue,
  placeholder,
  configuredPages,
  targetZoneType,
  projectId,
  onChange,
  onCreatePageNode,
}) => {
  const router = useRouter();
  const [isCustomInput, setIsCustomInput] = useState(false);

  // Presets based on zone
  const standardPresets =
    targetZoneType === "protected"
      ? [
          { path: "/dashboard", label: "Dashboard" },
          { path: "/onboarding", label: "Onboarding" },
          { path: "/profile", label: "Profile" },
          { path: "/settings", label: "Settings" },
        ]
      : [
          { path: "/login", label: "Sign-In" },
          { path: "/register", label: "Sign-Up" },
          { path: "/unauthorized", label: "Unauthorized / 403" },
          { path: "/pricing", label: "Pricing / Plans" },
          { path: "/", label: "Landing / Home" },
        ];

  const missingPresets = standardPresets.filter(
    (preset) => !configuredPages.some((p) => arePageRoutesEqual(p.path, preset.path)),
  );

  // Find page by nodeId first if it matches current value, otherwise fall back to path matching
  const matchingByNodeId = nodeIdValue
    ? configuredPages.find((p) => p.id === nodeIdValue)
    : undefined;
  const matchingByPath = configuredPages.find((p) => arePageRoutesEqual(p.path, value || ""));
  const matchedPage =
    matchingByNodeId &&
    (!value ||
      arePageRoutesEqual(matchingByNodeId.path, value) ||
      arePageRoutesEqual(matchingByNodeId.label, value))
      ? matchingByNodeId
      : matchingByPath;

  const effectivePath = matchedPage ? matchedPage.path : value;
  const matchedPreset = standardPresets.find((p) => arePageRoutesEqual(p.path, value || ""));
  const currentSelectValue = matchedPage
    ? matchedPage.id
    : matchedPreset
    ? `__preset__${matchedPreset.path}`
    : value
    ? `__value__${value}`
    : "";

return (
    <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground font-medium">{label}</Label>
        {matchedPage?.isCanvasPage ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="flex items-center gap-1 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <CheckCircle2 className="w-2.5 h-2.5" /> Canvas Node
            </span>
            {projectId && (
              <button
                type="button"
                onClick={() => router.push(`/project/${projectId}/pages/${matchedPage.id}`)}
                className="text-[10px] text-indigo-500 hover:text-indigo-400 hover:underline flex items-center gap-0.5 font-medium cursor-pointer"
                title="Open page in visual editor"
              >
                <Pencil className="w-2.5 h-2.5" /> Edit UI
              </button>
            )}
          </div>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
            <AlertCircle className="w-2.5 h-2.5" /> No canvas node
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {isCustomInput ? (
          <div className="flex items-center gap-1 flex-1">
            <LocalInput
              className="h-7 text-xs font-mono bg-background flex-1"
              placeholder={placeholder}
              value={effectivePath}
              onChange={(e) => onChange(e.target.value, undefined)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCustomInput(false)}
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              title="Switch to page picker"
            >
              List
            </Button>
          </div>
        ) : (
          <Select
            value={currentSelectValue}
            onValueChange={(selectedId) => {
              if (selectedId === "__custom__") {
                setIsCustomInput(true);
                return;
              }
              if (selectedId.startsWith("__preset__")) {
                const presetPath = selectedId.replace("__preset__", "");
                onChange(presetPath, undefined);
                return;
              }
              const selectedPage = configuredPages.find((p) => p.id === selectedId);
              if (selectedPage) {
                onChange(selectedPage.path, selectedPage.id);
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs font-mono bg-background flex-1">
              <SelectValue placeholder={placeholder}>
                {matchedPage ? (
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="font-sans font-medium text-foreground truncate">
                      {matchedPage.label}
                    </span>
                    {!arePageRoutesEqual(matchedPage.label, matchedPage.path) && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        ({matchedPage.path})
                      </span>
                    )}
                  </div>
                ) : (
                  effectivePath || placeholder
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="nodrag">
              {configuredPages.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold tracking-wider">
                    Configured Canvas Pages
                  </SelectLabel>
                  {configuredPages.map((p) => {
                    const isSame = arePageRoutesEqual(p.label, p.path);
                    return (
                      <SelectItem key={p.id} value={p.id} className="text-xs font-mono">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="font-sans font-medium text-foreground">{p.label}</span>
                          {!isSame && (
                            <span className="text-[10px] text-muted-foreground font-mono">({p.path})</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              )}

              {missingPresets.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold tracking-wider">
                    Standard Presets
                  </SelectLabel>
                  {missingPresets.map((preset) => (
                    <SelectItem
                      key={preset.path}
                      value={`__preset__${preset.path}`}
                      className="text-xs font-mono"
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-sans text-muted-foreground">{preset.label}</span>
                        <span className="text-[10px] text-muted-foreground/80 font-mono">
                          ({preset.path})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              <SelectGroup>
                <SelectItem value="__custom__" className="text-xs text-indigo-500 font-medium">
                  + Enter custom route path...
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}

        {/* If no canvas page is linked, show Create Page Node button */}
        {!matchedPage?.isCanvasPage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCreatePageNode}
            className="h-7 text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border-indigo-500/30 shrink-0 cursor-pointer font-medium"
            title={`Create WebPage node for ${effectivePath || placeholder} on canvas`}
          >
            <Plus className="w-3 h-3 mr-1" /> Create Node
          </Button>
        )}
      </div>
    </div>
  );
};
