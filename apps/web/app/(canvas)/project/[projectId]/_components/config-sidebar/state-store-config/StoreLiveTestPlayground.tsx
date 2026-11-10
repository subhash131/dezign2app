"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Zap, CheckCircle2 } from "lucide-react";
import {
  GlobalStoreAction,
  GlobalStoreField,
  StateStoreTestCase,
  JsonValue,
  CustomTypeItem,
} from "@workspace/canvas/types";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import {
  StateManipulator,
  TestHistoryEntry,
  StoreState,
  getStateManipulators,
  applyManipulator,
  formatInitialFieldValue,
  generateDefaultTestCases,
} from "./types";
import { LiveStateInspector } from "./LiveStateInspector";
import { ManipulatorRunnerSection } from "./ManipulatorRunnerSection";
import { TestCasesRunnerSection } from "./TestCasesRunnerSection";
import { TestActivityLog } from "./TestActivityLog";

export interface StoreLiveTestPlaygroundProps {
  fields: GlobalStoreField[];
  actions: GlobalStoreAction[];
  savedTestCases?: StateStoreTestCase[];
  onSaveTestCases?: (testCases: StateStoreTestCase[]) => void;
  disabledDefaultManipulators?: string[];
  deletedDefaultManipulators?: string[];
  initialSelectedFieldId?: string;
  availableCustomTypes?: CustomTypeItem[];
}

export const StoreLiveTestPlayground: React.FC<StoreLiveTestPlaygroundProps> = ({
  fields,
  actions,
  savedTestCases = [],
  onSaveTestCases,
  disabledDefaultManipulators = [],
  deletedDefaultManipulators = [],
  initialSelectedFieldId,
  availableCustomTypes = [],
}) => {
  const [sandboxState, setSandboxState] = useState<StoreState>({});
  const [activePlaygroundTab, setActivePlaygroundTab] = useState<"manipulators" | "testcases">("manipulators");
  const [selectedVariableTab, setSelectedVariableTab] = useState<string>(
    initialSelectedFieldId || "all",
  );

  useEffect(() => {
    if (initialSelectedFieldId) {
      setSelectedVariableTab(initialSelectedFieldId);
    }
  }, [initialSelectedFieldId]);

  // All state manipulators available on the store (actions, setters, builtins)
  const manipulators = useMemo(
    () => getStateManipulators(fields, actions, disabledDefaultManipulators, deletedDefaultManipulators, availableCustomTypes),
    [fields, actions, disabledDefaultManipulators, deletedDefaultManipulators, availableCustomTypes],
  );

  const [selectedManipulatorId, setSelectedManipulatorId] = useState<string>("");
  const [payloadText, setPayloadText] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [testHistory, setTestHistory] = useState<TestHistoryEntry[]>([]);
  const [lastExecutionResult, setLastExecutionResult] = useState<{
    manipulatorName: string;
    category: string;
    success: boolean;
    error?: string;
    changedKeys: string[];
    beforeState: StoreState;
    afterState: StoreState;
    timestamp: string;
  } | null>(null);

  // Test cases state
  const [testCases, setTestCases] = useState<StateStoreTestCase[]>(() => {
    if (savedTestCases && savedTestCases.length > 0) return savedTestCases;
    return generateDefaultTestCases(manipulators);
  });

  // Keep test cases in sync if savedTestCases updates
  useEffect(() => {
    if (savedTestCases && savedTestCases.length > 0) {
      setTestCases(savedTestCases);
    }
  }, [savedTestCases]);

  // Initialize sandbox state from field defaults
  useEffect(() => {
    if (fields.length > 0) {
      setSandboxState((prev) => {
        const next: StoreState = {};
        fields.forEach((f) => {
          const prevVal = prev[f.name];
          next[f.name] = prevVal !== undefined ? prevVal : formatInitialFieldValue(f, availableCustomTypes);
        });
        return next;
      });
    }
  }, [fields, availableCustomTypes]);

  // Set default selected manipulator
  useEffect(() => {
    if (manipulators.length > 0) {
      const exists = manipulators.some((m) => m.id === selectedManipulatorId);
      if (!selectedManipulatorId || !exists) {
        const initial = manipulators[0]!;
        setSelectedManipulatorId(initial.id);
        setPayloadText(
          initial.defaultPayload !== undefined && initial.defaultPayload !== null
            ? typeof initial.defaultPayload === "object"
              ? JSON.stringify(initial.defaultPayload, null, 2)
              : String(initial.defaultPayload)
            : "",
        );
      }
    }
  }, [manipulators, selectedManipulatorId]);

  const selectedManipulator = useMemo(
    () => manipulators.find((m) => m.id === selectedManipulatorId) || manipulators[0],
    [manipulators, selectedManipulatorId],
  );

  const manipulatorArgInfo = useMemo(() => {
    if (!selectedManipulator) return { label: "Payload / Arguments", placeholder: "" };

    if (selectedManipulator.parameters && selectedManipulator.parameters.length > 0) {
      const sig = selectedManipulator.parameters.map((p) => `${p.name}: ${p.type}`).join(", ");
      return {
        label: `Arguments (${sig})`,
        placeholder: 'e.g. { "arg1": "val", "arg2": 42 }',
      };
    }

    const targetField = fields.find(
      (f) =>
        f.id === selectedManipulator.targetFieldId ||
        f.name === selectedManipulator.targetFieldName,
    );

    const actType = selectedManipulator.actionType || selectedManipulator.defaultManipulatorType;

    if (actType === "stream") {
      return {
        label: "Stream Delta / Chunk (string or { delta, id, done })",
        placeholder: 'e.g. { "delta": "Hello world" } or "Hello world"',
      };
    }
    if (actType === "remove") {
      return {
        label: "Item ID or Index to remove",
        placeholder: 'e.g. { "id": "123" } or "123" or 0',
      };
    }
    if (actType === "update") {
      return {
        label: "Patch Object (in-place update by id)",
        placeholder: 'e.g. { "id": "123", "content": "Updated content" }',
      };
    }
    if (actType === "prepend") {
      return {
        label: "Item to prepend (front of array)",
        placeholder: 'e.g. { "id": "msg_0", "role": "system", "content": "Hello" }',
      };
    }
    if (actType === "append") {
      return {
        label: "Item to append (end of array)",
        placeholder: 'e.g. { "id": "msg_1", "role": "user", "content": "Hello" }',
      };
    }
    if (actType === "pop") {
      return {
        label: "No arguments required (removes last element)",
        placeholder: "(leave blank or null)",
      };
    }
    if (actType === "reset") {
      return {
        label: "No arguments required (resets to initial value)",
        placeholder: "(leave blank or null)",
      };
    }
    if (actType === "toggle") {
      return {
        label: "No arguments required (toggles boolean flag)",
        placeholder: "(leave blank or null)",
      };
    }
    if (actType === "increment" || actType === "decrement") {
      return {
        label: "Amount (number)",
        placeholder: "e.g. 1 or { amount: 5 }",
      };
    }

    if (targetField) {
      switch (targetField.type) {
        case "number":
          return {
            label: "Argument (number)",
            placeholder: "e.g. 42 or 100",
          };
        case "boolean":
          return {
            label: "Argument (boolean)",
            placeholder: "e.g. true or false",
          };
        case "string":
          return {
            label: "Argument (string)",
            placeholder: 'e.g. "active" or any text',
          };
        case "array":
          return {
            label: "Argument (array or item to append)",
            placeholder: 'e.g. ["item1", "item2"] or { "id": "1" }',
          };
        case "object":
          return {
            label: "Argument (object JSON)",
            placeholder: 'e.g. { "key": "value" }',
          };
        default:
          return {
            label: `Argument (${targetField.type})`,
            placeholder: `e.g. value for ${targetField.name}`,
          };
      }
    }

    return {
      label: "Argument (string, number, boolean, or object)",
      placeholder: 'e.g. "value", 42, true, or { ... }',
    };
  }, [selectedManipulator, fields]);

  const handleSelectManipulator = (id: string) => {
    setSelectedManipulatorId(id);
    const m = manipulators.find((item) => item.id === id);
    if (m) {
      setPayloadText(
        m.defaultPayload !== undefined && m.defaultPayload !== null
          ? typeof m.defaultPayload === "object"
            ? JSON.stringify(m.defaultPayload, null, 2)
            : String(m.defaultPayload)
          : "",
      );
    }
  };

  const handleResetSandbox = () => {
    const resetState: StoreState = {};
    fields.forEach((f) => {
      resetState[f.name] = formatInitialFieldValue(f, availableCustomTypes);
    });
    setSandboxState(resetState);
    toast.info("Store state reset to defaults");
  };

  const handleRunManipulator = () => {
    if (!selectedManipulator) return;
    setIsExecuting(true);
    const beforeState = { ...sandboxState };

    let parsedPayload: JsonValue | undefined = payloadText;
    if (payloadText && payloadText.trim()) {
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch {
        parsedPayload = payloadText;
      }
    } else if (selectedManipulator.defaultPayload === undefined) {
      parsedPayload = undefined;
    }

    const { newState, error } = applyManipulator({
      manipulator: selectedManipulator,
      payload: parsedPayload,
      currentState: sandboxState,
      fields,
    });

    const changedKeys = fields
      .map((f) => f.name)
      .filter((k) => JSON.stringify(beforeState[k]) !== JSON.stringify(newState[k]));

    const result = {
      manipulatorName: selectedManipulator.name,
      category: selectedManipulator.category,
      success: !error,
      error,
      changedKeys,
      beforeState,
      afterState: newState,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLastExecutionResult(result);

    if (error) {
      toast.error(`"${selectedManipulator.name}" failed: ${error}`);
    } else {
      setSandboxState(newState);
      if (changedKeys.length > 0) {
        toast.success(`"${selectedManipulator.name}" updated: ${changedKeys.join(", ")}`);
      } else {
        toast.info(`"${selectedManipulator.name}" executed`);
      }
    }

    const entry: TestHistoryEntry = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      manipulatorName: selectedManipulator.name,
      category: selectedManipulator.category,
      changedKeys,
      beforeState,
      afterState: newState,
      error,
    };
    setTestHistory((prev) => [entry, ...prev.slice(0, 19)]);
    setIsExecuting(false);
  };

  // Quick run an action directly by ID
  const handleQuickRunManipulator = (manipulatorId: string) => {
    const targetM = manipulators.find((m) => m.id === manipulatorId);
    if (!targetM) return;

    setSelectedManipulatorId(targetM.id);
    const beforeState = { ...sandboxState };

    let payload: JsonValue | undefined = targetM.defaultPayload;
    if (targetM.id === selectedManipulatorId && payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = payloadText;
      }
    }

    const { newState, error } = applyManipulator({
      manipulator: targetM,
      payload,
      currentState: sandboxState,
      fields,
    });

    const changedKeys = fields
      .map((f) => f.name)
      .filter((k) => JSON.stringify(beforeState[k]) !== JSON.stringify(newState[k]));

    const result = {
      manipulatorName: targetM.name,
      category: targetM.category,
      success: !error,
      error,
      changedKeys,
      beforeState,
      afterState: newState,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLastExecutionResult(result);

    if (error) {
      toast.error(`"${targetM.name}" failed: ${error}`);
    } else {
      setSandboxState(newState);
      if (changedKeys.length > 0) {
        toast.success(`"${targetM.name}" updated: ${changedKeys.join(", ")}`);
      } else {
        toast.info(`"${targetM.name}" executed`);
      }
    }

    const entry: TestHistoryEntry = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      manipulatorName: targetM.name,
      category: targetM.category,
      changedKeys,
      beforeState,
      afterState: newState,
      error,
    };
    setTestHistory((prev) => [entry, ...prev.slice(0, 19)]);
  };

  // Run a single test case
  const handleRunTestCase = (tcId: string) => {
    const tc = testCases.find((c) => c.id === tcId);
    if (!tc) return;

    const matchedManipulator = manipulators.find((m) => m.name === tc.manipulatorName) || manipulators[0];
    if (!matchedManipulator) return;

    const beforeState = { ...sandboxState };
    const startTime = performance.now();

    const { newState, error } = applyManipulator({
      manipulator: matchedManipulator,
      payload: tc.payload,
      currentState: sandboxState,
      fields,
    });

    const elapsed = Math.round(performance.now() - startTime);

    if (error) {
      const updatedCases = testCases.map((c) =>
        c.id === tcId
          ? { ...c, status: "failed" as const, error, lastRunAt: `${elapsed}ms` }
          : c,
      );
      setTestCases(updatedCases);
      onSaveTestCases?.(updatedCases);
      toast.error(`Test "${tc.name}" failed: ${error}`);
    } else {
      setSandboxState(newState);
      const changedKeys = fields
        .map((f) => f.name)
        .filter((k) => JSON.stringify(beforeState[k]) !== JSON.stringify(newState[k]));

      const updatedCases = testCases.map((c) =>
        c.id === tcId
          ? { ...c, status: "passed" as const, error: undefined, lastRunAt: `${elapsed}ms` }
          : c,
      );
      setTestCases(updatedCases);
      onSaveTestCases?.(updatedCases);

      const entry: TestHistoryEntry = {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        manipulatorName: matchedManipulator.name,
        category: matchedManipulator.category,
        changedKeys,
        beforeState,
        afterState: newState,
      };
      setTestHistory((prev) => [entry, ...prev.slice(0, 19)]);
      toast.success(`Test "${tc.name}" passed (${elapsed}ms)`);
    }
  };

  // Run all test cases in sequence
  const handleRunAllTestCases = () => {
    let currentLiveState = { ...sandboxState };
    let passedCount = 0;
    const updatedCases: StateStoreTestCase[] = [];

    testCases.forEach((tc) => {
      const m = manipulators.find((item) => item.name === tc.manipulatorName) || manipulators[0];
      if (!m) {
        updatedCases.push({ ...tc, status: "failed", error: "Manipulator not found" });
        return;
      }

      const startTime = performance.now();
      const { newState, error } = applyManipulator({
        manipulator: m,
        payload: tc.payload,
        currentState: currentLiveState,
        fields,
      });
      const elapsed = Math.round(performance.now() - startTime);

      if (error) {
        updatedCases.push({ ...tc, status: "failed", error, lastRunAt: `${elapsed}ms` });
      } else {
        currentLiveState = newState;
        passedCount++;
        updatedCases.push({ ...tc, status: "passed", error: undefined, lastRunAt: `${elapsed}ms` });
      }
    });

    setSandboxState(currentLiveState);
    setTestCases(updatedCases);
    onSaveTestCases?.(updatedCases);

    if (passedCount === testCases.length) {
      toast.success(`All ${passedCount} test cases passed!`);
    } else {
      toast.warning(`${passedCount}/${testCases.length} test cases passed`);
    }
  };

  const handleAutoGenerateTestCases = () => {
    const generated = generateDefaultTestCases(manipulators);
    setTestCases(generated);
    onSaveTestCases?.(generated);
    toast.success(`Generated ${generated.length} test cases from state manipulators!`);
  };

  const handleAddCustomTestCase = () => {
    const newTc: StateStoreTestCase = {
      id: `tc-${Date.now()}`,
      name: `Test Case ${testCases.length + 1}`,
      manipulatorName: manipulators[0]?.name || "reset",
      payload: manipulators[0]?.defaultPayload,
      status: "idle",
    };
    const next = [...testCases, newTc];
    setTestCases(next);
    onSaveTestCases?.(next);
  };

  const handleUpdateTestCase = (tcId: string, patch: Partial<StateStoreTestCase>) => {
    const next = testCases.map((c) => (c.id === tcId ? { ...c, ...patch } : c));
    setTestCases(next);
    onSaveTestCases?.(next);
  };

  const handleRemoveTestCase = (tcId: string) => {
    const next = testCases.filter((c) => c.id !== tcId);
    setTestCases(next);
    onSaveTestCases?.(next);
  };

  return (
    <div className="space-y-4 select-none">
      {/* Live State Inspector Card */}
      <LiveStateInspector
        sandboxState={sandboxState}
        onResetDefaults={handleResetSandbox}
        onUpdateSandboxState={setSandboxState}
        activeField={
          fields.find(
            (f) =>
              f.id === selectedVariableTab ||
              f.name.toLowerCase() === selectedVariableTab.toLowerCase(),
          )?.name
        }
        onSelectField={(fieldName) => {
          const matched = fields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase());
          if (matched) {
            setSelectedVariableTab(matched.id);
          }
        }}
      />

      {/* Mode Switcher: Run Manipulators vs Generated Test Cases */}
      <div className="flex items-center justify-between p-1 bg-muted rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setActivePlaygroundTab("manipulators")}
          className={cn(
            "flex-1 text-xs py-1 px-2.5 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            activePlaygroundTab === "manipulators"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap size={12} className="text-foreground" />
          <span>Execute Actions</span>
        </button>
        <button
          type="button"
          onClick={() => setActivePlaygroundTab("testcases")}
          className={cn(
            "flex-1 text-xs py-1 px-2.5 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            activePlaygroundTab === "testcases"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CheckCircle2 size={12} className="text-foreground" />
          <span>Test Cases ({testCases.length})</span>
        </button>
      </div>

      {/* SECTION 1: Run State Manipulator */}
      {activePlaygroundTab === "manipulators" && (
        <ManipulatorRunnerSection
          fields={fields}
          sandboxState={sandboxState}
          manipulators={manipulators}
          selectedManipulator={selectedManipulator}
          selectedManipulatorId={selectedManipulatorId}
          onSelectManipulator={handleSelectManipulator}
          payloadText={payloadText}
          onChangePayloadText={setPayloadText}
          manipulatorArgInfo={manipulatorArgInfo}
          isExecuting={isExecuting}
          onRunManipulator={handleRunManipulator}
          onQuickRunManipulator={handleQuickRunManipulator}
          lastExecutionResult={lastExecutionResult}
          selectedVariableTab={selectedVariableTab}
          onSelectVariableTab={setSelectedVariableTab}
          availableCustomTypes={availableCustomTypes}
        />
      )}

      {/* SECTION 2: Generated Test Cases */}
      {activePlaygroundTab === "testcases" && (
        <TestCasesRunnerSection
          testCases={testCases}
          manipulators={manipulators}
          onAutoGenerate={handleAutoGenerateTestCases}
          onAddTestCase={handleAddCustomTestCase}
          onRunAll={handleRunAllTestCases}
          onRunTestCase={handleRunTestCase}
          onUpdateTestCase={handleUpdateTestCase}
          onRemoveTestCase={handleRemoveTestCase}
        />
      )}

      {/* State Transition History & Diff */}
      <TestActivityLog
        history={testHistory}
        onClearHistory={() => setTestHistory([])}
      />
    </div>
  );
};
