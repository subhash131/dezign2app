import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BackendNode, Endpoint } from "@workspace/canvas";
import { ApiCallStep } from "../ApiCallStep";
import { buildInitialBindingsFromEndpoint } from "../utils";
import type { FrontendActionStepDraft } from "../types";


// Mock @workspace/ui components
vi.mock("@workspace/ui/components/popover", () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));


vi.mock("../ActionFlowCombobox", () => ({
  ActionFlowCombobox: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange: (val: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="mock-combobox"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));


const MockSelectContext = React.createContext<{ onValueChange?: (val: string) => void }>({});


vi.mock("@workspace/ui/components/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (val: string) => void;
  }) => (
    <MockSelectContext.Provider value={{ onValueChange }}>
      <div data-testid="mock-select" data-value={value}>
        {children}
      </div>
    </MockSelectContext.Provider>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => {
    const ctx = React.useContext(MockSelectContext);
    return (
      <button
        type="button"
        data-testid={`mock-select-item-${value}`}
        data-value={value}
        onClick={() => {
          if (value !== undefined) {
            ctx.onValueChange?.(value);
          }
        }}
      >
        {children}
      </button>
    );
  },
}));


describe("buildInitialBindingsFromEndpoint", () => {
  const sampleEndpoint: Endpoint = {
    id: "ep-users",
    name: "/api/users/:userId",
    type: "POST",
    headers: [
      { id: "h1", name: "X-Custom-Client", type: "string", required: true },
    ],
    pathParams: [
      { id: "p1", name: "userId", type: "string", required: true },
    ],
    queryParams: [
      { id: "q1", name: "includeDetails", type: "boolean", required: false },
    ],
    requestBody: {
      id: "b1",
      fields: [
        { id: "f1", name: "email", type: "string", required: true },
        { id: "f2", name: "fullName", type: "string", required: false },
      ],
    },
  };


  it("should generate slot-aware bindings for headers, pathParams, queryParams, and body fields", () => {
    const bindings = buildInitialBindingsFromEndpoint(sampleEndpoint, true);


    // 1. Headers: should include Authorization (since protected) and X-Custom-Client
    const headerBindings = bindings.filter((b) => b.slot === "header");
    expect(headerBindings.length).toBe(2);
    expect(headerBindings.some((b) => b.targetField === "Authorization" && b.source.kind === "auth_token")).toBe(true);
    expect(headerBindings.some((b) => b.targetField === "X-Custom-Client")).toBe(true);


    // 2. Path Params: should include userId mapped to route_param
    const pathBindings = bindings.filter((b) => b.slot === "path_param");
    expect(pathBindings.length).toBe(1);
    expect(pathBindings[0]?.targetField).toBe("userId");
    expect(pathBindings[0]?.source).toEqual({ kind: "route_param", paramName: "userId" });


    // 3. Query Params: should include includeDetails mapped to query_param
    const queryBindings = bindings.filter((b) => b.slot === "query_param");
    expect(queryBindings.length).toBe(1);
    expect(queryBindings[0]?.targetField).toBe("includeDetails");
    expect(queryBindings[0]?.source).toEqual({ kind: "query_param", paramName: "includeDetails" });


    // 4. Body Fields: should include email and fullName mapped to user_input
    const bodyBindings = bindings.filter((b) => b.slot === "body");
    expect(bodyBindings.length).toBe(2);
    expect(bodyBindings.some((b) => b.targetField === "email" && b.source.kind === "user_input")).toBe(true);
    expect(bodyBindings.some((b) => b.targetField === "fullName" && b.source.kind === "user_input")).toBe(true);
  });


  it("should not inject auth headers when endpoint explicitly sets requireAuth to false", () => {
    const unauthEndpoint: Endpoint = {
      ...sampleEndpoint,
      requireAuth: false,
    };
    const bindings = buildInitialBindingsFromEndpoint(unauthEndpoint, true);
    const auth = bindings.find((b) => b.targetField.toLowerCase() === "authorization");
    expect(auth).toBeUndefined();
  });


  it("should map path parameters to item_prop when isItemScoped is true", () => {
    const bindings = buildInitialBindingsFromEndpoint(sampleEndpoint, true, true, "userId");
    const pathBinding = bindings.find((b) => b.slot === "path_param");
    expect(pathBinding).toBeDefined();
    expect(pathBinding?.source).toEqual({
      kind: "item_prop",
      propPath: "userId",
      fieldPath: "userId",
    });
  });
});


describe("ApiCallStep UI component", () => {
  const serviceNode: BackendNode = {
    id: "service-1",
    type: "service",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: { label: "User Service" },
  };


  const endpoint: Endpoint & { nodeId: string } = {
    id: "ep-1",
    nodeId: "service-1",
    name: "/api/users/:id",
    type: "POST",
    headers: [{ id: "h1", name: "X-Trace-Id", type: "string", required: true }],
    pathParams: [{ id: "p1", name: "id", type: "string", required: true }],
    queryParams: [{ id: "q1", name: "tab", type: "string", required: false }],
    requestBody: {
      id: "b1",
      fields: [{ id: "f1", name: "username", type: "string", required: true }],
    },
  };


  const draft: FrontendActionStepDraft = {
    id: "step-1",
    order: 1,
    type: "api_call",
    serviceNodeId: "service-1",
    endpointId: "ep-1",
    requestBindings: [
      {
        id: "b-h1",
        slot: "header",
        targetField: "Authorization",
        source: { kind: "literal", value: "Bearer <token>" },
      },
      {
        id: "b-p1",
        slot: "path_param",
        targetField: "id",
        source: { kind: "route_param", paramName: "id" },
      },
      {
        id: "b-q1",
        slot: "query_param",
        targetField: "tab",
        source: { kind: "query_param", paramName: "tab" },
      },
      {
        id: "b-b1",
        slot: "body",
        targetField: "username",
        source: { kind: "user_input", fieldName: "username" },
      },
    ],
  };


  it("should render all four slot sections: HTTP Headers, Path Parameters, Query Parameters, and Request Body", () => {
    render(
      <ApiCallStep
        draft={draft}
        stepIndex={0}
        allSteps={[draft]}
        allCanvasSteps={[]}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode]}
        endpoints={[endpoint]}
        isProtected={true}
        onChange={vi.fn()}
      />,
    );


    expect(screen.getByText("HTTP Headers")).toBeDefined();
    expect(screen.getByText("Path Parameters")).toBeDefined();
    expect(screen.getByText("Query Parameters")).toBeDefined();
    expect(screen.getByText("Request Body")).toBeDefined();
  });


  it("should allow adding a new binding to a specific slot with correct slot tag", () => {
    const handleChange = vi.fn<(step: FrontendActionStepDraft) => void>();
    render(
      <ApiCallStep
        draft={draft}
        stepIndex={0}
        allSteps={[draft]}
        allCanvasSteps={[]}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode]}
        endpoints={[endpoint]}
        isProtected={true}
        onChange={handleChange}
      />,
    );


    const addHeaderBtn = screen.getByText("Add Header");
    fireEvent.click(addHeaderBtn);


    expect(handleChange).toHaveBeenCalled();
    const firstCall = handleChange.mock.calls[0];
    expect(firstCall).toBeDefined();
    const updatedDraft = firstCall?.[0];
    const bindings = updatedDraft?.requestBindings || [];
    const newBinding = bindings[bindings.length - 1];
    expect(newBinding?.slot).toBe("header");
  });


  it("should allow changing source kind to item_prop for array element mapping", () => {
    const handleChange = vi.fn<(step: FrontendActionStepDraft) => void>();
    render(
      <ApiCallStep
        draft={draft}
        stepIndex={0}
        allSteps={[draft]}
        allCanvasSteps={[]}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode]}
        endpoints={[endpoint]}
        isProtected={true}
        isItemScoped={true}
        itemKeyField="id"
        onChange={handleChange}
      />,
    );


    const itemPropOptions = screen.getAllByTestId("mock-select-item-item_prop");
    expect(itemPropOptions.length).toBeGreaterThan(0);
    fireEvent.click(itemPropOptions[0]!);


    expect(handleChange).toHaveBeenCalled();
    const firstCall = handleChange.mock.calls[0];
    expect(firstCall).toBeDefined();
    const updatedDraft = firstCall?.[0];
    const itemPropBinding = updatedDraft?.requestBindings?.find((b) => b.source.kind === "item_prop");
    expect(itemPropBinding).toBeDefined();
  });


  it("should render Array Accessor Expression and presets when state_var source is an array field", () => {
    const stateStoreNode: BackendNode = {
      id: "store-app",
      type: "state_store",
      position: { x: 0, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "AppStore",
        fields: [
          { id: "f1", name: "messages", type: "ChatMessage[]" },
          { id: "f2", name: "status", type: "string" },
        ],
      },
    };


    const arrayBindingDraft: FrontendActionStepDraft = {
      ...draft,
      requestBindings: [
        {
          id: "b-arr",
          slot: "query_param",
          targetField: "before",
          source: {
            kind: "state_var",
            sourceType: "store",
            storeNodeId: "store-app",
            storeName: "AppStore",
            stateKey: "messages",
          },
        },
      ],
    };


    const handleChange = vi.fn<(step: FrontendActionStepDraft) => void>();
    render(
      <ApiCallStep
        draft={arrayBindingDraft}
        stepIndex={0}
        allSteps={[arrayBindingDraft]}
        allCanvasSteps={[]}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode, stateStoreNode]}
        endpoints={[endpoint]}
        onChange={handleChange}
      />,
    );


    expect(screen.getByText("Array Accessor Expression")).toBeDefined();
    expect(screen.getByText("ChatMessage[]")).toBeDefined();
    expect(screen.getByText("Last item ID")).toBeDefined();
    expect(screen.getByText("Count / length")).toBeDefined();


    // Click a preset chip
    const lastItemIdBtn = screen.getByText("Last item ID");
    fireEvent.click(lastItemIdBtn);


    expect(handleChange).toHaveBeenCalled();
    const updated = handleChange.mock.calls[0]?.[0];
    const binding = updated?.requestBindings?.[0];
    expect(binding?.source.kind).toBe("state_var");
    if (binding?.source.kind === "state_var") {
      expect(binding.source.fieldPath).toBe("messages[messages.length - 1]?.id");
    }
  });

  it("should only suggest real endpoint request body fields without hardcoded fallbacks", () => {
    const customEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-chat",
      nodeId: "service-1",
      name: "/api/chat",
      type: "POST",
      requestBody: {
        id: "rb-1",
        fields: [
          { id: "f1", name: "user_message", type: "string", required: true },
        ],
      },
    };

    const draft: FrontendActionStepDraft = {
      id: "step-1",
      order: 1,
      type: "api_call",
      serviceNodeId: "service-1",
      endpointId: "ep-chat",
      requestBindings: [
        {
          id: "bind-1",
          slot: "body",
          targetField: "user_message",
          source: { kind: "literal", value: "hello" },
        },
      ],
    };

    const handleChange = vi.fn();
    render(
      <ApiCallStep
        draft={draft}
        stepIndex={0}
        allSteps={[draft]}
        allCanvasSteps={[]}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode]}
        endpoints={[customEndpoint]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByDisplayValue("user_message")).toBeDefined();
    expect(screen.queryByText("fileKey")).toBeNull();
    expect(screen.queryByText("fileName")).toBeNull();
    expect(screen.queryByText("fileSize")).toBeNull();
  });
});
