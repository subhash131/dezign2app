import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionBlock } from "../SectionBlock";
import { SectionActionRow } from "../SectionActionRow";
import { PageSection, UIEventItem } from "@/types/canvas";

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

describe("WebPage Event Addition and Auto-Discard", () => {
  it("when an event is added in SectionBlock, it activates the input with empty value", () => {
    const section: PageSection = {
      id: "sec-1",
      name: "Main Section",
      actions: [],
    };
    const updateSections = vi.fn();

    const { rerender } = render(
      <SectionBlock
        nodeId="node-1"
        section={section}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
      />,
    );

    // Click "Add action"
    const addActionBtn = screen.getByRole("button", { name: /add action/i });
    fireEvent.click(addActionBtn);

    // Verify updateSections was called with a new action having empty name
    expect(updateSections).toHaveBeenCalledTimes(1);
    const updatedSections = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updatedSections[0]?.actions).toHaveLength(1);
    const addedAction = updatedSections[0]?.actions[0];
    expect(addedAction?.name).toBe("");
    expect(addedAction?.event).toBe("click");

    // Rerender with the updated section to verify it renders the input field
    rerender(
      <SectionBlock
        nodeId="node-1"
        section={updatedSections[0]!}
        sections={updatedSections}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
      />,
    );

    // The input field should be active and have an empty value
    const input = screen.getByPlaceholderText(/action name/i) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("");
  });

  it("saves the event if the user enters a name and presses Enter", () => {
    const action: UIEventItem = {
      id: "act-1",
      name: "",
      event: "click",
    };
    const section: PageSection = {
      id: "sec-1",
      name: "Main Section",
      actions: [action],
    };
    const updateSections = vi.fn();

    render(
      <SectionActionRow
        nodeId="node-1"
        sectionId="sec-1"
        action={action}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditing={true}
      />,
    );

    const input = screen.getByPlaceholderText(/action name/i);
    fireEvent.change(input, { target: { value: "submitForm" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated[0]?.actions[0]?.name).toBe("submitForm");
  });

  it("discards the event if the user submits with an empty name on Enter", () => {
    const action: UIEventItem = {
      id: "act-1",
      name: "",
      event: "click",
    };
    const section: PageSection = {
      id: "sec-1",
      name: "Main Section",
      actions: [action],
    };
    const updateSections = vi.fn();

    render(
      <SectionActionRow
        nodeId="node-1"
        sectionId="sec-1"
        action={action}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditing={true}
      />,
    );

    const input = screen.getByPlaceholderText(/action name/i);
    fireEvent.keyDown(input, { key: "Enter" });

    // Should discard the event (action removed from section)
    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated[0]?.actions).toHaveLength(0);
  });

  it("discards the event if the user presses Escape with empty name", () => {
    const action: UIEventItem = {
      id: "act-1",
      name: "",
      event: "click",
    };
    const section: PageSection = {
      id: "sec-1",
      name: "Main Section",
      actions: [action],
    };
    const updateSections = vi.fn();

    render(
      <SectionActionRow
        nodeId="node-1"
        sectionId="sec-1"
        action={action}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditing={true}
      />,
    );

    const input = screen.getByPlaceholderText(/action name/i);
    fireEvent.keyDown(input, { key: "Escape" });

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated[0]?.actions).toHaveLength(0);
  });

  it("discards the event on blur if left with empty name", () => {
    const action: UIEventItem = {
      id: "act-1",
      name: "",
      event: "click",
    };
    const section: PageSection = {
      id: "sec-1",
      name: "Main Section",
      actions: [action],
    };
    const updateSections = vi.fn();

    render(
      <SectionActionRow
        nodeId="node-1"
        sectionId="sec-1"
        action={action}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditing={true}
      />,
    );

    const input = screen.getByPlaceholderText(/action name/i);
    fireEvent.blur(input.parentElement!);

    expect(updateSections).toHaveBeenCalledTimes(1);
    const updated = updateSections.mock.calls[0]![0] as PageSection[];
    expect(updated[0]?.actions).toHaveLength(0);
  });

  it("reverts an existing named action instead of deleting if emptied on Escape", () => {
    const action: UIEventItem = {
      id: "act-1",
      name: "existingAction",
      event: "click",
    };
    const section: PageSection = {
      id: "sec-1",
      name: "Main Section",
      actions: [action],
    };
    const updateSections = vi.fn();

    render(
      <SectionActionRow
        nodeId="node-1"
        sectionId="sec-1"
        action={action}
        sections={[section]}
        updateSections={updateSections}
        getLinkedEndpoint={() => null}
        onTriggerEvent={() => {}}
        isEditing={true}
      />,
    );

    const input = screen.getByPlaceholderText(/action name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // updateSections should NOT have deleted the action
    expect(updateSections).not.toHaveBeenCalled();
  });
});
