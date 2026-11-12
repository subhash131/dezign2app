import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EffectVariableMappingSection } from "../web-page-event-config/EffectVariableMappingSection";
import type { EffectConfig, SectionStateVariable, PageSection } from "@workspace/canvas";

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
  onValueChange?: (val: string) => void;
}

interface MockSelectSubComponentProps {
  children?: React.ReactNode;
}

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <div data-testid="mock-select" data-value={value}>
      <button
        type="button"
        data-testid="mock-select-pick-search"
        onClick={() => onValueChange?.("curr_sec:searchQuery")}
      >
        SelectSearchQuery
      </button>
      <button
        type="button"
        data-testid="mock-select-pick-store"
        onClick={() => onValueChange?.("store:store-cart:items")}
      >
        SelectCartItems
      </button>
      <button
        type="button"
        data-testid="mock-select-custom"
        onClick={() => onValueChange?.("CUSTOM_PROMPT")}
      >
        SelectCustom
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectGroup: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectLabel: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

describe("EffectVariableMappingSection component", () => {
  const dummyStateObjects: SectionStateVariable[] = [
    { id: "st-1", name: "searchQuery", type: "string" },
    { id: "st-2", name: "category", type: "string" },
  ];

  const dummyStores = [
    {
      id: "store-cart",
      name: "CartStore",
      fields: [
        { id: "f-1", name: "items", type: "CartItem[]" },
        { id: "f-2", name: "total", type: "number" },
      ],
    },
  ];

  it("renders variable mapping section and displays mapped variables", () => {
    const config: EffectConfig = {
      dependencies: ["searchQuery"],
      variableMappings: [
        {
          id: "m-1",
          variableName: "searchQuery",
          source: "section_state",
          varType: "string",
          displayName: "searchQuery",
        },
      ],
      debounceMs: 300,
    };

    const handleChange = vi.fn();

    render(
      <EffectVariableMappingSection
        effectConfig={config}
        onChange={handleChange}
        currentSectionStateObjects={dummyStateObjects}
        stateStores={dummyStores}
        actionName="onSearchDebounce"
      />,
    );

    expect(screen.getByText("Variable Change Trigger Mapping")).toBeDefined();
    expect(screen.getAllByText("searchQuery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("300ms delay")).toBeDefined();
  });

  it("allows mapping a variable from section state", () => {
    const config: EffectConfig = {
      dependencies: [],
      variableMappings: [],
      debounceMs: 0,
    };

    const handleChange = vi.fn();

    render(
      <EffectVariableMappingSection
        effectConfig={config}
        onChange={handleChange}
        currentSectionStateObjects={dummyStateObjects}
        stateStores={dummyStores}
        actionName="onSearchDebounce"
      />,
    );

    // Click mock select to pick searchQuery
    fireEvent.click(screen.getByTestId("mock-select-pick-search"));

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: ["searchQuery"],
        variableMappings: expect.arrayContaining([
          expect.objectContaining({
            variableName: "searchQuery",
            source: "section_state",
          }),
        ]),
      }),
    );
  });

  it("allows mapping a global state store variable", () => {
    const config: EffectConfig = {
      dependencies: [],
      variableMappings: [],
      debounceMs: 0,
    };

    const handleChange = vi.fn();

    render(
      <EffectVariableMappingSection
        effectConfig={config}
        onChange={handleChange}
        currentSectionStateObjects={dummyStateObjects}
        stateStores={dummyStores}
        actionName="onCartChange"
      />,
    );

    fireEvent.click(screen.getByTestId("mock-select-pick-store"));

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: ["items"],
        variableMappings: expect.arrayContaining([
          expect.objectContaining({
            variableName: "items",
            source: "store",
            storeName: "CartStore",
          }),
        ]),
      }),
    );
  });

  it("allows unmapping a variable", () => {
    const config: EffectConfig = {
      dependencies: ["searchQuery"],
      variableMappings: [
        {
          id: "m-1",
          variableName: "searchQuery",
          source: "section_state",
          varType: "string",
        },
      ],
      debounceMs: 0,
    };

    const handleChange = vi.fn();

    render(
      <EffectVariableMappingSection
        effectConfig={config}
        onChange={handleChange}
        currentSectionStateObjects={dummyStateObjects}
        stateStores={dummyStores}
        actionName="onSearchDebounce"
      />,
    );

    const deleteBtn = screen.getByTitle("Unmap searchQuery");
    fireEvent.click(deleteBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: [],
        variableMappings: [],
      }),
    );
  });

  it("allows selecting quick debounce presets", () => {
    const config: EffectConfig = {
      dependencies: ["searchQuery"],
      variableMappings: [],
      debounceMs: 0,
    };

    const handleChange = vi.fn();

    render(
      <EffectVariableMappingSection
        effectConfig={config}
        onChange={handleChange}
        currentSectionStateObjects={dummyStateObjects}
        stateStores={dummyStores}
        actionName="onSearchDebounce"
      />,
    );

    const preset300 = screen.getByText("300ms");
    fireEvent.click(preset300);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        debounceMs: 300,
      }),
    );
  });
});
