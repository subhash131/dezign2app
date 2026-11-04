import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DatabaseConfig } from "../../DatabaseConfig";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode } from "@/types/canvas";

vi.mock("@/lib/utils/databaseEnvSync", () => ({
  syncDatabaseEnvVarsList: vi.fn((data, envVars) => envVars || []),
  syncDatabaseLocalEnv: vi.fn().mockResolvedValue({ created: [], updated: [], deleted: [] }),
}));

vi.mock("@/lib/utils/localEnvSync", () => ({
  deleteLocalEnvVariable: vi.fn().mockResolvedValue(undefined),
  saveLocalEnvVariable: vi.fn().mockResolvedValue(undefined),
  getLocalEnvVariable: vi.fn().mockReturnValue(""),
  fetchLocalEnvVariable: vi.fn().mockResolvedValue(""),
  cleanEnvVarName: vi.fn((v) => v),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value }: any) => <div data-testid="mock-select" data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

vi.mock("@workspace/ui/components/switch", () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

describe("DatabaseConfig — Debounced Inputs", () => {
  const mockDbNode: BackendNode = {
    id: "node-db-1",
    type: "database",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: "Main Postgres DB",
      dbEngine: "postgres",
      host: "localhost",
      port: "5432",
      database: "postgres",
      user: "postgres",
      password: "secretpassword",
      connectionStringEnv: "DATABASE_URL",
      connectionStringPooledEnv: "DATABASE_URL_POOLED",
      envVars: [],
    },
  };

  beforeEach(() => {
    vi.useRealTimers();
    useBackendCanvasStore.setState({
      nodes: [mockDbNode],
      updateNode: vi.fn(),
      addNode: vi.fn(),
      addEdge: vi.fn(),
      deleteEdge: vi.fn(),
      edges: [],
    });
  });

  it("renders database configuration inputs with initial values", () => {
    render(<DatabaseConfig id="node-db-1" nodeId="node-db-1" />);

    const labelInput = screen.getByPlaceholderText("e.g. Primary Redis Cache") as HTMLInputElement;
    expect(labelInput.value).toBe("Main Postgres DB");

    const hostInput = screen.getByPlaceholderText("localhost or 127.0.0.1") as HTMLInputElement;
    expect(hostInput.value).toBe("localhost");

    const portInput = screen.getByPlaceholderText("5432") as HTMLInputElement;
    expect(portInput.value).toBe("5432");

    const postgresInputs = screen.getAllByPlaceholderText("postgres") as HTMLInputElement[];
    expect(postgresInputs.length).toBeGreaterThanOrEqual(1);
    expect(postgresInputs[0]?.value).toBe("postgres");
  });

  it("debounces node label changes before committing to canvas store", () => {
    vi.useFakeTimers();
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    render(<DatabaseConfig id="node-db-1" nodeId="node-db-1" />);

    const labelInput = screen.getByPlaceholderText("e.g. Primary Redis Cache") as HTMLInputElement;

    act(() => {
      fireEvent.change(labelInput, { target: { value: "New DB Name" } });
    });

    // Local input displays new text immediately with 0ms visual delay
    expect(labelInput.value).toBe("New DB Name");
    // But canvas store update is debounced
    expect(updateNodeSpy).not.toHaveBeenCalled();

    // Advance timers past debounce delay (300ms)
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(updateNodeSpy).toHaveBeenCalledWith("node-db-1", {
      data: expect.objectContaining({
        label: "New DB Name",
      }),
    });

    vi.useRealTimers();
  });

  it("debounces host and port parameter changes", () => {
    vi.useFakeTimers();
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    render(<DatabaseConfig id="node-db-1" nodeId="node-db-1" />);

    const hostInput = screen.getByPlaceholderText("localhost or 127.0.0.1") as HTMLInputElement;

    act(() => {
      fireEvent.change(hostInput, { target: { value: "db.staging.internal" } });
    });

    expect(hostInput.value).toBe("db.staging.internal");
    expect(updateNodeSpy).not.toHaveBeenCalled();

    // Advance timers past debounce delay (300ms)
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(updateNodeSpy).toHaveBeenCalledWith("node-db-1", {
      data: expect.objectContaining({
        host: "db.staging.internal",
      }),
    });

    vi.useRealTimers();
  });

  it("flushes debounced input immediately on blur", () => {
    vi.useFakeTimers();
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    render(<DatabaseConfig id="node-db-1" nodeId="node-db-1" />);

    const labelInput = screen.getByPlaceholderText("e.g. Primary Redis Cache") as HTMLInputElement;

    act(() => {
      fireEvent.focus(labelInput);
      fireEvent.change(labelInput, { target: { value: "Immediate Blur DB" } });
    });

    expect(updateNodeSpy).not.toHaveBeenCalled();

    // Blur immediately flushes
    act(() => {
      fireEvent.blur(labelInput);
    });

    expect(updateNodeSpy).toHaveBeenCalledWith("node-db-1", {
      data: expect.objectContaining({
        label: "Immediate Blur DB",
      }),
    });

    vi.useRealTimers();
  });

  it("flushes debounced input immediately on Enter keypress", () => {
    vi.useFakeTimers();
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    render(<DatabaseConfig id="node-db-1" nodeId="node-db-1" />);

    const labelInput = screen.getByPlaceholderText("e.g. Primary Redis Cache") as HTMLInputElement;

    act(() => {
      fireEvent.change(labelInput, { target: { value: "Enter DB" } });
    });

    expect(updateNodeSpy).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(labelInput, { key: "Enter" });
    });

    expect(updateNodeSpy).toHaveBeenCalledWith("node-db-1", {
      data: expect.objectContaining({
        label: "Enter DB",
      }),
    });

    vi.useRealTimers();
  });

  it("debounces connection string inputs in provider section", () => {
    vi.useFakeTimers();
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({
      nodes: [
        {
          ...mockDbNode,
          data: {
            ...mockDbNode.data,
            provider: "neon",
            dbConnectionType: "connection_string",
          },
        },
      ],
      updateNode: updateNodeSpy,
    });

    render(<DatabaseConfig id="node-db-1" nodeId="node-db-1" />);

    const uriInput = screen.getByPlaceholderText(
      "postgresql://user:password@ep-sample.region.neon.tech/neondb?sslmode=require",
    ) as HTMLInputElement;

    act(() => {
      fireEvent.change(uriInput, {
        target: {
          value: "postgresql://user:pass@ep-custom.neon.tech/db?sslmode=require",
        },
      });
    });

    expect(uriInput.value).toBe(
      "postgresql://user:pass@ep-custom.neon.tech/db?sslmode=require",
    );
    expect(updateNodeSpy).not.toHaveBeenCalled();

    // Advance timers past debounce delay (300ms)
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(updateNodeSpy).toHaveBeenCalledWith("node-db-1", {
      data: expect.objectContaining({
        connectionString:
          "postgresql://user:pass@ep-custom.neon.tech/db?sslmode=require",
      }),
    });

    vi.useRealTimers();
  });
});
