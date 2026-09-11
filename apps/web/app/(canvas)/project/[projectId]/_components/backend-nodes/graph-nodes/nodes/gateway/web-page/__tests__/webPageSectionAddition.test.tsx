import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionList } from "../SectionList";
import { SectionBlock } from "../SectionBlock";
import { PageSection, BackendNode } from "@/types/canvas";

// Mock @xyflow/react
vi.mock("@xyflow/react", () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useUpdateNodeInternals: () => vi.fn(),
}));

// Mock zustand canvas store
vi.mock("@/lib/stores/backendCanvasStore", () => ({
  useBackendCanvasStore: Object.assign(
    vi.fn((selector) => {
      const state = {
        edges: [],
        nodes: [],
        endpoints: [],
        setActiveConfigItem: vi.fn(),
        deleteEdge: vi.fn(),
        deleteNode: vi.fn(),
      };
      return selector ? selector(state) : state;
    }),
    {
      getState: () => ({
        edges: [],
        nodes: [],
        endpoints: [],
        setActiveConfigItem: vi.fn(),
        deleteEdge: vi.fn(),
        deleteNode: vi.fn(),
      }),
    },
  ),
}));

// Mock section collapse store
vi.mock("@/lib/stores/sectionCollapseStore", () => ({
  useSectionCollapseStore: vi.fn((selector) => {
    const state = {
      isSectionCollapsed: () => false,
      setSectionCollapsed: vi.fn(),
      toggleSectionCollapsed: vi.fn(),
      deleteSectionCollapseState: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

describe("WebPage Section Addition and Auto-Discard", () => {
  it("when a section is added via SectionList, it activates the input with empty value", () => {
    const updateNode = vi.fn();
    const data: BackendNode["data"] = {
      label: "Home",
      sections: [],
    };

    const { rerender } = render(
      <SectionList
        nodeId="node-1"
        sections={[]}
        updateNode={updateNode}
        data={data}
        onTriggerEvent={() => {}}
      />,
    );

    // Click "Add Section" plus icon in header
    const addSectionBtn = screen.getByTitle(/add section/i);
    fireEvent.click(addSectionBtn);

    // Verify updateNode was called with a new section having empty name
    expect(updateNode).toHaveBeenCalledTimes(1);
    const updatedCall = updateNode.mock.calls[0]!;
    expect(updatedCall[0]).toBe("node-1");
    const updatedSections = updatedCall[1]?.data?.sections as PageSection[];
    expect(updatedSections).toHaveLength(1);
    expect(updatedSections[0]?.name).toBe("");

    // Rerender SectionList with the newly created section
    rerender(
      <SectionList
        nodeId="node-1"
        sections={updatedSections}
        updateNode={updateNode}
        data={{ ...data, sections: updatedSections }}
        onTriggerEvent={() => {}}
      />,
    );

    // Input field should be active and empty
    const input = screen.getByPlaceholderText(/section name/i) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("");
  });

  it("saves the section if the user enters a name and presses Enter", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "",
      actions: [],
    };
    const updateSections = vi.fn();

    render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditingName={true}
      />,
    );

    const input = screen.getByPlaceholderText(/section name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "HeroSection" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated).toHaveLength(1);
    expect(updated[0]?.name).toBe("HeroSection");
  });

  it("discards the section if the user submits with an empty name on Enter", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "",
      actions: [],
    };
    const updateSections = vi.fn();

    render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditingName={true}
      />,
    );

    const input = screen.getByPlaceholderText(/section name/i);
    fireEvent.keyDown(input, { key: "Enter" });

    // Should discard the section (sections array becomes empty)
    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated).toHaveLength(0);
  });

  it("discards the section if the user presses Escape with empty name", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "",
      actions: [],
    };
    const updateSections = vi.fn();

    render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditingName={true}
      />,
    );

    const input = screen.getByPlaceholderText(/section name/i);
    fireEvent.keyDown(input, { key: "Escape" });

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated).toHaveLength(0);
  });

  it("discards the section on blur if left with empty name", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "",
      actions: [],
    };
    const updateSections = vi.fn();

    render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditingName={true}
      />,
    );

    const input = screen.getByPlaceholderText(/section name/i);
    fireEvent.blur(input);

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated).toHaveLength(0);
  });

  it("saves the section on blur if a name was entered", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "",
      actions: [],
    };
    const updateSections = vi.fn();

    render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditingName={true}
      />,
    );

    const input = screen.getByPlaceholderText(/section name/i);
    fireEvent.change(input, { target: { value: "PricingPlans" } });
    fireEvent.blur(input);

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated).toHaveLength(1);
    expect(updated[0]?.name).toBe("PricingPlans");
  });

  it("reverts an existing named section instead of deleting if emptied on Escape", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "ExistingSection",
      actions: [],
    };
    const updateSections = vi.fn();

    render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditingName={true}
      />,
    );

    const input = screen.getByPlaceholderText(/section name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // Should NOT delete the section
    expect(updateSections).not.toHaveBeenCalled();
  });
});
