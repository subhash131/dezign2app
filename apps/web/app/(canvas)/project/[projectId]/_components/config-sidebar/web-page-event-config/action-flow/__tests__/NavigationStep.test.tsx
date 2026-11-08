import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BackendNode } from "@workspace/canvas";
import { NavigationStep } from "../NavigationStep";
import type { FrontendActionStepDraft } from "../types";

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
  onValueChange?: (val: string) => void;
}

interface MockSelectSubComponentProps {
  children?: React.ReactNode;
}

interface MockSelectValueProps {
  placeholder?: string;
}

interface MockSelectItemProps {
  children?: React.ReactNode;
  value?: string;
}

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

const MockSelectContext = React.createContext<{
  value?: string;
  onValueChange?: (val: string) => void;
}>({});

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <MockSelectContext.Provider value={{ value, onValueChange }}>
      <div data-testid="mock-select" data-value={value}>
        {children}
      </div>
    </MockSelectContext.Provider>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => {
    const context = React.useContext(MockSelectContext);
    return (
      <div
        data-testid={`select-item-${value ?? ""}`}
        data-value={value}
        onClick={() => {
          if (value && context.onValueChange) {
            context.onValueChange(value);
          }
        }}
      >
        {children}
      </div>
    );
  },
}));

describe("NavigationStep component", () => {
  const dummyNodes: BackendNode[] = [
    {
      id: "page-home",
      fractionalIndex:"a0",
      type: "webPage",
      position: { x: 0, y: 0 },
      data: {
        label: "/",
        isRoot: true,
      },
    },
    {
      id: "page-dashboard",
      fractionalIndex:"a1",
      type: "webPage",
      position: { x: 100, y: 0 },
      data: {
        label: "Dashboard",
        path: "/dashboard",
      },
    },
    {
      id: "page-user-detail",
      fractionalIndex:"a6",
      type: "webPage",
      position: { x: 200, y: 0 },
      data: {
        label: "User Detail",
        path: "/users/[id]",
        pathParams: [{ id: "p1", name: "id", type: "string", required: false }],
      },
    },
    {
      id: "store-user",
      fractionalIndex:"a5",
      type: "state_store",
      position: { x: 300, y: 0 },
      data: {
        label: "userStore",
        storeName: "userStore",
        fields: [
          { id: "f1", name: "selectedUserId", type: "string",  },
          { id: "f2", name: "currentRole", type: "string" },
        ],
      },
    },
  ];

  it("renders navigation destination input and quick route options", () => {
    const draft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "navigation",
      navType: "route",
      targetRoute: "/",
    };

    const handleChange = vi.fn();

    render(
      <NavigationStep
        draft={draft}
        allNodes={dummyNodes}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText("Route Path / Destination")).toBeDefined();
    expect(screen.getByText("Compiled Navigation Call")).toBeDefined();
    expect(screen.getByText('router.push("/")')).toBeDefined();

    // Verify quick route pills exist
    expect(screen.getByText("/dashboard")).toBeDefined();
    expect(screen.getByText("/users/[id]")).toBeDefined();
  });

  it("selects a configured dynamic route when clicking a quick route pill", () => {
    const draft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "navigation",
      navType: "route",
      targetRoute: "/",
    };

    const handleChange = vi.fn();

    render(
      <NavigationStep
        draft={draft}
        allNodes={dummyNodes}
        onChange={handleChange}
      />,
    );

    const userPill = screen.getByText("/users/[id]");
    fireEvent.click(userPill);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRoute: "/users/[id]",
        targetPageId: "page-user-detail",
        pathParamBindings: expect.arrayContaining([
          expect.objectContaining({
            paramName: "id",
          }),
        ]),
      }),
    );
  });

  it("displays the dynamic route parameter mapping panel when target route contains dynamic segments", () => {
    const draft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "navigation",
      navType: "route",
      targetRoute: "/users/[id]",
      pathParamBindings: [
        {
          paramName: "id",
          source: { kind: "literal", value: "usr_100" },
        },
      ],
    };

    const handleChange = vi.fn();

    render(
      <NavigationStep
        draft={draft}
        allNodes={dummyNodes}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText("Dynamic Route Parameter Mapping")).toBeDefined();
    expect(screen.getAllByText("[id]").length).toBeGreaterThan(0);
    expect(screen.getByText("Static Literal")).toBeDefined();
    // Live preview resolves literal value
    expect(screen.getByText('router.push("/users/usr_100")')).toBeDefined();
  });

  it("maps dynamic segment to prior step response and updates live preview", () => {
    const priorStep: FrontendActionStepDraft = {
      id: "step-api",
      order: 1,
      type: "api_call",
      endpointId: "ep-create-user",
    };

    const draft: FrontendActionStepDraft = {
      id: "step-2",
      order: 2,
      type: "navigation",
      navType: "route",
      targetRoute: "/users/[id]",
      pathParamBindings: [
        {
          paramName: "id",
          source: {
            kind: "prev_response",
            stepId: "step-api",
            fieldPath: "data.id",
          },
        },
      ],
    };

    const handleChange = vi.fn();

    render(
      <NavigationStep
        draft={draft}
        allNodes={dummyNodes}
        allSteps={[priorStep, draft]}
        stepIndex={1}
        onChange={handleChange}
      />,
    );

    // Dynamic template preview with backticks
    expect(screen.getByText("router.push(`/users/${step.data.id}`)")).toBeDefined();
    expect(screen.getByText("Prior Step Response")).toBeDefined();
  });

  it("updates navMethod when user selects history_push", () => {
    const draft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "navigation",
      navType: "route",
      targetRoute: "/chat/[conversationId]",
      navMethod: "router_push",
    };

    const handleChange = vi.fn();

    render(
      <NavigationStep
        draft={draft}
        allNodes={dummyNodes}
        onChange={handleChange}
      />,
    );

    const historyPushItem = screen.getByTestId("select-item-history_push");
    fireEvent.click(historyPushItem);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        navMethod: "history_push",
      }),
    );
  });

  it("renders live preview for history_push with dynamic conversationId", () => {
    const draft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "navigation",
      navType: "route",
      targetRoute: "/chat/[conversationId]",
      navMethod: "history_push",
      pathParamBindings: [
        {
          paramName: "conversationId",
          source: {
            kind: "prev_response",
            stepId: "step-api",
            fieldPath: "conversationId",
          },
        },
      ],
    };

    render(
      <NavigationStep
        draft={draft}
        allNodes={dummyNodes}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText("history.pushState({}, \"\", `/chat/${step.conversationId}`)")
    ).toBeDefined();
  });

  it("renders live preview for history_replace and router_replace", () => {
    const replaceDraft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "navigation",
      navType: "route",
      targetRoute: "/chat/[conversationId]",
      navMethod: "history_replace",
      pathParamBindings: [
        {
          paramName: "conversationId",
          source: { kind: "literal", value: "abc-123" },
        },
      ],
    };

    const { rerender } = render(
      <NavigationStep
        draft={replaceDraft}
        allNodes={dummyNodes}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('history.replaceState({}, "", "/chat/abc-123")')
    ).toBeDefined();

    rerender(
      <NavigationStep
        draft={{ ...replaceDraft, navMethod: "router_replace" }}
        allNodes={dummyNodes}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('router.replace("/chat/abc-123")')
    ).toBeDefined();
  });
});
