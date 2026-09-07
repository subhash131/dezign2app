import { describe, it, expect } from "vitest";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile } from "@workspace/canvas/types";

describe("compileNextjsV16WebClient - Request Types & Inferred Form UI", () => {
  it("should infer TypeScript request types and generate interactive form inputs for field_builder endpoint", () => {
    const webPageNode: BackendNode = {
      id: "node-client-1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Users Page",
        appSlug: "web-app",
        events: [
          {
            id: "evt-create-user",
            name: "Create User",
            event: "click",
            headers: [
              { id: "h1", name: "X-Tenant-Id", type: "string", required: true, defaultValue: "tenant_123" },
            ],
            pathParams: [
              { id: "p1", name: "orgId", type: "string", required: true, defaultValue: "org_456" },
            ],
            queryParams: [
              { id: "q1", name: "notifyAdmin", type: "boolean", required: false, defaultValue: "true" },
            ],
            requestBodyMode: "field_builder",
            requestBody: {
              id: "sb-1",
              fields: [
                { id: "f1", name: "fullName", type: "string", required: true },
                { id: "f2", name: "userAge", type: "number", required: false, defaultValue: "25" },
                { id: "f3", name: "isAdmin", type: "boolean", required: true },
                { id: "f4", name: "metadata", type: "object", required: false },
              ],
            },
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-1",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "UserService",
        port: "8080",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-create-user",
        nodeId: "node-service-1",
        name: "/api/orgs/:orgId/users",
        type: "POST",
        pathParams: [
          { id: "p1", name: "orgId", type: "string", required: true },
        ],
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-1",
        source: "node-client-1",
        target: "node-service-1",
        sourceHandle: "events-evt-create-user",
        targetHandle: "endpoint-in-ep-create-user",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [webPageNode],
      endpoints,
      [],
      [webPageNode, serviceNode],
      edges,
      "Monorepo App",
    );

    // Verify Action component file exists
    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.endsWith("CreateUserAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // 1. Verify canonical TypeScript types from @workspace/types are reused
    expect(content).toContain('from "@workspace/types";');
    expect(content).toContain("export type CreateUserActionPathParams = UserServicePostApiOrgsByOrgIdUsersParams;");
    expect(content).toContain("export type CreateUserActionQueryParams = UserServicePostApiOrgsByOrgIdUsersQuery;");
    expect(content).toContain("export type CreateUserActionHeaders = Record<string, string>;");
    expect(content).toContain("export type CreateUserActionRequestBody = UserServicePostApiOrgsByOrgIdUsersBody;");
    expect(content).toContain("export type CreateUserActionResponse = UserServicePostApiOrgsByOrgIdUsersResponse;");
    expect(content).toContain("export interface CreateUserActionRequestPayload");

    // 2. Verify form inputs
    expect(content).toContain(":orgId");
    expect(content).toContain("notifyAdmin");
    expect(content).toContain("X-Tenant-Id");
    expect(content).toContain("fullName");
    expect(content).toContain("userAge");
    expect(content).toContain("isAdmin");
    expect(content).toContain("metadata");

    // 3. Verify URL interpolation & QueryString logic
    expect(content).toContain("computeFinalUrl");
    expect(content).toContain("URLSearchParams");
    expect(content).toContain("handleFormSubmit");
    expect(content).toContain("onTrigger");
  });

  it("should infer TypeScript types and render JSON textarea for raw_json endpoint", () => {
    const webPageNode: BackendNode = {
      id: "node-client-2",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Checkout Page",
        appSlug: "web-app",
        events: [
          {
            id: "evt-checkout",
            name: "Submit Checkout",
            event: "submit",
            requestBodyMode: "raw_json",
            requestBody: {
              id: "sb-2",
              rawJson: JSON.stringify({
                cartId: "cart_999",
                discountCode: "SUMMER",
                itemsCount: 3,
                isExpress: true,
              }),
            },
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-2",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "PaymentService",
        port: "8085",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-checkout",
        nodeId: "node-service-2",
        name: "/api/checkout",
        type: "POST",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-checkout",
        source: "node-client-2",
        target: "node-service-2",
        sourceHandle: "events-evt-checkout",
        targetHandle: "endpoint-in-ep-checkout",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [webPageNode],
      endpoints,
      [],
      [webPageNode, serviceNode],
      edges,
      "Monorepo App",
    );

    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.endsWith("SubmitCheckoutAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // Canonical types reused from @workspace/types
    expect(content).toContain('from "@workspace/types";');
    expect(content).toContain("export type SubmitCheckoutActionRequestBody = PaymentServicePostApiCheckoutBody;");
    expect(content).toContain("export type SubmitCheckoutActionResponse = PaymentServicePostApiCheckoutResponse;");

    // Raw JSON Textarea
    expect(content).toContain("rawJsonBody");
    expect(content).toContain("Request Body (JSON)");
    expect(content).toContain("jsonError");
  });

  it("should generate valid JSX placeholder for object/array fields in Interactive Canvas onSaveCanvas action", () => {
    const webPageNode: BackendNode = {
      id: "node-canvas-page",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Canvas Page",
        appSlug: "web-app",
        sections: [
          {
            id: "sec-canvas",
            name: "Interactive Canvas",
            renderMode: "client",
            loadStrategy: "dynamic-no-ssr",
            actions: [
              {
                id: "act-save-canvas",
                name: "onSaveCanvas",
                event: "click",
                requestBodyMode: "field_builder",
                requestBody: {
                  id: "rb-canvas-save",
                  mode: "field_builder",
                  fields: [
                    {
                      id: "f-cv-snapshot",
                      name: "canvasData",
                      type: "object",
                      required: true,
                    },
                    {
                      id: "f-cv-meta",
                      name: "extraMeta",
                      type: "object",
                      required: false,
                      description: "Custom metadata description",
                    },
                    {
                      id: "f-cv-tags",
                      name: "tags",
                      type: "array",
                      required: false,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webPageNode],
      [],
      "Monorepo App",
    );

    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.endsWith("OnsavecanvasAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // Must NOT contain invalid unescaped quotes in JSX attribute
    expect(content).not.toContain('placeholder="{"key": "val"}"');
    expect(content).not.toContain('placeholder="["item1", "item2"]"');

    // Must contain safe placeholders
    expect(content).toContain("placeholder='{\"key\": \"val\"}'");
    expect(content).toContain("placeholder='[\"item1\", \"item2\"]'");
    expect(content).toContain('placeholder={"Custom metadata description"}');

    // Must define proper RequestBody interface
    expect(content).toContain("export interface OnsavecanvasActionRequestBody");
    expect(content).toContain("canvasData: Record<string, unknown>;");
    expect(content).toContain("tags?: unknown[];");
  });

  it("should gracefully ignore empty field names without generating syntax errors like ': string;'", () => {
    const webPageNode: BackendNode = {
      id: "node-table-page",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        appSlug: "web-app",
        sections: [
          {
            id: "sec-datatable",
            name: "Data Table / Grid",
            renderMode: "client",
            loadStrategy: "dynamic",
            actions: [
              {
                id: "act-row-select",
                name: "onRowSelect",
                event: "click",
                requestBodyMode: "field_builder",
                requestBody: {
                  id: "rb-dt-row-select",
                  mode: "field_builder",
                  fields: [
                    // Empty/whitespace field simulating clicking Add Field without name
                    {
                      id: "f-empty-1",
                      name: "",
                      type: "string",
                      required: true,
                    },
                    {
                      id: "f-empty-2",
                      name: "   ",
                      type: "string",
                      required: false,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webPageNode],
      [],
      "Monorepo App",
    );

    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.endsWith("OnrowselectAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // Must NOT contain invalid empty property syntax
    expect(content).not.toContain("  : string;");
    expect(content).not.toContain("  ?: string;");
    expect(content).not.toMatch(/^\s*: string;/m);

    // When all fields are empty and no rawJson, RequestBody is fallback Record<string, unknown> or omitted
    expect(content).not.toContain("export interface OnrowselectActionRequestBody {\n  : string;\n}");
  });

  it("should quote special parameter and header identifiers in TypeScript interfaces", () => {
    const webPageNode: BackendNode = {
      id: "node-headers-page",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Settings",
        appSlug: "web-app",
        events: [
          {
            id: "evt-save-settings",
            name: "saveSettings",
            event: "click",
            headers: [
              { id: "h1", name: "X-Custom-Header", type: "string", required: true },
            ],
            pathParams: [
              { id: "p1", name: "org-id", type: "string", required: true },
            ],
            queryParams: [
              { id: "q1", name: "filter-active", type: "boolean", required: false },
            ],
            requestBodyMode: "field_builder",
            requestBody: {
              id: "rb-settings",
              fields: [
                { id: "f1", name: "max-retries", type: "number", required: true },
              ],
            },
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webPageNode],
      [],
      "Monorepo App",
    );

    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.endsWith("SavesettingsAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // Quoted TS identifiers with hyphens
    expect(content).toContain('"org-id": string;');
    expect(content).toContain('"filter-active"?: boolean;');
    expect(content).toContain('"X-Custom-Header": string;');
    expect(content).toContain('"max-retries": number;');
  });
});
