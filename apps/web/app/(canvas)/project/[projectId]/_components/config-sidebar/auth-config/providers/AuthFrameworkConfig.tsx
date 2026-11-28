import React from "react";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  AUTH_FRAMEWORK_BETTER_AUTH,
  AUTH_FRAMEWORK_OPTIONS,
  BETTER_AUTH_VERSIONS,
} from "@workspace/canvas";
import { BackendNodeData } from "@/types/canvas";

interface AuthFrameworkConfigProps {
  selectedFramework: string;
  selectedVersion: string;
  updateData: (changes: Partial<BackendNodeData>) => void;
}

export const AuthFrameworkConfig: React.FC<AuthFrameworkConfigProps> = ({
  selectedFramework,
  selectedVersion,
  updateData,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold">Framework</Label>
        <Select
          value={selectedFramework}
          onValueChange={(val: string) => {
            const option = AUTH_FRAMEWORK_OPTIONS.find((o) => o.value === val);
            if (option) {
              updateData({ framework: option.value, provider: option.label });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTH_FRAMEWORK_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedFramework === AUTH_FRAMEWORK_BETTER_AUTH && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">Version</Label>
          <Select
            value={selectedVersion}
            onValueChange={(val: string) => updateData({ version: val })}
          >
            <SelectTrigger className="h-8 text-xs font-mono bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-mono">
              {BETTER_AUTH_VERSIONS.map((ver) => (
                <SelectItem key={ver.value} value={ver.value} className="text-xs font-mono">
                  {ver.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
