import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

const memoryStorage = vi.hoisted(() => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: mockStorage,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: mockStorage,
    });
  }
  return store;
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/project/proj-1",
}));

vi.mock("@/lib/electron", () => ({
  isElectron: () => false,
  getElectronAPI: () => null,
}));

vi.mock("@/components/terminal", async () => {
  const utils = await vi.importActual<
    typeof import("@/components/terminal/terminalUtils")
  >("@/components/terminal/terminalUtils");
  return {
    ...utils,
    XTermTerminal: () => <div />,
  };
});

vi.mock("./../hooks/useTerminalWorkspace", () => ({
  useTerminalWorkspace: () => ({
    outputDir: "",
    handlePickDirectory: vi.fn(),
  }),
}));

vi.mock("./../hooks/useMonorepoEndpoints", () => ({
  useMonorepoEndpoints: () => ({
    formattedProjectName: "test-app",
    files: [],
    serviceEndpoints: [],
  }),
}));

vi.mock("./../hooks/useDynamicTerminalSessions", () => ({
  useDynamicTerminalSessions: () => ({
    sessions: [],
    activeSessionId: null,
    activeSession: null,
    createTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    selectTerminal: vi.fn(),
    clearTerminal: vi.fn(),
    writeToSession: vi.fn(),
    resizeSession: vi.fn(),
    allDetectedPorts: [],
    replayMissedLogs: vi.fn(),
  }),
}));

vi.mock("./../hooks/useAutoDiskSync", () => ({
  useAutoDiskSync: () => ({
    syncStatus: "idle",
    lastSyncedAt: null,
    forceSyncNow: vi.fn(),
  }),
}));

vi.mock("./../hooks/usePortMonitor", () => ({
  usePortMonitor: () => ({
    monitoredPorts: [],
    activePortsCount: 0,
    refreshPorts: vi.fn(),
  }),
}));

vi.mock("../../../compiler/_components/terminal-panel", () => ({
  TerminalPanelHeader: () => <div data-testid="terminal-header" />,
  ProblemsTab: () => <div />,
  OutputTab: () => <div />,
  PortsTab: () => <div />,
  TerminalTab: () => <div />,
}));

vi.mock("re-resizable", () => ({
  Resizable: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { Terminal } from "../Terminal";

describe("Terminal Ctrl+J keyboard shortcut", () => {
  beforeEach(() => {
    memoryStorage.clear();
    useSidebarStore.setState({ terminalOpen: false });
  });

  it("toggles terminalOpen on Ctrl+J and Cmd+J", () => {
    render(<Terminal projectId="proj-1" projectName="Test App" />);

    expect(useSidebarStore.getState().terminalOpen).toBe(false);

    fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(useSidebarStore.getState().terminalOpen).toBe(true);

    fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(useSidebarStore.getState().terminalOpen).toBe(false);

    fireEvent.keyDown(window, { key: "J", code: "KeyJ", metaKey: true });
    expect(useSidebarStore.getState().terminalOpen).toBe(true);
  });

  it("ignores repeated keydown events and modified shortcuts like Ctrl+Shift+J", () => {
    render(<Terminal projectId="proj-1" projectName="Test App" />);

    fireEvent.keyDown(window, {
      key: "j",
      code: "KeyJ",
      ctrlKey: true,
      repeat: true,
    });
    expect(useSidebarStore.getState().terminalOpen).toBe(false);

    fireEvent.keyDown(window, {
      key: "J",
      code: "KeyJ",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(useSidebarStore.getState().terminalOpen).toBe(false);
  });

  it("calls controlled onToggleOpen when provided", () => {
    const onToggleOpen = vi.fn();
    render(
      <Terminal
        projectId="proj-1"
        projectName="Test App"
        isOpen={false}
        onToggleOpen={onToggleOpen}
      />,
    );

    fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
  });
});
