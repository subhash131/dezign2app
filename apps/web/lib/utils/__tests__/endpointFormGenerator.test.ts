import { describe, it, expect } from "vitest";
import {
  extractEndpointFields,
  extractEndpointResponseFields,
  inferDefaultButtonLabel,
  inferDefaultComponentName,
  generateFormFromEndpoint,
} from "../endpointFormGenerator";
import { Endpoint, BackendNode, BackendEdge } from "@/types/canvas";

describe("endpointFormGenerator", () => {
  const sampleEndpoint: Endpoint = {
    id: "ep-users-create",
    name: "/api/v1/users",
    type: "POST",
    summary: "Create a new user",
    pathParams: [
      { id: "p-org", name: "orgId", type: "string", required: true },
    ],
    queryParams: [
      { id: "q-notify", name: "sendWelcomeEmail", type: "boolean", required: false },
    ],
    requestBody: {
      id: "body-1",
      fields: [
        { id: "f-name", name: "fullName", type: "string", required: true },
        { id: "f-email", name: "email", type: "string", required: true },
        { id: "f-pass", name: "password", type: "string", required: true },
        { id: "f-age", name: "age", type: "number", required: false },
        { id: "f-admin", name: "isAdmin", type: "boolean", required: false },
      ],
    },
  };

  it("extracts and infers input types accurately from endpoint contract", () => {
    const fields = extractEndpointFields(sampleEndpoint);
    expect(fields).toHaveLength(7); // 5 body + 1 path + 1 query

    const nameField = fields.find((f) => f.name === "fullName");
    expect(nameField?.suggestedComponentType).toBe("input");
    expect(nameField?.suggestedInputType).toBe("text");
    expect(nameField?.label).toBe("Full Name");
    expect(nameField?.required).toBe(true);

    const emailField = fields.find((f) => f.name === "email");
    expect(emailField?.suggestedInputType).toBe("email");
    expect(emailField?.placeholder).toBe("name@example.com");

    const passField = fields.find((f) => f.name === "password");
    expect(passField?.suggestedInputType).toBe("password");

    const ageField = fields.find((f) => f.name === "age");
    expect(ageField?.suggestedInputType).toBe("number");

    const adminField = fields.find((f) => f.name === "isAdmin");
    expect(adminField?.suggestedComponentType).toBe("switch");

    const orgField = fields.find((f) => f.name === "orgId");
    expect(orgField?.source).toBe("path");
    expect(orgField?.required).toBe(true);
  });

  it("extracts from rawJson fallback when field_builder fields are missing", () => {
    const rawEp: Endpoint = {
      id: "ep-raw",
      name: "/api/raw",
      type: "POST",
      requestBody: {
        id: "b-raw",
        rawJson: JSON.stringify({
          title: "Book",
          price: 29.99,
          inStock: true,
        }),
      },
    };

    const fields = extractEndpointFields(rawEp);
    expect(fields).toHaveLength(3);
    expect(fields.find((f) => f.name === "title")?.type).toBe("string");
    expect(fields.find((f) => f.name === "price")?.type).toBe("number");
    expect(fields.find((f) => f.name === "inStock")?.type).toBe("boolean");
    expect(fields.find((f) => f.name === "inStock")?.suggestedComponentType).toBe("switch");
  });

  it("generates compound form component, Zustand state store, and wires action edge", () => {
    const webPageNode: BackendNode = {
      id: "node-page-1",
      type: "webPage",
      position: { x: 500, y: 200 },
      fractionalIndex: "a0",
      data: {
        label: "/register",
        sections: [
          {
            id: "sec-1",
            name: "Main",
            renderMode: "server",
            actions: [],
            componentBindings: [],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-1",
      type: "service",
      position: { x: 1000, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "UserService",
      },
    };

    const existingStoreNode: BackendNode = {
      id: "node-store-1",
      type: "state_store",
      position: { x: 100, y: 200 },
      fractionalIndex: "a2",
      data: {
        label: "UserStore",
        storeName: "User",
        fields: [],
        actions: [],
      },
    };

    const extracted = extractEndpointFields(sampleEndpoint);
    const selectedFields = extracted.map((f) => ({
      name: f.name,
      source: f.source,
      type: f.type,
      required: f.required,
      componentType: f.suggestedComponentType,
      inputType: f.suggestedInputType,
      label: f.label,
      placeholder: f.placeholder,
      stateVarName: f.name,
    }));

    const result = generateFormFromEndpoint({
      endpoint: sampleEndpoint,
      serviceNode,
      webPageNode,
      sectionId: "sec-1",
      formName: "UserRegistrationForm",
      submitButtonLabel: "Create Account",
      stateStorageMode: "store",
      targetStoreNodeId: existingStoreNode.id,
      selectedFields,
      nodes: [webPageNode, serviceNode, existingStoreNode],
      edges: [],
    });

    // 1. Verify updated store node
    expect(result.updatedStoreNode).toBeDefined();
    expect(result.updatedStoreNode?.data?.fields).toHaveLength(7);
    expect(result.updatedStoreNode?.data?.actions).toHaveLength(7);
    const emailField = result.updatedStoreNode?.data?.fields?.find((f) => f.name === "email");
    expect(emailField).toBeDefined();
    const emailSetter = result.updatedStoreNode?.data?.actions?.find((a) => a.name === "setEmail");
    expect(emailSetter).toBeDefined();

    // 2. Verify new edges (store -> page edge AND action -> service endpoint edge)
    expect(result.newEdges).toHaveLength(2);
    const storeEdge = result.newEdges.find((e) => e.source === existingStoreNode.id && e.target === webPageNode.id);
    expect(storeEdge).toBeDefined();
    const actionEdge = result.newEdges.find((e) => e.source === webPageNode.id && e.target === serviceNode.id);
    expect(actionEdge).toBeDefined();
    expect(actionEdge?.targetHandle).toBe("endpoint-in-ep-users-create");

    // 3. Verify updated webPage node
    const updatedSec = result.updatedWebPageNode.data?.sections?.[0];
    expect(updatedSec).toBeDefined();
    expect(updatedSec?.renderMode).toBe("client");

    // Subscribed store state objects
    expect(updatedSec?.stateObjects).toHaveLength(7);
    expect(updatedSec?.stateObjects?.[0]?.storeName).toBe("User");

    // Component bindings
    expect(updatedSec?.componentBindings).toHaveLength(1);
    const formComp = updatedSec?.componentBindings?.[0];
    expect(formComp?.name).toBe("UserRegistrationForm");
    expect(formComp?.valueStoreName).toBe("User");
    expect(formComp?.elements).toHaveLength(8); // 7 inputs + 1 submit button

    // Submit button element
    const submitBtn = formComp?.elements?.find((el) => el.name === "SubmitButton");
    expect(submitBtn).toBeDefined();
    expect(submitBtn?.elementType).toBe("button");
    expect(submitBtn?.label).toBe("Create Account");
    expect(submitBtn?.actionId).toBe(result.createdActionId);
  });

  it("creates a brand new StateStore node when targetStoreNodeId is '__new__'", () => {
    const webPageNode: BackendNode = {
      id: "node-page-2",
      type: "webPage",
      position: { x: 500, y: 200 },
      fractionalIndex: "a0",
      data: {
        label: "/profile",
        sections: [
          {
            id: "sec-2",
            name: "Profile",
            actions: [],
            componentBindings: [],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-2",
      type: "service",
      position: { x: 900, y: 200 },
      fractionalIndex: "a1",
      data: { label: "ProfileService" },
    };

    const extracted = extractEndpointFields(sampleEndpoint).slice(0, 2);
    const selectedFields = extracted.map((f) => ({
      name: f.name,
      source: f.source,
      type: f.type,
      required: f.required,
      componentType: f.suggestedComponentType,
      inputType: f.suggestedInputType,
      label: f.label,
      placeholder: f.placeholder,
      stateVarName: f.name,
    }));

    const result = generateFormFromEndpoint({
      endpoint: sampleEndpoint,
      serviceNode,
      webPageNode,
      sectionId: "sec-2",
      formName: "ProfileForm",
      submitButtonLabel: "Save Profile",
      stateStorageMode: "store",
      targetStoreNodeId: "__new__",
      newStoreName: "AccountStore",
      selectedFields,
      nodes: [webPageNode, serviceNode],
      edges: [],
    });

    expect(result.newStoreNode).toBeDefined();
    expect(result.newStoreNode?.type).toBe("state_store");
    expect(result.newStoreNode?.data?.label).toBe("AccountStore");
    expect(result.newStoreNode?.data?.storeName).toBe("Account");
    expect(result.newStoreNode?.data?.fields).toHaveLength(2);
    expect(result.newStoreNode?.data?.actions).toHaveLength(2);
  });

  describe("label and name inference", () => {
    it("infers smart button labels based on route semantics and input presence", () => {
      expect(inferDefaultButtonLabel({ id: "1", name: "/health", type: "GET" }, false)).toBe("Check Health");
      expect(inferDefaultButtonLabel({ id: "2", name: "/api/v1/auth/logout", type: "POST" }, false)).toBe("Log Out");
      expect(inferDefaultButtonLabel({ id: "3", name: "/sync", type: "POST" }, false)).toBe("Sync Now");
      expect(inferDefaultButtonLabel({ id: "4", name: "/users", type: "GET" }, false)).toBe("Fetch Users");
      expect(inferDefaultButtonLabel({ id: "5", name: "/users", type: "GET" }, true)).toBe("Search Users");
      expect(inferDefaultButtonLabel({ id: "6", name: "/users", type: "POST" }, true)).toBe("Create Users");
      expect(inferDefaultButtonLabel({ id: "7", name: "/users/1", type: "PUT" }, true)).toBe("Save Changes");
      expect(inferDefaultButtonLabel({ id: "8", name: "/items/1", type: "DELETE" }, false)).toBe("Delete 1");
    });

    it("infers smart component names (Button for parameterless, Form for inputs)", () => {
      expect(inferDefaultComponentName({ id: "1", name: "/health", type: "GET" }, false)).toBe("HealthButton");
      expect(inferDefaultComponentName({ id: "2", name: "/health", type: "GET" }, true)).toBe("HealthForm");
      expect(inferDefaultComponentName({ id: "3", name: "/api/users", type: "POST" }, false)).toBe("UsersButton");
      expect(inferDefaultComponentName({ id: "4", name: "/api/users", type: "POST" }, true)).toBe("UsersForm");
    });
  });

  describe("extractEndpointResponseFields", () => {
    it("extracts from responseBody.fields", () => {
      const ep: Endpoint = {
        id: "ep-res-1",
        name: "/status",
        type: "GET",
        responseBody: {
          id: "rb-1",
          fields: [
            { id: "rf-1", name: "status", type: "string", required: false },
            { id: "rf-2", name: "uptime", type: "number", required: false },
          ],
        },
      };

      const fields = extractEndpointResponseFields(ep);
      expect(fields).toHaveLength(2);
      expect(fields[0]?.name).toBe("status");
      expect(fields[0]?.type).toBe("string");
      expect(fields[1]?.name).toBe("uptime");
      expect(fields[1]?.type).toBe("number");
    });

    it("extracts from responseBody.rawJson fallback", () => {
      const ep: Endpoint = {
        id: "ep-raw-res",
        name: "/health",
        type: "GET",
        responseBody: {
          id: "rb-raw",
          rawJson: JSON.stringify({ alive: true, version: "1.0.0" }),
        },
      };

      const fields = extractEndpointResponseFields(ep);
      expect(fields).toHaveLength(2);
      expect(fields.find((f) => f.name === "alive")?.type).toBe("boolean");
      expect(fields.find((f) => f.name === "version")?.type).toBe("string");
    });

    it("extracts streaming response fields from langgraph_invoke pipeline step with SSE (only enabled fields)", () => {
      const epWithReasoning: Endpoint = {
        id: "ep-send-msg",
        name: "send-message/:id",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "AgentInvocation",
            type: "langgraph_invoke",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            langGraphStreamIncludeReasoning: true,
          },
        ],
      };

      const fields = extractEndpointResponseFields(epWithReasoning);
      expect(fields.map((f) => f.name)).toEqual(["content", "reasoning"]);
      expect(fields.find((f) => f.name === "content")?.type).toBe("string");
      expect(fields.find((f) => f.name === "reasoning")?.type).toBe("string");
      expect(fields.find((f) => f.name === "statusText")).toBeUndefined();
      expect(fields.find((f) => f.name === "streamed")).toBeUndefined();
    });

    it("omits reasoning and statusText when langGraphStreamIncludeReasoning is false or undefined", () => {
      const epDefault: Endpoint = {
        id: "ep-send-msg-no-reasoning",
        name: "send-message/:id",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "AgentInvocation",
            type: "langgraph_invoke",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            langGraphStreamIncludeReasoning: false,
          },
        ],
      };

      const fields = extractEndpointResponseFields(epDefault);
      expect(fields.map((f) => f.name)).toEqual(["content"]);
      expect(fields.find((f) => f.name === "reasoning")).toBeUndefined();
      expect(fields.find((f) => f.name === "statusText")).toBeUndefined();
    });

    it("extracts only selected streaming fields when langGraphStreamingFields is specified", () => {
      const epCustomFields: Endpoint = {
        id: "ep-send-msg-custom",
        name: "send-message/:id",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "AgentInvocation",
            type: "langgraph_invoke",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            langGraphStreamingFields: ["summary", "sentiment"],
          },
        ],
      };

      const fields = extractEndpointResponseFields(epCustomFields);
      expect(fields.map((f) => f.name)).toEqual(["summary", "sentiment"]);
    });

    it("extracts updates and values stream modes when enabled", () => {
      const epMultiMode: Endpoint = {
        id: "ep-send-msg-multi",
        name: "send-message/:id",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "AgentInvocation",
            type: "langgraph_invoke",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            langGraphStreamModes: ["messages", "updates", "values"],
          },
        ],
      };

      const fields = extractEndpointResponseFields(epMultiMode);
      expect(fields.map((f) => f.name)).toEqual(["content", "updates", "values"]);
    });

    it("extracts buffered response fields from langgraph_invoke pipeline step when not streaming", () => {
      const ep: Endpoint = {
        id: "ep-buffered-chat",
        name: "chat",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "AgentInvocation",
            type: "langgraph_invoke",
            langGraphStreamingEnabled: false,
          },
        ],
      };

      const fields = extractEndpointResponseFields(ep);
      expect(fields.map((f) => f.name)).toEqual(["response"]);
      expect(fields.find((f) => f.name === "response")?.type).toBe("string");
    });

    it("prioritizes streaming fields over stale static responseBody.fields when langGraph streaming is enabled", () => {
      const epWithStaleFields: Endpoint = {
        id: "ep-send-msg-stale",
        name: "send-message/:id",
        type: "POST",
        responseBody: {
          id: "rb-1",
          fields: [
            { id: "f-1", name: "user_message", type: "string", required: false },
            { id: "f-2", name: "chat_id", type: "string", required: false },
          ],
        },
        pipelineSteps: [
          {
            id: "step-1",
            name: "AgentInvocation",
            type: "langgraph_invoke",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            langGraphStreamIncludeReasoning: true,
          },
        ],
      };

      const fields = extractEndpointResponseFields(epWithStaleFields);
      expect(fields.map((f) => f.name)).toEqual(["content", "reasoning"]);
      expect(fields.find((f) => f.name === "user_message")).toBeUndefined();
      expect(fields.find((f) => f.name === "chat_id")).toBeUndefined();
    });
  });

  describe("parameterless GET / action button generation", () => {
    it("generates standalone Action Button (componentType: 'button') and stores response fields", () => {
      const healthEndpoint: Endpoint = {
        id: "ep-health-check",
        name: "/health",
        type: "GET",
        summary: "Health check",
        responseBody: {
          id: "res-health",
          fields: [
            { id: "rf-status", name: "serverStatus", type: "string", required: false },
            { id: "rf-timestamp", name: "checkedAt", type: "string", required: false },
          ],
        },
      };

      const webPageNode: BackendNode = {
        id: "node-page-health",
        type: "webPage",
        position: { x: 400, y: 150 },
        fractionalIndex: "a0",
        data: {
          label: "/dashboard",
          sections: [
            {
              id: "sec-health",
              name: "SystemOverview",
              renderMode: "server",
              actions: [],
              componentBindings: [],
            },
          ],
        },
      };

      const serviceNode: BackendNode = {
        id: "node-service-health",
        type: "service",
        position: { x: 800, y: 150 },
        fractionalIndex: "a1",
        data: { label: "HealthService" },
      };

      const storeNode: BackendNode = {
        id: "node-store-health",
        type: "state_store",
        position: { x: 100, y: 150 },
        fractionalIndex: "a2",
        data: {
          label: "HealthStore",
          storeName: "Health",
          fields: [],
          actions: [],
        },
      };

      const result = generateFormFromEndpoint({
        endpoint: healthEndpoint,
        serviceNode,
        webPageNode,
        sectionId: "sec-health",
        formName: "HealthButton",
        submitButtonLabel: "Check Health",
        stateStorageMode: "store",
        targetStoreNodeId: storeNode.id,
        selectedFields: [], // 0 input parameters!
        responseFieldsToStore: ["serverStatus", "checkedAt"],
        nodes: [webPageNode, serviceNode, storeNode],
        edges: [],
      });

      // 1. Should create componentType: "button"
      const section = result.updatedWebPageNode.data?.sections?.[0];
      expect(section).toBeDefined();
      expect(section?.componentBindings).toHaveLength(1);
      const buttonComp = section?.componentBindings?.[0];
      expect(buttonComp?.name).toBe("HealthButton");
      expect(buttonComp?.componentType).toBe("button");
      expect(buttonComp?.elements).toHaveLength(1);
      expect(buttonComp?.elements?.[0]?.elementType).toBe("button");
      expect(buttonComp?.elements?.[0]?.label).toBe("Check Health");
      expect(buttonComp?.elements?.[0]?.actionId).toBe(result.createdActionId);

      // 2. Action wiring to service endpoint
      const actionEdge = result.newEdges.find(
        (e) => e.source === webPageNode.id && e.target === serviceNode.id
      );
      expect(actionEdge).toBeDefined();
      expect(actionEdge?.targetHandle).toBe("endpoint-in-ep-health-check");

      // 3. Store fields created for response variables
      expect(result.updatedStoreNode).toBeDefined();
      expect(result.updatedStoreNode?.data?.fields).toHaveLength(2);
      expect(result.updatedStoreNode?.data?.actions).toHaveLength(2);
      const statusField = result.updatedStoreNode?.data?.fields?.find((f) => f.name === "serverStatus");
      expect(statusField).toBeDefined();
      const statusSetter = result.updatedStoreNode?.data?.actions?.find((a) => a.name === "setServerStatus");
      expect(statusSetter).toBeDefined();

      // 4. Section subscribed to response state variables
      expect(section?.stateObjects).toHaveLength(2);
      expect(section?.stateObjects?.find((s) => s.name === "serverStatus")).toBeDefined();

      // 5. Action has storeActionBindings for API response mapping
      const action = section?.actions?.find((a) => a.id === result.createdActionId);
      expect(action).toBeDefined();
      expect(action?.storeActionBindings).toHaveLength(2);
      const statusBinding = action?.storeActionBindings?.find((b) => b.valuePath === "serverStatus");
      expect(statusBinding).toBeDefined();
      expect(statusBinding?.updateSource).toBe("response_property");
      expect(statusBinding?.actionName).toBe("setServerStatus");
      expect(statusBinding?.targetFieldName).toBe("serverStatus");

      // 6. Summary message mentions button
      expect(result.summaryMessage).toContain("action button");
    });

    it("generates compound component with reactive response display elements when autoGenerateResponseUi is true", () => {
      const ep: Endpoint = {
        id: "ep-status",
        name: "/api/status",
        type: "GET",
        responseBody: {
          id: "rb-status",
          fields: [
            { id: "rf-online", name: "isOnline", type: "boolean", required: false },
            { id: "rf-latency", name: "latencyMs", type: "number", required: false },
          ],
        },
      };

      const webPageNode: BackendNode = {
        id: "node-page-status",
        type: "webPage",
        position: { x: 300, y: 100 },
        fractionalIndex: "a0",
        data: {
          label: "/system",
          sections: [
            {
              id: "sec-status",
              name: "SystemSection",
              actions: [],
              componentBindings: [],
            },
          ],
        },
      };

      const serviceNode: BackendNode = {
        id: "node-service-status",
        type: "service",
        position: { x: 700, y: 100 },
        fractionalIndex: "a1",
        data: { label: "SystemService" },
      };

      const storeNode: BackendNode = {
        id: "node-store-status",
        type: "state_store",
        position: { x: 100, y: 100 },
        fractionalIndex: "a2",
        data: {
          label: "SystemStore",
          storeName: "System",
          fields: [],
          actions: [],
        },
      };

      const result = generateFormFromEndpoint({
        endpoint: ep,
        serviceNode,
        webPageNode,
        sectionId: "sec-status",
        formName: "StatusWidget",
        submitButtonLabel: "Check Status",
        stateStorageMode: "store",
        targetStoreNodeId: storeNode.id,
        selectedFields: [],
        responseFieldsToStore: ["isOnline", "latencyMs"],
        autoGenerateResponseUi: true,
        nodes: [webPageNode, serviceNode, storeNode],
        edges: [],
      });

      const section = result.updatedWebPageNode.data?.sections?.[0];
      const comp = section?.componentBindings?.[0];
      expect(comp).toBeDefined();
      expect(comp?.componentType).toBe("card"); // upgraded to card because it has multiple elements
      expect(comp?.elements).toHaveLength(3); // 1 button + 2 response display elements

      const btnEl = comp?.elements?.find((el) => el.elementType === "button");
      expect(btnEl).toBeDefined();

      const boolEl = comp?.elements?.find((el) => el.valueStateName === "isOnline");
      expect(boolEl).toBeDefined();
      expect(boolEl?.elementType).toBe("badge"); // boolean response maps to badge

      const numEl = comp?.elements?.find((el) => el.valueStateName === "latencyMs");
      expect(numEl).toBeDefined();
      expect(numEl?.elementType).toBe("card"); // number response maps to card
    });

    it("honors custom componentType and stateVarName specified in selectedResponseFields", () => {
      const ep: Endpoint = {
        id: "ep-chat",
        name: "/api/chat",
        type: "POST",
        responseBody: {
          id: "rb-chat",
          fields: [
            { id: "rf-msg", name: "replyText", type: "string", required: false },
            { id: "rf-err", name: "errorMessage", type: "string", required: false },
          ],
        },
      };

      const webPageNode: BackendNode = {
        id: "node-page-chat",
        type: "webPage",
        position: { x: 300, y: 100 },
        fractionalIndex: "a0",
        data: {
          label: "/chat",
          sections: [
            {
              id: "sec-chat",
              name: "ChatSection",
              actions: [],
              componentBindings: [],
            },
          ],
        },
      };

      const serviceNode: BackendNode = {
        id: "node-service-chat",
        type: "service",
        position: { x: 700, y: 100 },
        fractionalIndex: "a1",
        data: { label: "ChatService" },
      };

      const storeNode: BackendNode = {
        id: "node-store-chat",
        type: "state_store",
        position: { x: 100, y: 100 },
        fractionalIndex: "a2",
        data: {
          label: "ChatStore",
          storeName: "Chat",
          fields: [],
          actions: [],
        },
      };

      const result = generateFormFromEndpoint({
        endpoint: ep,
        serviceNode,
        webPageNode,
        sectionId: "sec-chat",
        formName: "ChatWidget",
        submitButtonLabel: "Send Message",
        stateStorageMode: "store",
        targetStoreNodeId: storeNode.id,
        selectedFields: [],
        selectedResponseFields: [
          {
            name: "replyText",
            type: "string",
            componentType: "card",
            stateVarName: "lastBotMessage",
            renderUi: true,
          },
          {
            name: "errorMessage",
            type: "string",
            componentType: "alert",
            stateVarName: "chatError",
            renderUi: true,
          },
        ],
        autoGenerateResponseUi: true,
        nodes: [webPageNode, serviceNode, storeNode],
        edges: [],
      });

      const section = result.updatedWebPageNode.data?.sections?.[0];
      const comp = section?.componentBindings?.[0];
      expect(comp).toBeDefined();

      const replyEl = comp?.elements?.find((el) => el.valueStateName === "lastBotMessage");
      expect(replyEl).toBeDefined();
      expect(replyEl?.elementType).toBe("card");

      const errorEl = comp?.elements?.find((el) => el.valueStateName === "chatError");
      expect(errorEl).toBeDefined();
      expect(errorEl?.elementType).toBe("alert");

      // Verify action binding uses custom stateVarName
      const action = section?.actions?.find((a) => a.id === result.createdActionId);
      const replyBinding = action?.storeActionBindings?.find((b) => b.valuePath === "replyText");
      expect(replyBinding?.targetFieldName).toBe("lastBotMessage");
      expect(replyBinding?.actionName).toBe("setLastBotMessage");
    });
  });
});
