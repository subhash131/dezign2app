import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariableStepSection } from "../VariableStepSection";
import { PipelineStepDraft, StepBinding } from "../types";
import type { BackendNode } from "@/types/canvas";

interface MockComboboxProps {
  children?: React.ReactNode;
  items?: readonly string[];
  value?: string | null;
  onValueChange?: (val: string | null) => void;
}

const comboboxChangeHandlers = new Map<string, (val: string) => void>();

vi.mock("@workspace/ui/components/combobox", () => ({
  Combobox: ({ children, items, value, onValueChange }: MockComboboxProps) => {
    const id = String(value ?? "default");
    if (onValueChange) {
      comboboxChangeHandlers.set(id, (v) => onValueChange(v));
    }
    return (
      <div
        data-testid="mock-combobox"
        data-items={JSON.stringify(items)}
        data-value={value ?? ""}
      >
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ __cbId?: string; __items?: readonly string[] }>,
                { __cbId: id, __items: items },
              )
            : child,
        )}
      </div>
    );
  },
  ComboboxInput: ({
    value,
    placeholder,
    className,
  }: {
    value?: string;
    placeholder?: string;
    className?: string;
  }) => <input data-testid="combobox-input" defaultValue={value} placeholder={placeholder} className={className} />,
  ComboboxContent: ({
    children,
    __cbId,
    __items,
  }: {
    children?: React.ReactNode;
    __cbId?: string;
    __items?: readonly string[];
  }) => (
    <div data-testid="combobox-content">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ __cbId?: string; __items?: readonly string[] }>,
              { __cbId, __items },
            )
          : child,
      )}
    </div>
  ),
  ComboboxList: ({
    children,
    __cbId,
    __items,
  }: {
    children?: React.ReactNode | ((item: string) => React.ReactNode);
    __cbId?: string;
    __items?: readonly string[];
  }) => (
    <div data-testid="combobox-list">
      {typeof children === "function" && Array.isArray(__items)
        ? __items.map((item) => {
            const rendered = children(item);
            return React.isValidElement(rendered)
              ? React.cloneElement(
                  rendered as React.ReactElement<{ __cbId?: string }>,
                  { key: item, __cbId },
                )
              : rendered;
          })
        : (children as React.ReactNode)}
    </div>
  ),
  ComboboxItem: ({
    children,
    value,
    __cbId,
  }: {
    children?: React.ReactNode;
    value?: string;
    __cbId?: string;
  }) => (
    <button
      type="button"
      data-testid={`type-item-${value}`}
      onClick={() => {
        if (__cbId && value !== undefined) {
          comboboxChangeHandlers.get(__cbId)?.(value);
        }
      }}
    >
      {children}
    </button>
  ),
  ComboboxEmpty: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="combobox-empty">{children}</div>
  ),
}));

vi.mock("../BindingSourceEditor", () => ({
  BindingSourceEditor: ({
    binding,
    onChange,
  }: {
    binding: StepBinding;
    onChange: (b: StepBinding) => void;
  }) => (
    <div>
      <input
        data-testid="mock-inline-input"
        value={binding.source.kind === "inline" ? String(binding.source.value) : ""}
        onChange={(e) =>
          onChange({
            ...binding,
            source: { kind: "inline", value: e.target.value },
          })
        }
      />
      <button
        type="button"
        data-testid="switch-to-inline"
        onClick={() =>
          onChange({
            ...binding,
            source: { kind: "inline", value: "" },
          })
        }
      >
        Switch Inline
      </button>
    </div>
  ),
}));

const mockTypesNodes: BackendNode[] = [
  {
    id: "types-node-1",
    type: "types",
    position: { x: 0, y: 0 },
    data: {
      label: "Domain Types",
      types: [
        {
          id: "t-user",
          name: "UserProfile",
          kind: "interface",
          description: "User profile model",
          fields: [
            { id: "f1", name: "id", type: "string", required: true, isArray: false },
          ],
        },
        {
          id: "t-status",
          name: "OrderStatus",
          kind: "enum",
          enumValues: ["pending", "paid"],
          fields: [],
        },
      ],
    },
  } as unknown as BackendNode,
];

describe("VariableStepSection type selector, array [] toggle, and TypesNode types", () => {
  it("lists primitive types and custom types from TypesNode and updates initial value on type/array change", () => {
    const onChange = vi.fn();
    const baseStep: PipelineStepDraft = {
      id: "v1",
      name: "Variable: count",
      type: "variable",
      outputVariable: "count",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "string",
      variableSource: { kind: "inline", value: "" },
    };

    const { rerender } = render(
      <VariableStepSection
        step={baseStep}
        priorSteps={[]}
        availableSources={[]}
        allNodes={mockTypesNodes}
        onChange={onChange}
      />,
    );

    // Only real TypeScript primitive types + TypesNode custom types (no Date/UUID/timestamp/inferred)
    expect(screen.queryByTestId("type-item-Date")).toBeNull();
    expect(screen.queryByTestId("type-item-UUID")).toBeNull();
    expect(screen.queryByTestId("type-item-timestamp")).toBeNull();
    expect(screen.queryByTestId("type-item-(inferred)")).toBeNull();
    expect(screen.getByTestId("type-item-string")).toBeDefined();
    expect(screen.getByTestId("type-item-number")).toBeDefined();
    expect(screen.getByTestId("type-item-boolean")).toBeDefined();
    expect(screen.getByTestId("type-item-Record<string, number>")).toBeDefined();

    // Custom types from TypesNode are present in the combobox
    expect(screen.getByTestId("type-item-UserProfile")).toBeDefined();
    expect(screen.getByTestId("type-item-OrderStatus")).toBeDefined();

    // Selecting "number" updates initial value to 0
    fireEvent.click(screen.getByTestId("type-item-number"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "number",
        variableSource: { kind: "inline", value: 0 },
      }),
    );

    const numberStep: PipelineStepDraft = {
      ...baseStep,
      variableDataType: "number",
      variableSource: { kind: "inline", value: 0 },
    };
    rerender(
      <VariableStepSection
        step={numberStep}
        priorSteps={[]}
        availableSources={[]}
        allNodes={mockTypesNodes}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("let count: number = 0;")).toBeDefined();

    // Toggling [] button turns "number" into "number[]" and sets initial value to "[]"
    const arrayToggleBtn = screen.getByRole("button", { name: "[]" });
    fireEvent.click(arrayToggleBtn);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "number[]",
        variableSource: { kind: "inline", value: "[]" },
      }),
    );

    const numberArrayStep: PipelineStepDraft = {
      ...baseStep,
      variableDataType: "number[]",
      variableSource: { kind: "inline", value: "[]" },
    };
    rerender(
      <VariableStepSection
        step={numberArrayStep}
        priorSteps={[]}
        availableSources={[]}
        allNodes={mockTypesNodes}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("let count: number[] = [];")).toBeDefined();

    // Toggling [] button off returns to "number" with initial value 0
    fireEvent.click(screen.getByRole("button", { name: "[]" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "number",
        variableSource: { kind: "inline", value: 0 },
      }),
    );
  });

  it("selects a custom interface type from TypesNode and supports array [] toggle", () => {
    const onChange = vi.fn();
    const baseStep: PipelineStepDraft = {
      id: "v-custom",
      name: "Variable: profile",
      type: "variable",
      outputVariable: "profile",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "string",
      variableSource: { kind: "inline", value: "" },
    };

    const { rerender } = render(
      <VariableStepSection
        step={baseStep}
        priorSteps={[]}
        availableSources={[]}
        allNodes={mockTypesNodes}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("type-item-UserProfile"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "UserProfile",
        variableSource: { kind: "inline", value: "{}" },
      }),
    );

    rerender(
      <VariableStepSection
        step={{
          ...baseStep,
          variableDataType: "UserProfile",
          variableSource: { kind: "inline", value: "{}" },
        }}
        priorSteps={[]}
        availableSources={[]}
        allNodes={mockTypesNodes}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("let profile: UserProfile = {};")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "[]" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "UserProfile[]",
        variableSource: { kind: "inline", value: "[]" },
      }),
    );
  });

  it("coerces entered '0' string to numeric 0 when variableDataType is number", () => {
    const onChange = vi.fn();
    const step: PipelineStepDraft = {
      id: "v2",
      name: "Variable: total",
      type: "variable",
      outputVariable: "total",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "number",
      variableSource: { kind: "inline", value: 42 },
    };

    render(
      <VariableStepSection
        step={step}
        priorSteps={[]}
        availableSources={[]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("mock-inline-input"), {
      target: { value: "0" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableSource: { kind: "inline", value: 0 },
      }),
    );
  });

  it("does not overwrite non-inline variableSource when type changes", () => {
    const onChange = vi.fn();
    const step: PipelineStepDraft = {
      id: "v3",
      name: "Variable: age",
      type: "variable",
      outputVariable: "age",
      declarationKind: "const",
      variableOperation: "declare",
      variableDataType: "string",
      variableSource: { kind: "req_body", field: "age" },
    };

    render(
      <VariableStepSection
        step={step}
        priorSteps={[]}
        availableSources={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("type-item-number"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "number",
        variableSource: { kind: "req_body", field: "age" },
      }),
    );
  });

  it("initializes type-appropriate default when switching from non-inline source back to inline", () => {
    const onChange = vi.fn();
    const step: PipelineStepDraft = {
      id: "v4",
      name: "Variable: count",
      type: "variable",
      outputVariable: "count",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "number",
      variableSource: { kind: "req_body", field: "count" },
    };

    render(
      <VariableStepSection
        step={step}
        priorSteps={[]}
        availableSources={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("switch-to-inline"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableSource: { kind: "inline", value: 0 },
      }),
    );
  });
});
