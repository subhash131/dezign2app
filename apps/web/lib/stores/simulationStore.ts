import { create } from "zustand";
import type { SimulationTraceEntry } from "@/lib/simulation/runtime";

export type SimulationStatus = "idle" | "running" | "completed" | "failed";

type SimulationState = {
  status: SimulationStatus;
  trace: SimulationTraceEntry[];
  activeIndex: number;
  activeNodeIds: string[];
  activeEdgeIds: string[];
  currentNodeId?: string;
  currentEdgeId?: string;
  terminalOpen: boolean;
  selectedEventId?: string;
  selectedCaseId?: string;
  selectTestCase: (eventId: string, caseId: string) => void;
  clearSelectedTestCase: () => void;
  start: (trace: SimulationTraceEntry[]) => void;
  toggleTerminal: () => void;
  clear: () => void;
};

let activeRun = 0;

export const useSimulationStore = create<SimulationState>((set) => ({
  status: "idle",
  trace: [],
  activeIndex: -1,
  activeNodeIds: [],
  activeEdgeIds: [],
  currentNodeId: undefined,
  currentEdgeId: undefined,
  terminalOpen: true,
  selectedEventId: undefined,
  selectedCaseId: undefined,
  selectTestCase: (eventId, caseId) => set({ selectedEventId: eventId, selectedCaseId: caseId }),
  clearSelectedTestCase: () => set({ selectedEventId: undefined, selectedCaseId: undefined }),
  start: (trace) => {
    const run = ++activeRun;
    const first = trace[0];
    set({
      status: trace.length <= 1 ? (first?.status === "failed" ? "failed" : "completed") : "running",
      trace,
      activeIndex: first ? 0 : -1,
      activeNodeIds: first?.nodeId ? [first.nodeId] : [],
      activeEdgeIds: first?.edgeId ? [first.edgeId] : [],
      currentNodeId: first?.nodeId,
      currentEdgeId: first?.edgeId,
    });

    trace.slice(1).forEach((entry, offset) => {
      const index = offset + 1;
      window.setTimeout(() => {
        if (run !== activeRun) return;
        set((state) => {
          const visited = state.trace.slice(0, index + 1);
          const activeNodeIds = [...new Set(visited.flatMap((item) => item.nodeId ? [item.nodeId] : []))];
          const activeEdgeIds = [...new Set(visited.flatMap((item) => item.edgeId ? [item.edgeId] : []))];
          const isFinal = index === trace.length - 1;
          return {
            activeIndex: index,
            activeNodeIds,
            activeEdgeIds,
            currentNodeId: entry.nodeId,
            currentEdgeId: entry.edgeId,
            status: isFinal ? (entry.status === "failed" ? "failed" : "completed") : "running",
          };
        });
      }, index * 550);
    });
  },
  clear: () => {
    activeRun++;
    set({
      status: "idle",
      trace: [],
      activeIndex: -1,
      activeNodeIds: [],
      activeEdgeIds: [],
      currentNodeId: undefined,
      currentEdgeId: undefined,
      selectedEventId: undefined,
      selectedCaseId: undefined,
    });
  },
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
}));
