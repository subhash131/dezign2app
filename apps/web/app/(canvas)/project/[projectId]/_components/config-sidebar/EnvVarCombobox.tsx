"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@workspace/ui/components/combobox";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { cleanEnvVarName } from "@/lib/utils/localEnvSync";
import { KeyRound, Globe, Link } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface EnvVarComboboxProps {
  value: string;
  onValueChange: (val: string) => void;
  nodeId?: string;
  placeholder?: string;
  className?: string;
  defaultSuggestions?: string[];
  disabled?: boolean;
  allowRawInput?: boolean;
  type?: "text" | "password";
}

const DEFAULT_S3_ENV_SUGGESTIONS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "S3_ENDPOINT_URL",
];

export const EnvVarCombobox: React.FC<EnvVarComboboxProps> = ({
  value,
  onValueChange,
  nodeId,
  placeholder = "Select or type .env variable...",
  className,
  defaultSuggestions = DEFAULT_S3_ENV_SUGGESTIONS,
  disabled = false,
  allowRawInput = false,
  type = "text",
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const [inputValue, setInputValue] = useState<string>(value || "");

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const items = useMemo(() => {
    const set = new Set<string>();

    const normalize = (s: string) => (allowRawInput ? s.trim() : cleanEnvVarName(s));

    // Current value
    if (value && value.trim()) {
      set.add(normalize(value));
    }

    // Input value being typed
    if (inputValue && inputValue.trim()) {
      set.add(normalize(inputValue));
    }

    // Node-specific env vars if nodeId provided
    if (nodeId) {
      const node = nodes.find((n) => n.id === nodeId);
      const nodeVars = (node?.data?.envVars as Array<{ name: string }> | undefined) || [];
      nodeVars.forEach((v) => {
        if (v?.name) set.add(normalize(v.name));
      });
    }

    // All env vars defined across canvas nodes
    nodes.forEach((n) => {
      const envVars = (n.data?.envVars as Array<{ name: string }> | undefined) || [];
      envVars.forEach((v) => {
        if (v?.name) set.add(normalize(v.name));
      });
    });

    // Default suggestions
    defaultSuggestions.forEach((s) => set.add(normalize(s)));

    return Array.from(set).filter(Boolean);
  }, [value, inputValue, nodeId, nodes, defaultSuggestions, allowRawInput]);

  const handleCommitValue = (val: string) => {
    const result = allowRawInput ? val.trim() : cleanEnvVarName(val);
    if (result) {
      onValueChange(result);
      setInputValue(result);
    }
  };

  const selectedValue = value ? (allowRawInput ? value.trim() : cleanEnvVarName(value)) : null;

  return (
    <div className="relative w-full nodrag" onClick={(e) => e.stopPropagation()}>
      <Combobox
        items={items}
        value={selectedValue}
        onValueChange={(selected) => {
          if (typeof selected === "string" && selected.trim()) {
            handleCommitValue(selected);
          }
        }}
        inputValue={inputValue}
        onInputValueChange={(text) => {
          setInputValue(text);
        }}
      >
        <ComboboxInput
          type={type}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-8 w-full bg-background/50 text-xs font-mono nodrag",
            className,
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim()) {
              e.preventDefault();
              handleCommitValue(inputValue);
            }
          }}
          onBlur={() => {
            if (inputValue.trim()) {
              handleCommitValue(inputValue);
            }
          }}
        />
        <ComboboxContent
          className="w-[280px] p-0 shadow-2xl border border-border/80 bg-popover text-popover-foreground rounded-xl z-50 overflow-hidden"
          align="start"
          sideOffset={4}
        >
          <ComboboxEmpty className="py-2.5 px-3 text-xs text-muted-foreground text-center">
            Press Enter to use custom value
          </ComboboxEmpty>
          <ComboboxList className="max-h-56 overflow-y-auto no-scrollbar p-1 bg-popover text-popover-foreground hide-scrollbar">
            {(item: string) => {
              const isUrl = item.includes("://");
              const isRegion = item.startsWith("us-") || item.startsWith("eu-") || item.startsWith("ap-") || item.startsWith("sa-") || item.startsWith("ca-");
              const isEnv = !isUrl && !isRegion && item === item.toUpperCase() && !item.includes(".");

              return (
                <ComboboxItem
                  key={item}
                  value={item}
                  className="flex items-center justify-between py-1.5 px-2 text-xs font-mono cursor-pointer rounded-md gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {isUrl ? (
                      <Link size={12} className="text-blue-500 shrink-0" />
                    ) : isRegion ? (
                      <Globe size={12} className="text-emerald-500 shrink-0" />
                    ) : (
                      <KeyRound size={12} className="text-amber-500 shrink-0" />
                    )}
                    <span className="truncate font-semibold text-foreground">
                      {item}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                    {isEnv ? ".env" : isUrl ? "url" : "value"}
                  </span>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
};
