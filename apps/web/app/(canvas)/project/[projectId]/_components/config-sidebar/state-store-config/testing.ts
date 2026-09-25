import { StateStoreTestCase } from "@workspace/canvas/types";
import { StoreState } from "./core";
import { StateManipulator } from "./types";

export interface TestHistoryEntry {
  id: string;
  timestamp: string;
  manipulatorName: string;
  category: string;
  changedKeys: string[];
  beforeState: StoreState;
  afterState: StoreState;
  error?: string;
}

export function generateDefaultTestCases(
  manipulators: StateManipulator[],
): StateStoreTestCase[] {
  return manipulators.map((m, idx) => ({
    id: `tc-${Date.now()}-${idx}`,
    name: `Test ${m.name}() execution`,
    manipulatorName: m.name,
    payload: m.defaultPayload,
    status: "idle",
  }));
}
