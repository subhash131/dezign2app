import { describe, it, expect } from "vitest";
import { generateEventComponent, hasTransformerActionSteps } from "../webClients/nextjs/v16/eventGenerators";
import { compileWebPageNode } from "../compileWebPageNode";
import { compileTransformerHelpers } from "../compileTransformerHelpers";
import type { UIEventItem } from "@workspace/canvas";
import type { BackendNode, CompiledFile } from "@workspace/canvas/types";

describe("WebPageNode Action Transformer Step Compilation", () => {
  it("compiles a standalone transformer step to an executable button handler with @workspace/transformers import", () => {
    const eventItem: UIEventItem = {
      id: "act-transform",
      name: "Generate Slug",
      event: "click",
      actionSteps: [
        {
          id: "step-trans-1",
          order: 1,
          type: "transform",
          name: "slugifyResult",
          outputVariable: "slugifyResult",
          transformerName: "slugify",
          functionRef: {
            name: "slugify",
            importPath: "@workspace/transformers",
          },
          transformBindings: [
            {
              argName: "title",
              source: {
                kind: "literal",
                value: "My First Post",
              },
            },
          ],
        },
      ],
      storeActionBinding: {
        storeName: "PostStore",
        actionType: "set",
        targetFieldName: "slug",
        updateSource: "response_property",
        valuePath: "slug",
      },
    };

    const code = generateEventComponent(
      "Generate Slug",
      "click",
      "#",
      "POST",
      "GenerateSlugAction",
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      eventItem,
    );

    expect(code).toContain('import { slugify } from "@workspace/transformers";');
    expect(code).toContain('import { usePostStore } from "@/lib/stores";');
    expect(code).toContain('const slugifyResult = await slugify({ title: "My First Post" });');
    expect(code).toContain("usePostStore.getState().setSlug(extracted);");
  });

  it("compiles transformer step chained to dynamic navigation with [id] parameter mapping", () => {
    const eventItem: UIEventItem = {
      id: "act-create-and-nav",
      name: "Create Chat",
      event: "click",
      actionSteps: [
        {
          id: "step-trans-1",
          order: 1,
          type: "transform",
          name: "generateChatIdResult",
          outputVariable: "generateChatIdResult",
          transformerName: "generateChatId",
          functionRef: {
            name: "generateChatId",
            importPath: "@workspace/transformers",
          },
        },
        {
          id: "step-nav-2",
          order: 2,
          type: "navigation",
          targetRoute: "/chat/[id]",
          navCondition: "direct",
          pathParamBindings: [
            {
              paramName: "id",
              source: {
                kind: "prev_response",
                stepId: "step-trans-1",
                fieldPath: "id",
              },
            },
          ],
        },
      ],
    };

    const code = generateEventComponent(
      "Create Chat",
      "click",
      "#",
      "POST",
      "CreateChatAction",
      "/chat/[id]",
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      eventItem,
    );

    // Should NOT be a pure <Link> but an interactive button handler
    expect(code).toContain('import { useRouter } from "next/navigation";');
    expect(code).toContain('import { generateChatId } from "@workspace/transformers";');
    expect(code).toContain("const router = useRouter();");
    expect(code).toContain("const generateChatIdResult = await generateChatId();");
    expect(code).toContain('router.push(`/chat/${String((typeof generateChatIdResult === "object" && generateChatIdResult !== null ? (generateChatIdResult as Record<string, unknown>)?.["id"] : generateChatIdResult) ?? "")}`);');
  });

  it("compiles pre-trigger and post-trigger transformer steps around an API endpoint call", () => {
    const eventItem: UIEventItem = {
      id: "act-api-pipeline",
      name: "Submit Order",
      event: "click",
      actionSteps: [
        {
          id: "step-pre-1",
          order: 1,
          type: "transform",
          name: "prepOrderResult",
          outputVariable: "prepOrderResult",
          transformerName: "prepareOrder",
          functionRef: {
            name: "prepareOrder",
            importPath: "@workspace/transformers",
          },
          transformBindings: [
            {
              argName: "currency",
              source: { kind: "literal", value: "USD" },
            },
          ],
        },
        {
          id: "step-api-2",
          order: 2,
          type: "api_call",
        },
        {
          id: "step-post-3",
          order: 3,
          type: "transform",
          name: "formatOrderResult",
          outputVariable: "formatOrderResult",
          transformerName: "formatOrderConfirmation",
          functionRef: {
            name: "formatOrderConfirmation",
            importPath: "@workspace/transformers",
          },
          transformBindings: [
            {
              argName: "orderId",
              source: {
                kind: "prev_response",
                stepId: "step-api-2",
                fieldPath: "id",
              },
            },
          ],
        },
      ],
    };

    const code = generateEventComponent(
      "Submit Order",
      "click",
      "http://localhost:8080/api/orders",
      "POST",
      "SubmitOrderAction",
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      eventItem,
    );

    expect(code).toContain(
      'import { formatOrderConfirmation, prepareOrder } from "@workspace/transformers";',
    );

    // Verify ordering: prepareOrder executes BEFORE onTrigger, formatOrderConfirmation executes AFTER onTrigger
    const prepIndex = code.indexOf("await prepareOrder(");
    const triggerIndex = code.indexOf("await onTrigger?.(");
    const postIndex = code.indexOf("await formatOrderConfirmation(");

    expect(prepIndex).toBeGreaterThan(-1);
    expect(triggerIndex).toBeGreaterThan(-1);
    expect(postIndex).toBeGreaterThan(-1);

    expect(prepIndex).toBeLessThan(triggerIndex);
    expect(triggerIndex).toBeLessThan(postIndex);

    // Post-trigger transformer references resData.id
    expect(code).toContain("orderId: resData?.id");
  });

  it("compiles transformer step in interactive form with user input bindings", () => {
    const eventItem: UIEventItem = {
      id: "act-form-transform",
      name: "Transform Search",
      event: "submit",
      actionSteps: [
        {
          id: "step-trans-search",
          order: 1,
          type: "transform",
          name: "cleanedSearchResult",
          outputVariable: "cleanedSearchResult",
          transformerName: "cleanSearchQuery",
          functionRef: {
            name: "cleanSearchQuery",
            importPath: "@workspace/transformers",
          },
          transformBindings: [
            {
              argName: "rawQuery",
              source: {
                kind: "user_input",
                fieldName: "query",
              },
            },
          ],
        },
      ],
    };

    const code = generateEventComponent(
      "Transform Search",
      "submit",
      "http://localhost:8080/api/search",
      "POST",
      "TransformSearchAction",
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      {
        fields: [{ name: "query", type: "string", required: true }],
      },
      eventItem,
    );

    expect(code).toContain('import { cleanSearchQuery } from "@workspace/transformers";');
    expect(code).toContain('rawQuery: bodyFields?.["query"]');
    expect(code).toContain("const cleanedSearchResult = await cleanSearchQuery({");
  });

  it("detects transformer action steps via hasTransformerActionSteps", () => {
    const withTransform: UIEventItem = {
      id: "act-1",
      name: "Transform",
      event: "click",
      actionSteps: [
        {
          id: "step-1",
          order: 1,
          type: "transform",
          transformerName: "generateChatId",
        },
      ],
    };
    const withoutTransform: UIEventItem = {
      id: "act-2",
      name: "Nav",
      event: "click",
      actionSteps: [
        {
          id: "step-1",
          order: 1,
          type: "navigation",
          targetRoute: "/dashboard",
        },
      ],
    };

    expect(hasTransformerActionSteps(withTransform)).toBe(true);
    expect(hasTransformerActionSteps(withoutTransform)).toBe(false);
    expect(hasTransformerActionSteps(undefined)).toBe(false);
  });

  it("automatically adds @workspace/transformers to package.json, tsconfig.json, and next.config.ts when web page has transformer action steps", () => {
    const pageNode: BackendNode = {
      id: "node-page-new",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/new",
        appSlug: "web",
        sections: [
          {
            id: "sec-main",
            name: "Main Section",
            actions: [
              {
                id: "act-send-message",
                name: "Send Message",
                event: "click",
                actionSteps: [
                  {
                    id: "step-trans-1",
                    order: 1,
                    type: "transform",
                    transformerName: "generateChatId",
                    functionRef: {
                      name: "generateChatId",
                      importPath: "@workspace/transformers",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNode(pageNode);

    // 1. SendMessageAction.tsx must import generateChatId
    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.toLowerCase().endsWith("sendmessageaction.tsx"),
    );
    expect(actionFile).toBeDefined();
    expect(actionFile?.content).toContain('import { generateChatId } from "@workspace/transformers";');

    // 2. package.json must include "@workspace/transformers": "workspace:*"
    const pkgFile = result.files.find((f: CompiledFile) => f.filename === "package.json");
    expect(pkgFile).toBeDefined();
    const pkgJson = JSON.parse(pkgFile!.content);
    expect(pkgJson.dependencies["@workspace/transformers"]).toBe("workspace:*");

    // 3. tsconfig.json must map @workspace/transformers
    const tsconfigFile = result.files.find((f: CompiledFile) => f.filename === "tsconfig.json");
    expect(tsconfigFile).toBeDefined();
    const tsconfigJson = JSON.parse(tsconfigFile!.content);
    expect(tsconfigJson.compilerOptions.paths["@workspace/transformers"]).toEqual([
      "../../packages/transformers/src/index.ts",
    ]);
    expect(tsconfigJson.compilerOptions.paths["@workspace/transformers/*"]).toEqual([
      "../../packages/transformers/src/*",
    ]);

    // 4. next.config must transpile @workspace/transformers
    const nextConfigFile = result.files.find((f: CompiledFile) => f.filename.startsWith("next.config"));
    expect(nextConfigFile).toBeDefined();
    expect(nextConfigFile?.content).toContain('"@workspace/transformers"');
  });

  it("compileTransformerHelpers collects transformer action steps from WebPage nodes when no standalone transformer node exists", () => {
    const pageNode: BackendNode = {
      id: "node-page-new",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/new",
        appSlug: "web",
        sections: [
          {
            id: "sec-main",
            name: "Main Section",
            actions: [
              {
                id: "act-send-message",
                name: "SendMessage",
                event: "click",
                actionSteps: [
                  {
                    id: "step-trans-1",
                    order: 1,
                    type: "transform",
                    transformerName: "generateChatId",
                    functionRef: {
                      name: "generateChatId",
                      importPath: "@workspace/transformers",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = compileTransformerHelpers([pageNode]);
    expect(result.files.length).toBeGreaterThan(0);

    const helperFile = result.files.find((f) => f.filename.includes("generateChatId.ts"));
    expect(helperFile).toBeDefined();

    const barrelFile = result.files.find((f) => f.filename.endsWith("src/index.ts"));
    expect(barrelFile?.content).toContain('export * from "./generateChatId";');

    const pkgFile = result.files.find((f) => f.filename.endsWith("packages/transformers/package.json"));
    expect(pkgFile).toBeDefined();
  });

  it("compiles interactive form action with API trigger, post transformer generateChatId, and navigation resolving to generateChatIdResult", () => {
    const eventItem: UIEventItem = {
      id: "act-send-message",
      name: "send message",
      event: "click",
      actionSteps: [
        {
          id: "step-trans-1",
          order: 2,
          type: "transform",
          name: "generateChatIdResult",
          outputVariable: "generateChatIdResult",
          transformerName: "generateChatId",
          functionRef: {
            name: "generateChatId",
            importPath: "@workspace/transformers",
          },
        },
        {
          id: "step-nav-2",
          order: 3,
          type: "navigation",
          targetRoute: "/chat/:id",
          navCondition: "direct",
          pathParamBindings: [
            {
              paramName: "id",
              source: {
                kind: "prev_response",
                stepId: "",
                fieldPath: "id",
              },
            },
          ],
        },
      ],
    };

    const code = generateEventComponent(
      "send message",
      "click",
      "http://localhost:8080/send-message/:id",
      "POST",
      "SendMessageAction",
      "/chat/:id",
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      eventItem,
    );

    expect(code).toContain("const generateChatIdResult = await generateChatId();");
    expect(code).toContain('router.push(`/chat/${String((typeof generateChatIdResult === "object" && generateChatIdResult !== null ? (generateChatIdResult as Record<string, unknown>)?.["id"] : generateChatIdResult) ?? "")}`);');
    expect(code).not.toContain("router.push(`/chat/${String(resData?.id ?? \"\")}`);");
    expect(code).toContain("const resData =");
  });

  it("compiles navigation with navMethod 'history_push' for new chat in-place URL update", () => {
    const eventItem: UIEventItem = {
      id: "act-send-first-msg",
      name: "send first message",
      event: "click",
      actionSteps: [
        {
          id: "step-nav-chat",
          order: 1,
          type: "navigation",
          targetRoute: "/chat/:conversationId",
          navMethod: "history_push",
          navCondition: "on_success",
          pathParamBindings: [
            {
              paramName: "conversationId",
              source: {
                kind: "prev_response",
                stepId: "",
                fieldPath: "conversationId",
              },
            },
          ],
        },
      ],
    };

    const code = generateEventComponent(
      "send first message",
      "click",
      "http://localhost:8080/api/chat",
      "POST",
      "SendFirstMessageAction",
      "/chat/:conversationId",
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      eventItem,
    );

    expect(code).toContain('window.history.pushState({}, "", `/chat/${String((typeof resData === "object" && resData !== null ? (resData as Record<string, unknown>)?.["conversationId"] : resData) ?? "")}`);');
    expect(code).not.toContain('router.push');
    expect(code).not.toContain('useRouter');
  });

  it("compiles navigation with navMethod 'history_replace' and 'router_replace'", () => {
    const historyReplaceItem: UIEventItem = {
      id: "act-replace-url",
      name: "replace url",
      event: "click",
      actionSteps: [
        {
          id: "step-replace",
          order: 1,
          type: "navigation",
          targetRoute: "/chat/:id",
          navMethod: "history_replace",
          pathParamBindings: [
            {
              paramName: "id",
              source: { kind: "literal", value: "conv-123" },
            },
          ],
        },
      ],
    };

    const codeReplace = generateEventComponent(
      "replace url",
      "click",
      "http://localhost:8080/api/update",
      "POST",
      "ReplaceUrlAction",
      "/chat/:id",
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      historyReplaceItem,
    );

    expect(codeReplace).toContain('window.history.replaceState({}, "", `/chat/${"conv-123"}`);');

    const routerReplaceItem: UIEventItem = {
      ...historyReplaceItem,
      actionSteps: [
        {
          ...historyReplaceItem.actionSteps![0]!,
          navMethod: "router_replace",
        },
      ],
    };

    const codeRouterReplace = generateEventComponent(
      "router replace url",
      "click",
      "http://localhost:8080/api/update",
      "POST",
      "RouterReplaceAction",
      "/chat/:id",
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      routerReplaceItem,
    );

    expect(codeRouterReplace).toContain('router.replace(`/chat/${"conv-123"}`);');
    expect(codeRouterReplace).toContain('const router = useRouter();');
  });
});

