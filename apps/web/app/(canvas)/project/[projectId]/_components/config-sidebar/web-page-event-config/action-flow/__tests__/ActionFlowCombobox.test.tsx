import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BackendNode } from "@workspace/canvas";
import { ActionFlowCombobox } from "../ActionFlowCombobox";
import { ResponseFieldPicker } from "../ResponseFieldPicker";

vi.mock("@workspace/ui/components/popover", () => ({
  Popover: ({ children, open }: { children?: React.ReactNode; open?: boolean }) => (
    <div data-testid="mock-popover" data-open={open}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-popover-content">{children}</div>
  ),
}));

describe("ActionFlowCombobox & ResponseFieldPicker", () => {
  it("renders with placeholder and current value", () => {
    const handleChange = vi.fn();
    render(
      <ActionFlowCombobox
        value="presignedUrl"
        onChange={handleChange}
        placeholder="e.g. presignedUrl"
        headerLabel="Suggested Response Fields"
        options={[
          { value: "presignedUrl", type: "string" },
          { value: "url", type: "string" },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText("e.g. presignedUrl") as HTMLInputElement;
    expect(input.value).toBe("presignedUrl");
    expect(screen.getByText("Suggested Response Fields")).toBeDefined();
    expect(screen.getByText("presignedUrl")).toBeDefined();
  });

  it("updates value on typing", () => {
    const handleChange = vi.fn();
    render(
      <ActionFlowCombobox
        value=""
        onChange={handleChange}
        placeholder="Enter field"
        options={["presignedUrl", "url"]}
      />,
    );

    const input = screen.getByPlaceholderText("Enter field");
    fireEvent.change(input, { target: { value: "customKey" } });
    expect(handleChange).toHaveBeenCalledWith("customKey");
  });

  it("selects suggestion item when clicked", () => {
    const handleChange = vi.fn();
    render(
      <ActionFlowCombobox
        value=""
        onChange={handleChange}
        placeholder="Enter field"
        options={[
          { value: "avatar", type: "file" },
          { value: "document", type: "file" },
        ]}
      />,
    );

    const optionBtn = screen.getByText("avatar");
    fireEvent.click(optionBtn);
    expect(handleChange).toHaveBeenCalledWith("avatar");
  });

  it("renders ResponseFieldPicker with suggestions dropdown", () => {
    const handleChange = vi.fn();
    render(
      <ResponseFieldPicker
        value="presignedUrl"
        onChange={handleChange}
        placeholder="e.g. presignedUrl or data.url"
        endpoint={{
          id: "ep-1",
          name: "upload",
          type: "POST",
          responseBody: {
            id: "resp-1",
            fields: [
              { id: "f1", name: "customSignedUrl", type: "string", required: true },
            ],
          },
        }}
      />,
    );

    const input = screen.getByPlaceholderText("e.g. presignedUrl or data.url") as HTMLInputElement;
    expect(input.value).toBe("presignedUrl");
    expect(screen.getByText("customSignedUrl")).toBeDefined();
    // Non-storage picker should not suggest hardcoded upload fields
    expect(screen.queryByText("uploadUrl")).toBeNull();
    expect(screen.queryByText("downloadUrl")).toBeNull();
  });

  it("suggests storage fields when isStorage is true", () => {
    const handleChange = vi.fn();
    render(
      <ResponseFieldPicker
        value=""
        onChange={handleChange}
        isStorage={true}
      />,
    );

    expect(screen.getByText("presignedUrl")).toBeDefined();
    expect(screen.getByText("uploadUrl")).toBeDefined();
    expect(screen.getByText("downloadUrl")).toBeDefined();
  });

  it("suggests transformer return fields from prior transform step", () => {
    const handleChange = vi.fn();
    const mockNodes: BackendNode[] = [
      {
        id: "tr-node-1",
        type: "transformer",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "generateChatId",
          functionName: "generateChatId",
          returnSchema: [
            { id: "f1", name: "id", type: "string", required: true },
            { id: "f2", name: "sessionId", type: "string", required: false },
          ],
        },
      },
    ];

    render(
      <ResponseFieldPicker
        value=""
        onChange={handleChange}
        step={{
          id: "step-1",
          order: 1,
          type: "transform",
          name: "generateChatIdResult",
          outputVariable: "generateChatIdResult",
          transformerNodeId: "tr-node-1",
          transformerName: "generateChatId",
        }}
        allNodes={mockNodes}
      />,
    );

    expect(screen.getByText("id")).toBeDefined();
    expect(screen.getByText("sessionId")).toBeDefined();
  });

  it("suggests transformer return fields when inferred from transformer code", () => {
    const handleChange = vi.fn();
    const mockNodes: BackendNode[] = [
      {
        id: "tr-node-code",
        type: "transformer",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "extractUser",
          code: `function extractUser(data) { return { userId: data.id, role: "admin" }; }`,
        },
      },
    ];

    render(
      <ResponseFieldPicker
        value=""
        onChange={handleChange}
        step={{
          id: "step-1",
          order: 1,
          type: "transform",
          name: "extractUserResult",
          outputVariable: "extractUserResult",
          transformerNodeId: "tr-node-code",
        }}
        allNodes={mockNodes}
      />,
    );

    expect(screen.getByText("userId")).toBeDefined();
    expect(screen.getByText("role")).toBeDefined();
  });
});
