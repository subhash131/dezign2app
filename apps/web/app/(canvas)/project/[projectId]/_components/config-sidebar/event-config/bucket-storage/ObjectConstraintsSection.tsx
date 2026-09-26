import React from "react";
import { Button } from "@workspace/ui/components/button";
import { FileCode } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";
import { DATA_TYPES, PRESET_FILE_SIZES } from "./constants";

export const ObjectConstraintsSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const storedTypes = Array.isArray(item.storedDataTypes)
    ? item.storedDataTypes
    : [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <FileCode size={14} className="text-amber-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Object Types & Size Limits
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">
          Categorize the kinds of objects stored in this bucket
        </span>
        <div className="grid grid-cols-2 gap-2">
          {DATA_TYPES.map((type) => {
            const isChecked = storedTypes.includes(type);
            return (
              <label
                key={type}
                className="flex items-center gap-2 cursor-pointer text-xs text-foreground p-1 rounded hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  className="rounded border-border bg-background"
                  checked={isChecked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const updated = checked
                      ? [...storedTypes, type]
                      : storedTypes.filter((t: string) => t !== type);
                    handleUpdate(item.id, { storedDataTypes: updated });
                  }}
                />
                {type}
              </label>
            );
          })}
        </div>
      </div>

      {storedTypes.includes("Other") && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Other Data Types Description
          </span>
          <LocalInput
            className="h-8 bg-background/50 text-xs"
            placeholder="e.g. CAD Files, Parquet, SQLite snapshots"
            value={item.storedDataTypesOther || ""}
            onChange={(e) =>
              handleUpdate(item.id, { storedDataTypesOther: e.target.value })
            }
            onBlur={(e) =>
              handleUpdate(item.id, { storedDataTypesOther: e.target.value })
            }
            debounceMs={200}
          />
        </div>
      )}

      {/* Max File Size Limit */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-foreground">
            Maximum Object / File Size
          </label>
          <div className="flex items-center gap-1">
            {PRESET_FILE_SIZES.map((size) => (
              <Button
                key={size}
                type="button"
                variant={item.maxFileSize === size ? "secondary" : "ghost"}
                size="sm"
                className="h-5 px-1.5 text-[9px]"
                onClick={() => handleUpdate(item.id, { maxFileSize: size })}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>
        <LocalInput
          className="h-8 bg-background/50 text-xs font-mono"
          placeholder="e.g. 250KB, 5MB, 50MB, 1GB (leave blank for unlimited)"
          value={item.maxFileSize || ""}
          onChange={(e) => handleUpdate(item.id, { maxFileSize: e.target.value })}
          onBlur={(e) => handleUpdate(item.id, { maxFileSize: e.target.value })}
          debounceMs={200}
        />
      </div>

      {/* Allowed MIME types / Extensions filter */}
      <div className="flex flex-col gap-1.5 pt-1">
        <label className="text-[11px] font-medium text-foreground">
          Allowed Extensions / MIME Types Filter
        </label>
        <LocalInput
          className="h-8 bg-background/50 text-xs font-mono"
          placeholder="e.g. .png, .jpg, .jpeg, .pdf, image/*, application/pdf"
          value={item.allowedExtensions || ""}
          onChange={(e) => handleUpdate(item.id, { allowedExtensions: e.target.value })}
          onBlur={(e) => handleUpdate(item.id, { allowedExtensions: e.target.value })}
          debounceMs={200}
        />
      </div>
    </div>
  );
};
