import { describe, it, expect } from "vitest";
import { generateEventComponent } from "../webClients/nextjs/v16/eventGenerators";
import type { UIEventItem } from "@workspace/canvas";

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
    expect(code).toContain("router.push(`/chat/${String(generateChatIdResult?.id ?? \"\")}`);");
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
});

