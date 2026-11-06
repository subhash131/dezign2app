import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionFlowCombobox } from "../ActionFlowCombobox";
import { ResponseFieldPicker } from "../ResponseFieldPicker";

vi.mock("@workspace/ui/components/popover", () => ({
  Popover: ({ children, open }: any) => (
    <div data-testid="mock-popover" data-open={open}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => (
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
});
