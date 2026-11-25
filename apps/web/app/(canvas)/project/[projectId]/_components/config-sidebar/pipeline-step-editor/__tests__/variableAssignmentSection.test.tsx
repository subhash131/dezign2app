import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VariableStepSection } from "../VariableStepSection";
import { PipelineStepDraft } from "../types";

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
  onValueChange?: (val: string) => void;
}

interface MockSelectTriggerProps {
  children?: React.ReactNode;
  className?: string;
}

interface MockSelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

interface MockSelectContentProps {
  children?: React.ReactNode;
}

interface MockSelectItemProps {
  children?: React.ReactNode;
  value?: string;
}

interface MockComboboxProps {
  children?: React.ReactNode;
  items?: readonly string[];
  value?: string | null;
}

interface MockComboboxInputProps {
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

interface MockComboboxContentProps {
  children?: React.ReactNode;
}

interface MockComboboxListProps {
  children?: React.ReactNode;
}

interface MockComboboxItemProps {
  children?: React.ReactNode;
  value?: string;
  className?: string;
}

interface MockComboboxEmptyProps {
  children?: React.ReactNode;
  className?: string;
}

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <div data-testid="mock-select" data-value={value} onClick={() => onValueChange?.("=")}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, className }: MockSelectTriggerProps) => (
    <button role="combobox" className={className}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder, children }: MockSelectValueProps) => (
    <span>{children || placeholder}</span>
  ),
  SelectContent: ({ children }: MockSelectContentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => (
    <div data-testid="mock-select-item" data-value={value}>
      {children}
    </div>
  ),
  SelectSeparator: () => <hr />,
}));

vi.mock("@workspace/ui/components/combobox", () => ({
  Combobox: ({ children, items, value }: MockComboboxProps) => (
    <div data-testid="mock-combobox" data-items={JSON.stringify(items)} data-value={value ?? ""}>
      {children}
    </div>
  ),
  ComboboxInput: (props: MockComboboxInputProps) => <input data-testid="combobox-input" {...props} />,
  ComboboxContent: ({ children }: MockComboboxContentProps) => <div data-testid="combobox-content">{children}</div>,
  ComboboxList: ({ children }: MockComboboxListProps) => <div data-testid="combobox-list">{children}</div>,
  ComboboxItem: ({ children, value }: MockComboboxItemProps) => (
    <div data-testid="combobox-item" data-value={value}>
      {children}
    </div>
  ),
  ComboboxEmpty: ({ children }: MockComboboxEmptyProps) => <div data-testid="combobox-empty">{children}</div>,
}));

vi.mock("../BindingSourceEditor", () => ({
  BindingSourceEditor: () => <div data-testid="mock-binding-source-editor" />,
}));

describe("VariableStepSection with TargetVariableCombobox and mutation modes", () => {
  const mockPriorSteps: PipelineStepDraft[] = [
    {
      id: "step-1",
      name: "Fetch User",
      type: "variable",
      outputVariable: "userObj",
      declarationKind: "const",
      variableOperation: "declare",
      variableDataType: "object",
      outputSchema: [
        { name: "id", type: "string" },
        { name: "email", type: "string" },
        { name: "status", type: "string" },
      ],
    },
    {
      id: "step-2",
      name: "Cart Items",
      type: "variable",
      outputVariable: "items",
      declarationKind: "const",
      variableOperation: "declare",
      variableDataType: "string[]",
    },
    {
      id: "step-3",
      name: "Order Count",
      type: "variable",
      outputVariable: "totalCount",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "number",
    },
    {
      id: "step-4",
      name: "Transform Step",
      type: "transform",
      outputVariable: "transformedResult",
      declarationKind: "const",
    },
  ];

  it("renders TargetVariableCombobox with prior variables when in assign mode", () => {
    const step: PipelineStepDraft = {
      id: "step-assign",
      name: "Assign variable",
      type: "variable",
      outputVariable: "userObj",
      variableOperation: "assign",
      declarationKind: "reassign",
      variableMutationKind: "property",
      variablePropertyPath: "status",
      variableOperator: "=",
    };

    const handleChange = vi.fn();

    render(
      <VariableStepSection
        step={step}
        priorSteps={mockPriorSteps}
        availableSources={[]}
        onChange={handleChange}
      />,
    );

    const comboboxEl = screen.getByTestId("mock-combobox");
    expect(comboboxEl).toBeDefined();

    const itemsAttr = comboboxEl.getAttribute("data-items") || "[]";
    const parsedItems: string[] = JSON.parse(itemsAttr);
    expect(parsedItems).toContain("userObj");
    expect(parsedItems).toContain("items");
    expect(parsedItems).toContain("totalCount");
    expect(parsedItems).not.toContain("transformedResult");
  });

  it("renders object property mutation options when target variable is an object", () => {
    const step: PipelineStepDraft = {
      id: "step-assign",
      name: "Assign variable",
      type: "variable",
      outputVariable: "userObj",
      variableOperation: "assign",
      declarationKind: "reassign",
      variableMutationKind: "property",
      variablePropertyPath: "status",
      variableOperator: "=",
    };

    render(
      <VariableStepSection
        step={step}
        priorSteps={mockPriorSteps}
        availableSources={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Update Property (.prop)")).toBeDefined();
    expect(screen.getByText("Object Property to Mutate")).toBeDefined();
  });

  it("renders array push mode when target variable is an array", () => {
    const step: PipelineStepDraft = {
      id: "step-assign-arr",
      name: "Push to items",
      type: "variable",
      outputVariable: "items",
      variableOperation: "assign",
      declarationKind: "reassign",
      variableMutationKind: "array_push",
      variableOperator: "push",
    };

    render(
      <VariableStepSection
        step={step}
        priorSteps={mockPriorSteps}
        availableSources={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Append / Push (.push)")).toBeDefined();
    expect(screen.getByText(".push(item)")).toBeDefined();
  });

  it("shows an empty state notice when no prior steps declare variables", () => {
    const step: PipelineStepDraft = {
      id: "step-assign-empty",
      name: "Assign variable",
      type: "variable",
      outputVariable: "customVar2",
      variableOperation: "assign",
      declarationKind: "reassign",
    };

    render(
      <VariableStepSection
        step={step}
        priorSteps={[]}
        availableSources={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/No variables declared in prior steps yet/i)).toBeDefined();
  });
});
