import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariableStepSection } from "../VariableStepSection";
import { PipelineStepDraft, StepBinding } from "../types";

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
  onValueChange?: (val: string) => void;
}

interface MockSelectItemProps {
  children?: React.ReactNode;
  value?: string;
}

const selectChangeHandlers = new Map<string, (val: string) => void>();

vi.mock("@workspace/ui/components/select", () => {
  return {
    Select: ({ children, value, onValueChange }: MockSelectProps) => {
      const id = String(value ?? "default");
      if (onValueChange) {
        selectChangeHandlers.set(id, onValueChange);
      }
      return (
        <div data-testid="mock-select" data-value={value}>
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ __selectId?: string }>, {
                  __selectId: id,
                })
              : child,
          )}
        </div>
      );
    },
    SelectTrigger: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <button role="combobox" className={className}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) => (
      <span>{children || placeholder}</span>
    ),
    SelectContent: ({
      children,
      __selectId,
    }: {
      children?: React.ReactNode;
      __selectId?: string;
    }) => (
      <div>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<{ __selectId?: string }>, {
                __selectId,
              })
            : child,
        )}
      </div>
    ),
    SelectItem: ({
      children,
      value,
      __selectId,
    }: MockSelectItemProps & { __selectId?: string }) => (
      <button
        type="button"
        data-testid={`select-item-${value}`}
        onClick={() => {
          if (__selectId && value !== undefined) {
            selectChangeHandlers.get(__selectId)?.(value);
          }
        }}
      >
        {children}
      </button>
    ),
    SelectSeparator: () => <hr />,
  };
});

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

describe("VariableStepSection type change & inline value coercion", () => {
  it("updates the default initial value when variableDataType changes", () => {
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
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("select-item-number"));
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
        onChange={onChange}
      />,
    );
    expect(screen.getByText("let count: number = 0;")).toBeDefined();

    fireEvent.click(screen.getByTestId("select-item-boolean"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "boolean",
        variableSource: { kind: "inline", value: false },
      }),
    );

    const boolStep: PipelineStepDraft = {
      ...baseStep,
      variableDataType: "boolean",
      variableSource: { kind: "inline", value: false },
    };
    rerender(
      <VariableStepSection
        step={boolStep}
        priorSteps={[]}
        availableSources={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("select-item-string[]"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "string[]",
        variableSource: { kind: "inline", value: "[]" },
      }),
    );

    const arrStep: PipelineStepDraft = {
      ...baseStep,
      variableDataType: "string[]",
      variableSource: { kind: "inline", value: "[]" },
    };
    rerender(
      <VariableStepSection
        step={arrStep}
        priorSteps={[]}
        availableSources={[]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("let count: string[] = [];")).toBeDefined();

    fireEvent.click(screen.getByTestId("select-item-object"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variableDataType: "object",
        variableSource: { kind: "inline", value: "{}" },
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

    fireEvent.click(screen.getByTestId("select-item-number"));
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
