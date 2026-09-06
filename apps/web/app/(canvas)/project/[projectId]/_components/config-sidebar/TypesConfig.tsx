"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { TypeCombobox } from "./TypeCombobox";
import {
  Plus,
  Trash,
  Text,
  Copy,
  Check,
  Code2,
  Sparkles,
  Lock,
  ArrowUpRight,
  Package,
  AlertTriangle,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { useBufferedInput } from "@/lib/hooks/useBufferedInput";
import {
  createExtendedTypeNode,
  refreshPackageTypesFromNodeModules,
} from "@/lib/stores/backendCanvas/packageTypesSync";
import type {
  CustomTypeItem,
  CustomTypeField,
  CustomTypeKind,
} from "@workspace/canvas/types";

export interface TypesConfigProps {
  id: string;
  nodeId: string;
  selectedTypeId?: string;
}

// --- Memoized Property Row with Buffered Inputs for instant 0ms typing ---
interface TypePropertyRowProps {
  field: CustomTypeField;
  otherCustomTypes: string[];
  readOnly?: boolean;
  onUpdate: (updates: Partial<CustomTypeField>) => void;
  onDelete: () => void;
}

const TypePropertyRow = React.memo(
  ({ field, otherCustomTypes, readOnly, onUpdate, onDelete }: TypePropertyRowProps) => {
    const nameBuffer = useBufferedInput(
      field.name || "",
      useCallback((name: string) => onUpdate({ name }), [onUpdate]),
      200,
    );

    const descBuffer = useBufferedInput(
      field.description || "",
      useCallback(
        (description: string) => onUpdate({ description }),
        [onUpdate],
      ),
      200,
    );

    const [enumInput, setEnumInput] = useState("");

    const isFieldArray = Boolean(
      field.isArray || field.type?.endsWith("[]"),
    );
    const baseType = (field.type || "string").replace(/\[\]$/, "");

    const toggleArray = () => {
      if (readOnly) return;
      if (isFieldArray) {
        onUpdate({ type: baseType, isArray: false });
      } else {
        onUpdate({ type: `${baseType}[]`, isArray: true });
      }
    };

    const handleTypeChange = (selectedBase: string) => {
      if (readOnly) return;
      const cleanBase = selectedBase.replace(/\[\]$/, "");
      const newType = isFieldArray ? `${cleanBase}[]` : cleanBase;
      onUpdate({
        type: newType,
        isArray: isFieldArray,
        ...(cleanBase === "enum" && (!field.enumValues || field.enumValues.length === 0)
          ? { enumValues: [] }
          : {}),
      });
    };

    const handleAddEnumValue = useCallback(
      (raw?: string) => {
        const input = typeof raw === "string" ? raw : enumInput;
        if (!input.trim()) return;
        const parts = input
          .split(",")
          .map((p) => p.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        if (parts.length === 0) return;
        const currentValues = field.enumValues || [];
        const uniqueNew = parts.filter((p) => !currentValues.includes(p));
        if (uniqueNew.length > 0) {
          onUpdate({ enumValues: [...currentValues, ...uniqueNew] });
        }
        setEnumInput("");
      },
      [enumInput, field.enumValues, onUpdate],
    );

    const handleDeleteEnumValue = useCallback(
      (idx: number) => {
        const updated = (field.enumValues || []).filter((_, i) => i !== idx);
        onUpdate({ enumValues: updated });
      },
      [field.enumValues, onUpdate],
    );

    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-background/50 p-2.5 relative group/param transition-all hover:border-primary/30 hover:shadow-sm">
        <div className="flex items-center gap-2">
          {readOnly ? (
            <span className="h-7 text-xs flex-1 font-mono font-semibold flex items-center px-1 text-foreground">
              {field.name}
            </span>
          ) : (
            <Input
              className="h-7 text-xs flex-1 nodrag bg-background font-mono border-none shadow-none focus-visible:ring-1 placeholder:font-sans"
              placeholder="Property name"
              value={nameBuffer.value}
              onChange={(e) => nameBuffer.onChange(e.target.value)}
              onBlur={nameBuffer.flush}
            />
          )}

          {/* Type Select or Read-only badge */}
          {readOnly ? (
            <span className="h-7 px-2.5 flex items-center text-xs font-mono bg-secondary/50 rounded text-foreground font-medium">
              {field.type}
            </span>
          ) : (
            <TypeCombobox
              value={baseType}
              onValueChange={handleTypeChange}
              className="w-[150px]"
            />
          )}

          {/* Array [] toggle button */}
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={
                isFieldArray
                  ? "Array type active (click to make single)"
                  : "Single type (click to make array [])"
              }
              className={cn(
                "h-7 px-3 font-mono text-xs font-bold nodrag rounded-full transition-all cursor-pointer",
                isFieldArray
                  ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 ring-1 ring-primary/30"
                  : "bg-secondary/60 text-muted-foreground/80 hover:bg-secondary hover:text-foreground border border-border/40",
              )}
              onClick={toggleArray}
            >
              []
            </Button>
          )}

          {/* Add Description toggle button */}
          {!readOnly && field.description === undefined && (
            <Button
              size="icon"
              variant="ghost"
              title="Add Description"
              className="h-7 w-7 opacity-0 group-hover/param:opacity-100 text-muted-foreground hover:bg-secondary shrink-0 transition-all rounded-full"
              onClick={() => onUpdate({ description: "" })}
            >
              <Text size={14} />
            </Button>
          )}

          {/* Delete Field button */}
          {!readOnly && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 opacity-0 group-hover/param:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 transition-all rounded-full"
              onClick={onDelete}
            >
              <Trash size={14} />
            </Button>
          )}
        </div>

        {/* Inline enum values editor — badge style */}
        {baseType === "enum" && (
          <div className="flex flex-col gap-1.5 px-1 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-wider pl-1">
              Values:
            </span>
            {readOnly ? (
              <div className="flex flex-wrap gap-1 px-1">
                {(field.enumValues || []).map((v, idx) => (
                  <span
                    key={`${v}-${idx}`}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-secondary/70 border border-border/50 text-[11px] font-mono text-foreground"
                  >
                    {v}
                  </span>
                ))}
                {(field.enumValues || []).length === 0 && (
                  <span className="text-xs text-muted-foreground/60 italic">empty</span>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <Input
                    className="h-6 text-xs flex-1 nodrag bg-background/90 font-mono border-purple-500/30 text-foreground placeholder:text-muted-foreground/50 placeholder:font-sans focus-visible:ring-purple-500/30"
                    placeholder="Add value, press Enter..."
                    value={enumInput}
                    onChange={(e) => setEnumInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEnumValue();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-6 w-6 shrink-0 cursor-pointer"
                    disabled={!enumInput.trim()}
                    onClick={() => handleAddEnumValue()}
                  >
                    <Plus size={12} />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1 px-0.5 min-h-[24px]">
                  {(field.enumValues || []).map((v, idx) => (
                    <span
                      key={`${v}-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 hover:bg-secondary border border-border/60 text-[11px] font-mono font-medium text-foreground transition-all"
                    >
                      <span>{v}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteEnumValue(idx)}
                        className="text-muted-foreground/60 hover:text-destructive p-0.5 rounded transition-colors cursor-pointer"
                        title={`Remove "${v}"`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {(field.enumValues || []).length === 0 && (
                    <span className="text-[10px] text-muted-foreground/50 italic">
                      No values yet.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Description row */}
        {field.description !== undefined && (
          <div className="relative w-full">
            {readOnly ? (
              <span className="text-[10px] pl-2 text-muted-foreground italic">
                {field.description}
              </span>
            ) : (
              <>
                <Input
                  className="h-6 text-[10px] pl-2.5 pr-6 w-full nodrag bg-transparent border-none shadow-none text-muted-foreground placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:bg-secondary/30 rounded"
                  placeholder="Add a description..."
                  value={descBuffer.value}
                  onChange={(e) => descBuffer.onChange(e.target.value)}
                  onBlur={descBuffer.flush}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 absolute right-0.5 top-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 shrink-0 transition-all rounded"
                  onClick={() => onUpdate({ description: undefined })}
                >
                  <Trash size={10} />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);
TypePropertyRow.displayName = "TypePropertyRow";

// --- Dedicated Type Editor Form (keyed by currentType.id for instantaneous switches) ---
interface TypeEditorFormProps {
  nodeId: string;
  currentType: CustomTypeItem;
  otherCustomTypes: string[];
  inheritedEnumValues?: string[];
  onUpdateCurrentType: (updates: Partial<CustomTypeItem>) => void;
  onDeleteCurrentType: () => void;
}

const TypeEditorForm = ({
  nodeId,
  currentType,
  otherCustomTypes,
  inheritedEnumValues = [],
  onUpdateCurrentType,
  onDeleteCurrentType,
}: TypeEditorFormProps) => {
  const [copied, setCopied] = useState(false);

  // Buffered inputs for Name and Description (matching EndpointConfig.tsx)
  const nameBuffer = useBufferedInput(
    currentType.name || "",
    useCallback(
      (name: string) => onUpdateCurrentType({ name }),
      [onUpdateCurrentType],
    ),
    200,
  );

  const descBuffer = useBufferedInput(
    currentType.description || "",
    useCallback(
      (description: string) => onUpdateCurrentType({ description }),
      [onUpdateCurrentType],
    ),
    200,
  );

  const handleAddField = useCallback(() => {
    const currentFields = currentType.fields || [];
    const newField: CustomTypeField = {
      id: `f-${Date.now()}`,
      name: `prop${currentFields.length + 1}`,
      type: "string",
      required: true,
      isArray: false,
    };
    onUpdateCurrentType({ fields: [...currentFields, newField] });
  }, [currentType.fields, onUpdateCurrentType]);

  const handleUpdateField = useCallback(
    (fieldId: string, fieldUpdates: Partial<CustomTypeField>) => {
      const updatedFields = (currentType.fields || []).map((f) =>
        f.id === fieldId ? { ...f, ...fieldUpdates } : f,
      );
      onUpdateCurrentType({ fields: updatedFields });
    },
    [currentType.fields, onUpdateCurrentType],
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      const updatedFields = (currentType.fields || []).filter(
        (f) => f.id !== fieldId,
      );
      onUpdateCurrentType({ fields: updatedFields });
    },
    [currentType.fields, onUpdateCurrentType],
  );

  const [newConstantInput, setNewConstantInput] = useState("");

  const handleAddConstant = useCallback(
    (valToAdd?: string) => {
      const raw = typeof valToAdd === "string" ? valToAdd : newConstantInput;
      if (!raw.trim()) return;

      const parts = raw
        .split(",")
        .map((p) => p.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

      if (parts.length === 0) return;

      const currentValues = currentType.enumValues || [];
      const uniqueNew = parts.filter((p) => !currentValues.includes(p));
      if (uniqueNew.length > 0) {
        onUpdateCurrentType({ enumValues: [...currentValues, ...uniqueNew] });
      }
      setNewConstantInput("");
    },
    [newConstantInput, currentType.enumValues, onUpdateCurrentType],
  );

  const handleDeleteEnumValue = useCallback(
    (index: number) => {
      const currentValues = (currentType.enumValues || []).filter(
        (_, idx) => idx !== index,
      );
      onUpdateCurrentType({ enumValues: currentValues });
    },
    [currentType.enumValues, onUpdateCurrentType],
  );

  // Memoized TypeScript preview code
  const previewCode = useMemo((): string => {
    const desc = currentType.description
      ? `/**\n * ${currentType.description}\n */\n`
      : "";

    if (currentType.kind === "enum") {
      const vals = currentType.enumValues || [];
      if (vals.length === 0) return `${desc}export enum ${currentType.name} {}\n`;
      const lines = vals.map((v) => `  ${v} = "${v}",`).join("\n");
      return `${desc}export enum ${currentType.name} {\n${lines}\n}\n`;
    }

    // For read-only package types: rawCode is the source of truth — show it as-is
    if (currentType.isReadOnly && currentType.rawCode) {
      return currentType.rawCode.trim() + "\n";
    }

    // For alias types with no parsed fields but a typeAliasValue
    if (
      currentType.kind === "type" &&
      (!currentType.fields || currentType.fields.length === 0) &&
      currentType.typeAliasValue
    ) {
      return `${desc}export type ${currentType.name} = ${currentType.typeAliasValue};\n`;
    }

    const fields = currentType.fields || [];
    const fieldLines = fields
      .map((f) => {
        const isArr = Boolean(f.isArray || f.type?.endsWith("[]"));
        const base = (f.type || "string").replace(/\[\]$/, "");
        let finalType: string;
        if (base === "enum") {
          const vals =
            f.enumValues && f.enumValues.length > 0
              ? f.enumValues.map((v) => `"${v}"`).join(" | ")
              : `"value1" | "value2"`;
          finalType = isArr ? `(${vals})[]` : vals;
        } else {
          finalType = isArr ? `${base}[]` : base;
        }
        const opt = f.required === false ? "?" : "";
        const comment = f.description ? ` // ${f.description}` : "";
        return `  ${f.name || "prop"}${opt}: ${finalType};${comment}`;
      })
      .join("\n");

    if (currentType.kind === "type") {
      return `${desc}export type ${currentType.name} = {\n${fieldLines}\n};\n`;
    }

    return `${desc}export interface ${currentType.name} {\n${fieldLines}\n}\n`;
  }, [currentType]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(previewCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Read-Only Package Type Banner */}
      {Boolean(currentType.isReadOnly) && (
        <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wide">
                Package Contract: {currentType.packageSource || "external"}
              </span>
            </div>
            {currentType.isExtendable !== false && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-xs font-semibold cursor-pointer"
                onClick={() => createExtendedTypeNode(nodeId, currentType.id)}
              >
                <ArrowUpRight size={13} />
                Extend Type
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This data contract is read-only because it represents an external package model. Click <strong>Extend Type</strong> to create an editable custom model with inheritance on your canvas.
          </p>
        </div>
      )}

      {/* Extended Type Banner */}
      {Boolean(currentType.extendedFrom) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs text-purple-700 dark:text-purple-300">
          <Sparkles size={14} className="shrink-0 text-purple-500" />
          <span>
            Extended from base model: <strong className="font-mono">{currentType.extendedFrom}</strong>
          </span>
        </div>
      )}

      {/* Type Header - Kind and Name (buffered, matching EndpointConfig.tsx) */}
      <div className="flex flex-col gap-2.5 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2">
          <Select
            value={currentType.kind}
            disabled={Boolean(currentType.isReadOnly) || Boolean(currentType.extendedFrom)}
            onValueChange={(kind: CustomTypeKind) =>
              onUpdateCurrentType({ kind })
            }
          >
            <SelectTrigger className="h-8 w-[115px] text-xs font-mono font-bold bg-primary/15 text-primary border-primary/30 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interface" className="text-xs font-mono font-bold">
                INTERFACE
              </SelectItem>
              <SelectItem value="type" className="text-xs font-mono font-bold">
                TYPE
              </SelectItem>
              <SelectItem value="enum" className="text-xs font-mono font-bold">
                ENUM
              </SelectItem>
            </SelectContent>
          </Select>

          <Input
            className="h-8 text-sm font-semibold tracking-tight text-foreground bg-background font-mono flex-1 disabled:opacity-80"
            placeholder="TypeName (e.g. UserProfile)"
            value={nameBuffer.value}
            disabled={Boolean(currentType.isReadOnly) || Boolean(currentType.extendedFrom)}
            onChange={(e) => nameBuffer.onChange(e.target.value)}
            onBlur={nameBuffer.flush}
          />

          {!currentType.isReadOnly && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 rounded-lg"
              onClick={onDeleteCurrentType}
              title="Delete this type"
            >
              <Trash size={14} />
            </Button>
          )}
        </div>

        <span className="text-xs text-muted-foreground">
          Configure flat object schema properties and reference reusable custom types.
        </span>
      </div>

      {/* Description Section (buffered, matching EndpointConfig.tsx summary) */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          Description
        </Label>
        <Input
          className="bg-background/50 disabled:opacity-80"
          placeholder="e.g. Represents user profile and credentials."
          disabled={Boolean(currentType.isReadOnly) || Boolean(currentType.extendedFrom)}
          value={descBuffer.value}
          onChange={(e) => descBuffer.onChange(e.target.value)}
          onBlur={descBuffer.flush}
        />
      </div>

      {/* Enum Constants Editor: 1 input field with badges below */}
      {currentType.kind === "enum" ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Enum Constants ({(currentType.enumValues || []).length})
            </span>
            {currentType.isReadOnly && (
              <span className="text-[10px] font-mono font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                READ-ONLY PACKAGE ENUM
              </span>
            )}
            {Boolean(currentType.extendedFrom) && (
              <span className="text-[10px] font-mono font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                INHERITED · READ-ONLY
              </span>
            )}
          </div>

          {/* Allow adding new constants when extended too — inherited ones just can't be deleted */}
          {!currentType.isReadOnly && (
            <div className="flex items-center gap-2">
              <Input
                className="h-8 text-xs flex-1 nodrag bg-background font-mono border-border/70 focus-visible:ring-1 placeholder:font-sans placeholder:text-muted-foreground/60"
                placeholder="Type constant and press Enter (or comma-separated)..."
                value={newConstantInput}
                onChange={(e) => setNewConstantInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddConstant();
                  }
                }}
              />
              <Button
                size="sm"
                className="h-8 text-xs font-semibold gap-1 px-3 cursor-pointer shrink-0"
                onClick={() => handleAddConstant()}
                disabled={!newConstantInput.trim()}
              >
                <Plus size={13} />
                <span>Add</span>
              </Button>
            </div>
          )}

          {/* Badges container below the input field */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 min-h-[36px]">
            {(currentType.enumValues || []).map((val, idx) => {
              const isInherited = inheritedEnumValues.includes(val);
              return (
                <span
                  key={`${val}-${idx}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-all shadow-2xs",
                    isInherited
                      ? "bg-purple-500/10 border-purple-500/30 text-purple-300 cursor-default"
                      : "bg-secondary/80 hover:bg-secondary border-border/60 text-foreground group/badge",
                  )}
                  title={isInherited ? `Inherited from ${currentType.extendedFrom}` : undefined}
                >
                  {isInherited && <Lock size={9} className="shrink-0 text-purple-400" />}
                  <span>{val}</span>
                  {!currentType.isReadOnly && !isInherited && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEnumValue(idx)}
                      className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 p-0.5 rounded transition-colors cursor-pointer"
                      title={`Delete constant ${val}`}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              );
            })}

            {(currentType.enumValues || []).length === 0 && (
              <span className="text-xs text-muted-foreground/60 italic py-1">
                No constants added yet. Type a constant name above and press Enter.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Properties ({(currentType.fields || []).length})
              </span>
              {otherCustomTypes.length > 0 && (
                <span className="text-[10px] text-indigo-400 font-mono flex items-center gap-1">
                  <Sparkles size={11} /> {otherCustomTypes.length} custom types
                </span>
              )}
            </div>
            {!currentType.isReadOnly && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-[10px] gap-1 rounded-full px-3"
                onClick={handleAddField}
              >
                <Plus size={12} /> Add Property
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2.5 mt-1">
            {(currentType.fields || []).map((f) => (
              <TypePropertyRow
                key={f.id}
                field={f}
                otherCustomTypes={otherCustomTypes}
                readOnly={Boolean(currentType.isReadOnly)}
                onUpdate={(updates) => handleUpdateField(f.id, updates)}
                onDelete={() => handleDeleteField(f.id)}
              />
            ))}

            {(currentType.fields || []).length === 0 && (
              <span className="text-xs text-muted-foreground/60 italic py-2">
                No properties defined yet. Click &quot;Add Property&quot; above.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Generated TypeScript Preview Section */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Code2 size={14} className="text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              TypeScript Preview
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyCode}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-500" />
                <span className="text-emerald-500">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>

        <pre className="p-3 rounded-lg bg-background/80 border text-[11px] font-mono text-foreground/90 overflow-x-auto max-h-[220px] whitespace-pre hide-scrollbar">
          {previewCode}
        </pre>
      </div>
    </>
  );
};

// --- Main TypesConfig Component ---
export const TypesConfig: React.FC<TypesConfigProps> = ({
  id,
  nodeId,
  selectedTypeId,
}) => {
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === (nodeId || id)),
  );
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const [activeTypeId, setActiveTypeId] = useState<string | undefined>(
    selectedTypeId,
  );
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const data = node?.data;
  const isPackageNode = Boolean(data?.isPackageNode);
  const packageName = data?.packageName || "";
  const packageVersion = data?.packageVersion;
  const isInstalled = data?.isInstalled !== false;
  const installError = data?.installError;
  const installCmd = "pnpm i";

  const handleCopyInstall = () => {
    navigator.clipboard.writeText("pnpm i");
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleRefresh = async () => {
    const pkg = packageName || data?.label;
    if (!pkg) return;
    setIsRefreshing(true);
    try {
      await refreshPackageTypesFromNodeModules(nodeId || id, pkg);
    } finally {
      setIsRefreshing(false);
    }
  };

  const types: CustomTypeItem[] = useMemo(
    () => (data && Array.isArray(data.types) ? data.types : []),
    [data],
  );

  // Set active type to selectedTypeId if provided, or default to first type
  useEffect(() => {
    if (selectedTypeId) {
      setActiveTypeId(selectedTypeId);
    } else if (!activeTypeId && types.length > 0) {
      setActiveTypeId(types[0]?.id);
    }
  }, [selectedTypeId, types, activeTypeId]);

  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const currentType = useMemo(() => {
    return types.find((t) => t.id === activeTypeId) || types[0];
  }, [types, activeTypeId]);

  // Exclude only the currently edited type itself (so Type 2 sees Type 3, and Type 3 sees Type 2!)
  const otherCustomTypes = useMemo(() => {
    const list: string[] = [];
    allNodes.forEach((tn) => {
      if (tn.type === "types") {
        const typeList = tn.data?.types || [];
        typeList.forEach((item) => {
          if (
            item.name &&
            item.name.trim().length > 0 &&
            item.id !== currentType?.id &&
            item.name.trim() !== currentType?.name?.trim()
          ) {
            list.push(item.name.trim());
          }
        });
      }
    });
    return Array.from(new Set(list));
  }, [allNodes, currentType?.id, currentType?.name]);

  // For extended types: find the base type's enum values so we can distinguish inherited vs user-added badges
  const inheritedEnumValues = useMemo(() => {
    if (!currentType?.extendedFromTypeId && !currentType?.extendedFrom) return [];
    for (const n of allNodes) {
      if (n.type !== "types") continue;
      const baseType = (n.data?.types || []).find(
        (t: CustomTypeItem) =>
          t.id === currentType.extendedFromTypeId || t.name === currentType.extendedFrom,
      );
      if (baseType?.enumValues) return baseType.enumValues as string[];
    }
    return [];
  }, [allNodes, currentType?.extendedFromTypeId, currentType?.extendedFrom]);

  const updateTypesList = useCallback(
    (updated: CustomTypeItem[]) => {
      if (!node || !data) return;
      updateNode(node.id, {
        data: {
          ...data,
          types: updated,
        },
      });
    },
    [node, data, updateNode],
  );

  const handleUpdateCurrentType = useCallback(
    (updates: Partial<CustomTypeItem>) => {
      if (!currentType) return;
      const updated = types.map((t) =>
        t.id === currentType.id ? { ...t, ...updates } : t,
      );
      updateTypesList(updated);
    },
    [currentType, types, updateTypesList],
  );

  const handleAddType = useCallback(() => {
    const newId = `type-${Date.now()}`;
    const newType: CustomTypeItem = {
      id: newId,
      name: `Type${types.length + 1}`,
      kind: "interface",
      description: "",
      fields: [
        { id: `f-${Date.now()}-1`, name: "id", type: "string", required: true, isArray: false },
        { id: `f-${Date.now()}-2`, name: "name", type: "string", required: true, isArray: false },
      ],
    };
    updateTypesList([...types, newType]);
    setActiveTypeId(newId);
  }, [types, updateTypesList]);

  const handleDeleteCurrentType = useCallback(() => {
    if (!currentType) return;
    const remaining = types.filter((t) => t.id !== currentType.id);
    updateTypesList(remaining);
    setActiveTypeId(remaining[0]?.id);
  }, [currentType, types, updateTypesList]);

  if (!node || !data) return null;

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      {/* Package Header Banner if this is a Package Types Node */}
      {isPackageNode && (
        <div
          className={cn(
            "flex flex-col gap-2.5 p-3.5 rounded-xl border",
            !isInstalled
              ? "border-red-500/50 bg-red-500/10 text-red-900 dark:text-red-200"
              : "border-border/60 bg-secondary/30 text-foreground",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package size={16} className={cn(!isInstalled ? "text-red-500" : "text-primary")} />
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
                <span>{packageName || "Package Contract"}</span>
                {packageVersion && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary font-normal text-muted-foreground">
                    v{packageVersion}
                  </span>
                )}
              </div>
            </div>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                !isInstalled
                  ? "bg-red-500 text-white"
                  : "bg-primary/20 text-primary border border-primary/30",
              )}
            >
              {!isInstalled ? "NOT INSTALLED" : "PACKAGE TYPES"}
            </span>
          </div>

          {!isInstalled ? (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertTriangle size={14} className="shrink-0" />
                <span>
                  {installError || "Saved to package.json. Run 'pnpm i' in your terminal to install:"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-black/60 dark:bg-black/90 font-mono text-[11px] text-emerald-400 border border-red-500/30">
                <code className="select-all">{installCmd}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-white shrink-0 cursor-pointer"
                  onClick={handleCopyInstall}
                  title="Copy command"
                >
                  {copiedInstall ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/20 cursor-pointer mt-1"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
                <span>{isRefreshing ? "Checking..." : "Check Again / Sync"}</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 mt-1">
              <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
                Inferred from <code>node_modules/{packageName}</code>. Use <strong>Extend Type</strong> to create an editable custom model.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] gap-1 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw size={11} className={cn(isRefreshing && "animate-spin")} />
                <span>{isRefreshing ? "Syncing..." : "Re-sync"}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Type Navigator Bar if multiple types exist */}
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border bg-card/50 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
            Selected Type:
          </span>
          <Select
            value={currentType?.id}
            onValueChange={(val) => setActiveTypeId(val)}
          >
            <SelectTrigger className="h-8 text-xs font-mono font-semibold bg-background flex-1 max-w-[220px]">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs font-mono">
                  {t.name} ({t.kind})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isPackageNode && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[10px] gap-1 rounded-full px-3 shrink-0"
            onClick={handleAddType}
          >
            <Plus size={12} /> Add Type
          </Button>
        )}
      </div>

      {currentType ? (
        <TypeEditorForm
          key={currentType.id}
          nodeId={nodeId || id}
          currentType={currentType}
          otherCustomTypes={otherCustomTypes}
          inheritedEnumValues={inheritedEnumValues}
          onUpdateCurrentType={handleUpdateCurrentType}
          onDeleteCurrentType={handleDeleteCurrentType}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed text-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isPackageNode
              ? "No type definitions cataloged for this package yet."
              : "No types defined on this node yet."}
          </p>
          {!isPackageNode && (
            <Button size="sm" onClick={handleAddType} className="text-xs">
              <Plus size={14} className="mr-1" /> Add Type
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
