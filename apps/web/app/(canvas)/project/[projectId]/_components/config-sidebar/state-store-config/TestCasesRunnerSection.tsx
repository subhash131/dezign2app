"use client";

import React from "react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Sparkles,
  Plus,
  Play,
  Check,
  XCircle,
  Trash2,
} from "lucide-react";
import { StateStoreTestCase, JsonValue } from "@workspace/canvas/types";
import { StateManipulator } from "./types";

export interface TestCasesRunnerSectionProps {
  testCases: StateStoreTestCase[];
  manipulators: StateManipulator[];
  onAutoGenerate: () => void;
  onAddTestCase: () => void;
  onRunAll: () => void;
  onRunTestCase: (tcId: string) => void;
  onUpdateTestCase: (tcId: string, patch: Partial<StateStoreTestCase>) => void;
  onRemoveTestCase: (tcId: string) => void;
}

export const TestCasesRunnerSection: React.FC<TestCasesRunnerSectionProps> = ({
  testCases,
  manipulators,
  onAutoGenerate,
  onAddTestCase,
  onRunAll,
  onRunTestCase,
  onUpdateTestCase,
  onRemoveTestCase,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAutoGenerate}
          className="h-7 text-[10px] px-2 gap-1 cursor-pointer"
        >
          <Sparkles size={11} />
          <span>Auto-Generate</span>
        </Button>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddTestCase}
            className="h-7 text-[10px] px-2 gap-1 cursor-pointer"
          >
            <Plus size={11} />
            <span>Add Test</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={onRunAll}
            disabled={testCases.length === 0}
            className="h-7 text-[10px] px-2.5 font-semibold gap-1 cursor-pointer"
          >
            <Play size={10} className="fill-current" />
            <span>Run All ({testCases.length})</span>
          </Button>
        </div>
      </div>

      {testCases.length === 0 ? (
        <div className="p-4 text-center text-[10px] text-muted-foreground bg-muted rounded-lg border border-dashed border-border space-y-1.5">
          <p>No test cases generated yet.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAutoGenerate}
            className="h-6 text-[10px]"
          >
            Auto-generate from Manipulators
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {testCases.map((tc) => {
            return (
              <div
                key={tc.id}
                className="p-2.5 rounded-lg bg-card border border-border space-y-2 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={tc.name}
                    onChange={(e) => onUpdateTestCase(tc.id, { name: e.target.value })}
                    className="h-6 text-[11px] font-semibold bg-transparent border-transparent hover:border-border focus:border-border px-1 flex-1 text-foreground"
                  />

                  <div className="flex items-center gap-1.5 shrink-0">
                    {tc.status === "passed" && (
                      <Badge
                        variant="outline"
                        className="text-[9px] text-foreground bg-muted border-border gap-0.5"
                      >
                        <Check size={10} /> Passed {tc.lastRunAt && `(${tc.lastRunAt})`}
                      </Badge>
                    )}
                    {tc.status === "failed" && (
                      <Badge
                        variant="outline"
                        className="text-[9px] text-destructive bg-destructive/10 border-destructive gap-0.5"
                      >
                        <XCircle size={10} /> Failed
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRunTestCase(tc.id)}
                      className="h-6 w-6 text-foreground hover:bg-muted cursor-pointer"
                      title="Run this test case"
                    >
                      <Play size={11} className="fill-current" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveTestCase(tc.id)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground w-20 shrink-0">
                    Manipulator:
                  </Label>
                  <Select
                    value={tc.manipulatorName}
                    onValueChange={(val) => {
                      const m = manipulators.find((item) => item.name === val);
                      onUpdateTestCase(tc.id, {
                        manipulatorName: val,
                        payload: m?.defaultPayload,
                      });
                    }}
                  >
                    <SelectTrigger className="h-6 text-[10px] font-mono bg-background/50 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {manipulators.map((m) => (
                        <SelectItem key={m.id} value={m.name} className="text-xs font-mono">
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {tc.payload !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-[9px] text-muted-foreground">Test Payload:</Label>
                    <Textarea
                      value={
                        typeof tc.payload === "object" && tc.payload !== null
                          ? JSON.stringify(tc.payload, null, 2)
                          : String(tc.payload ?? "")
                      }
                      onChange={(e) => {
                        let parsed: JsonValue = e.target.value;
                        try {
                          parsed = JSON.parse(e.target.value);
                        } catch {
                          parsed = e.target.value;
                        }
                        onUpdateTestCase(tc.id, { payload: parsed });
                      }}
                      className="h-12 text-[10px] font-mono bg-background/50 p-1.5 resize-y"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
