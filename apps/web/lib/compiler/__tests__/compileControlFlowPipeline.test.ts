import { describe, it, expect } from "vitest";
import {
  renderPipeline,
  renderPipelineStep,
  collectPipelineImports,
  compileConditionExpr,
} from "../generators/routeGenerator/pipelineRenderer";
import { PipelineStep } from "@workspace/canvas/types";

describe("Control Flow Pipeline Steps Compilation", () => {
  describe("compileConditionExpr", () => {
    const ctx = {
      priorOutputs: new Map([
        ["step-1", "orderData"],
        ["step-2", "userProfile"],
      ]),
      bodyVar: "body",
    };

    it("compiles simple equality clause with req_body and literal", () => {
      const expr = {
        left: { kind: "req_body" as const, field: "role" },
        operator: "eq" as const,
        right: { kind: "inline" as const, value: "admin" },
      };
      const result = compileConditionExpr(expr, ctx);
      expect(result).toBe('(body.role === "admin")');
    });

    it("compiles comparison between two step outputs", () => {
      const expr = {
        left: { kind: "step_output" as const, stepId: "step-1", field: "total" },
        operator: "gt" as const,
        right: { kind: "step_output" as const, stepId: "step-2", field: "creditLimit" },
      };
      const result = compileConditionExpr(expr, ctx);
      expect(result).toBe("(orderData.total > userProfile.creditLimit)");
    });

    it("compiles compound AND expression", () => {
      const expr = {
        and: [
          {
            left: { kind: "req_body" as const, field: "status" },
            operator: "eq" as const,
            right: { kind: "inline" as const, value: "active" },
          },
          {
            left: { kind: "step_output" as const, stepId: "step-1", field: "count" },
            operator: "gte" as const,
            right: { kind: "inline" as const, value: 5 },
          },
        ],
      };
      const result = compileConditionExpr(expr, ctx);
      expect(result).toBe('((body.status === "active") && (orderData.count >= 5))');
    });

    it("compiles unary exists and truthy operators", () => {
      const expr = {
        or: [
          {
            left: { kind: "step_output" as const, stepId: "step-1", field: "cache" },
            operator: "exists" as const,
          },
          {
            left: { kind: "req_body" as const, field: "forceRefresh" },
            operator: "truthy" as const,
          },
        ],
      };
      const result = compileConditionExpr(expr, ctx);
      expect(result).toBe(
        "((orderData.cache !== null && orderData.cache !== undefined) || Boolean(body.forceRefresh))",
      );
    });
  });

  describe("renderPipeline with control flow steps", () => {
    it("compiles condition step with thenSteps and elseSteps", () => {
      const steps: PipelineStep[] = [
        {
          id: "step-cond",
          name: "Check VIP Status",
          type: "condition",
          enabled: true,
          inputBindings: [],
          conditionExpr: {
            left: { kind: "req_body", field: "isVip" },
            operator: "eq",
            right: { kind: "inline", value: true },
          },
          thenSteps: [
            {
              id: "step-vip",
              name: "Apply VIP Discount",
              type: "transform",
              enabled: true,
              functionRef: {
                name: "applyVipDiscount",
                importPath: "./transformers/applyVipDiscount",
              },
              inputBindings: [
                { argName: "amount", source: { kind: "req_body", field: "amount" } },
              ],
              outputVariable: "discountedVipTotal",
            },
          ],
          elseSteps: [
            {
              id: "step-standard",
              name: "Apply Standard Rate",
              type: "transform",
              enabled: true,
              functionRef: {
                name: "applyStandardRate",
                importPath: "./transformers/applyStandardRate",
              },
              inputBindings: [
                { argName: "amount", source: { kind: "req_body", field: "amount" } },
              ],
              outputVariable: "standardTotal",
            },
          ],
        },
      ];

      const lines = renderPipeline(steps, "body");
      const code = lines.join("\n");

      expect(code).toContain("if ((body.isVip === true)) {");
      expect(code).toContain("const discountedVipTotal = applyVipDiscount(");
      expect(code).toContain("} else {");
      expect(code).toContain("const standardTotal = applyStandardRate(");
    });

    it("compiles try_catch step with caughtError in catch branch", () => {
      const steps: PipelineStep[] = [
        {
          id: "step-trycatch",
          name: "Resilient DB Operation",
          type: "try_catch",
          enabled: true,
          inputBindings: [],
          trySteps: [
            {
              id: "step-db",
              name: "Create Order",
              type: "db_operation",
              enabled: true,
              functionRef: {
                name: "createOrder",
                importPath: "@workspace/db/helpers/orders",
              },
              inputBindings: [
                { argName: "item", source: { kind: "req_body", field: "item" } },
              ],
              outputVariable: "createdOrder",
            },
          ],
          catchSteps: [
            {
              id: "step-fallback-pub",
              name: "Emit Failure Event",
              type: "kafka_publish",
              enabled: true,
              functionRef: {
                name: "publishKafkaEvent",
                importPath: "@workspace/kafka",
              },
              inputBindings: [
                {
                  argName: "topic",
                  source: { kind: "inline", value: "order_failures" },
                },
                {
                  argName: "payload",
                  source: {
                    kind: "step_output",
                    stepId: "__catch_error__",
                    field: "message",
                  },
                },
              ],
              outputVariable: "publishFailureResult",
            },
          ],
        },
      ];

      const lines = renderPipeline(steps, "body");
      const code = lines.join("\n");

      expect(code).toContain("try {");
      expect(code).toContain("const createdOrder = await createOrder(");
      expect(code).toContain("} catch (caughtError) {");
      expect(code).toContain("const publishFailureResult = await publishKafkaEvent(");
      expect(code).toContain("caughtError.message");
    });

    it("compiles switch step with cases and default", () => {
      const steps: PipelineStep[] = [
        {
          id: "step-switch",
          name: "Route Order Status",
          type: "switch",
          enabled: true,
          inputBindings: [],
          switchSource: { kind: "req_body", field: "status" },
          switchCases: [
            {
              id: "c1",
              value: "approved",
              steps: [
                {
                  id: "s-app",
                  name: "Notify Approved",
                  type: "transform",
                  enabled: true,
                  functionRef: {
                    name: "formatApproval",
                    importPath: "./transformers/formatApproval",
                  },
                  inputBindings: [],
                  outputVariable: "approvalNotice",
                },
              ],
            },
            {
              id: "c2",
              value: "rejected",
              steps: [
                {
                  id: "s-rej",
                  name: "Process Refund",
                  type: "service_call",
                  enabled: true,
                  functionRef: {
                    name: "issueRefund",
                    importPath: "@/services/payments/issueRefund",
                  },
                  inputBindings: [],
                  outputVariable: "refundResult",
                },
              ],
            },
          ],
          switchDefault: [
            {
              id: "s-def",
              name: "Default Logger",
              type: "custom_code",
              enabled: true,
              inputBindings: [],
              customCode: 'console.log("Unhandled status");',
            },
          ],
        },
      ];

      const lines = renderPipeline(steps, "body");
      const code = lines.join("\n");

      expect(code).toContain("switch (body.status) {");
      expect(code).toContain('case "approved": {');
      expect(code).toContain("const approvalNotice = formatApproval();");
      expect(code).toContain('case "rejected": {');
      expect(code).toContain("const refundResult = await issueRefund();");
      expect(code).toContain("default: {");
      expect(code).toContain('console.log("Unhandled status");');
    });

    it("compiles parallel step with Promise.all and Promise.allSettled", () => {
      const steps: PipelineStep[] = [
        {
          id: "step-parallel-all",
          name: "Parallel Critical Ops",
          type: "parallel",
          enabled: true,
          failureMode: "all",
          inputBindings: [],
          outputVariable: "concurrentResults",
          parallelBranches: [
            {
              id: "b1",
              label: "DB Write",
              steps: [
                {
                  id: "s-b1",
                  name: "Write DB",
                  type: "db_operation",
                  enabled: true,
                  functionRef: { name: "saveData", importPath: "@workspace/db" },
                  inputBindings: [],
                  outputVariable: "dbSaveRes",
                },
              ],
            },
            {
              id: "b2",
              label: "Cache Invalidation",
              steps: [
                {
                  id: "s-b2",
                  name: "Invalidate Cache",
                  type: "redis_operation",
                  enabled: true,
                  functionRef: { name: "delCache", importPath: "@workspace/redis" },
                  inputBindings: [],
                  outputVariable: "cacheDelRes",
                },
              ],
            },
          ],
        },
        {
          id: "step-parallel-any",
          name: "Parallel Side Effects",
          type: "parallel",
          enabled: true,
          failureMode: "any",
          inputBindings: [],
          outputVariable: "sideEffectResults",
          parallelBranches: [
            {
              id: "b3",
              label: "Send Analytics",
              steps: [],
            },
          ],
        },
      ];

      const lines = renderPipeline(steps, "body");
      const code = lines.join("\n");

      expect(code).toContain("const concurrentResults = await Promise.all([");
      expect(code).toContain("const dbSaveRes = await saveData();");
      expect(code).toContain("const cacheDelRes = await delCache();");
      expect(code).toContain("const sideEffectResults = await Promise.allSettled([");
    });

    it("compiles loop step with iterator variable mapping", () => {
      const steps: PipelineStep[] = [
        {
          id: "step-loop",
          name: "Process Cart Items",
          type: "loop",
          enabled: true,
          inputBindings: [],
          loopSource: { kind: "req_body", field: "items" },
          iteratorVariable: "cartItem",
          outputVariable: "processedItems",
          loopBody: [
            {
              id: "step-item-transform",
              name: "Calculate Item Total",
              type: "transform",
              enabled: true,
              functionRef: {
                name: "calcItemTotal",
                importPath: "./transformers/calcItemTotal",
              },
              inputBindings: [
                {
                  argName: "price",
                  source: {
                    kind: "step_output",
                    stepId: "__iterator__cartItem",
                    field: "price",
                  },
                },
                {
                  argName: "qty",
                  source: {
                    kind: "step_output",
                    stepId: "__iterator__cartItem",
                    field: "quantity",
                  },
                },
              ],
              outputVariable: "itemTotal",
            },
          ],
        },
      ];

      const lines = renderPipeline(steps, "body");
      const code = lines.join("\n");

      expect(code).toContain("const processedItems = await Promise.all(");
      expect(code).toContain("(Array.isArray(body.items) ? body.items : []).map(async (cartItem) => {");
      expect(code).toContain("price: cartItem.price");
      expect(code).toContain("qty: cartItem.quantity");
    });

    it("compiles early_return step and runIf guards on steps", () => {
      const steps: PipelineStep[] = [
        {
          id: "step-cache-read",
          name: "Fetch from Cache",
          type: "redis_operation",
          enabled: true,
          functionRef: {
            name: "getCachedProduct",
            importPath: "@workspace/redis",
          },
          inputBindings: [
            { argName: "id", source: { kind: "req_params", field: "id" } },
          ],
          outputVariable: "cachedProduct",
        },
        {
          id: "step-early-ret",
          name: "Return Cached Product Immediately",
          type: "early_return",
          enabled: true,
          statusCode: 200,
          inputBindings: [
            {
              argName: "data",
              source: { kind: "step_output", stepId: "step-cache-read" },
            },
          ],
          runIf: {
            left: { kind: "step_output", stepId: "step-cache-read" },
            operator: "exists",
          },
        },
        {
          id: "step-db-fallback",
          name: "Fetch from Database on Cache Miss",
          type: "db_operation",
          enabled: true,
          functionRef: {
            name: "findProductById",
            importPath: "@workspace/db",
          },
          inputBindings: [
            { argName: "id", source: { kind: "req_params", field: "id" } },
          ],
          outputVariable: "dbProduct",
          runIf: {
            left: { kind: "step_output", stepId: "step-cache-read" },
            operator: "not_exists",
          },
        },
      ];

      const lines = renderPipeline(steps, "body");
      const code = lines.join("\n");

      expect(code).toContain("const cachedProduct = await getCachedProduct(");
      expect(code).toContain("if ((cachedProduct !== null && cachedProduct !== undefined)) {");
      expect(code).toContain("return res.status(200).json(cachedProduct);");
      expect(code).toContain("if ((cachedProduct === null || cachedProduct === undefined)) {");
      expect(code).toContain("const dbProduct = await findProductById(");
    });

    it("recursively collects all imports from nested control flow branches", () => {
      const steps: PipelineStep[] = [
        {
          id: "s-cond",
          name: "Condition",
          type: "condition",
          enabled: true,
          inputBindings: [],
          thenSteps: [
            {
              id: "s-t1",
              name: "Transform A",
              type: "transform",
              enabled: true,
              functionRef: { name: "fnA", importPath: "@workspace/pkg-a" },
              inputBindings: [],
              outputVariable: "resA",
            },
          ],
          elseSteps: [
            {
              id: "s-try",
              name: "Try Catch",
              type: "try_catch",
              enabled: true,
              inputBindings: [],
              trySteps: [
                {
                  id: "s-db",
                  name: "DB Op",
                  type: "db_operation",
                  enabled: true,
                  functionRef: { name: "fnB", importPath: "@workspace/pkg-b" },
                  inputBindings: [],
                  outputVariable: "resB",
                },
              ],
              catchSteps: [
                {
                  id: "s-kafka",
                  name: "Kafka Publish",
                  type: "kafka_publish",
                  enabled: true,
                  functionRef: { name: "fnC", importPath: "@workspace/pkg-c" },
                  inputBindings: [],
                  outputVariable: "resC",
                },
              ],
            },
          ],
        },
      ];

      const imports = collectPipelineImports(steps);

      expect(imports.has("@workspace/pkg-a")).toBe(true);
      expect(imports.get("@workspace/pkg-a")?.has("fnA")).toBe(true);

      expect(imports.has("@workspace/pkg-b")).toBe(true);
      expect(imports.get("@workspace/pkg-b")?.has("fnB")).toBe(true);

      expect(imports.has("@workspace/pkg-c")).toBe(true);
      expect(imports.get("@workspace/pkg-c")?.has("fnC")).toBe(true);
    });
  });

  describe("Step-level onError policies", () => {
    it("renders fallback value policy wrapped in try-catch", () => {
      const step: PipelineStep = {
        id: "step-ext",
        name: "Call Weather",
        type: "external_call",
        enabled: true,
        outputVariable: "weatherData",
        onError: {
          action: "fallback",
          fallbackValue: '{"temperature": 20, "condition": "sunny"}',
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "reqBody",
      });
      const code = lines.join("\n");

      expect(code).toContain("let weatherData: Record<string, string | number | boolean | null> | null = null;");
      expect(code).toContain("try {");
      expect(code).toContain("} catch (stepErr: unknown) {");
      expect(code).toContain('logger.warn("Step Call Weather failed, using fallback value:", stepErr);');
      expect(code).toContain('weatherData = {"temperature": 20, "condition": "sunny"};');
    });

    it("renders early_return policy with custom statusCode and message", () => {
      const step: PipelineStep = {
        id: "step-db",
        name: "Query User",
        type: "db_operation",
        enabled: true,
        outputVariable: "userRow",
        functionRef: { name: "findUserById", importPath: "@workspace/db" },
        inputBindings: [],
        onError: {
          action: "early_return",
          statusCode: 502,
          errorMessage: "Failed to connect to user database",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "reqBody",
      });
      const code = lines.join("\n");

      expect(code).toContain("try {");
      expect(code).toContain("const userRow = await findUserById();");
      expect(code).toContain("} catch (stepErr: unknown) {");
      expect(code).toContain("return res.status(502).json({");
      expect(code).toContain('error: "Failed to connect to user database"');
    });

    it("renders automatic retries loop before failing", () => {
      const step: PipelineStep = {
        id: "step-flaky",
        name: "Flaky Call",
        type: "transform",
        enabled: true,
        outputVariable: "flakyRes",
        functionRef: { name: "computeHash", importPath: "@workspace/utils" },
        inputBindings: [],
        onError: {
          action: "throw",
          retries: 3,
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "reqBody",
      });
      const code = lines.join("\n");

      expect(code).toContain("let attempts_step_flaky = 0;");
      expect(code).toContain("while (attempts_step_flaky <= 3) {");
      expect(code).toContain("try {");
      expect(code).toContain("flakyRes = computeHash();");
      expect(code).toContain("break;");
      expect(code).toContain("if (attempts_step_flaky > 3) throw retryErr;");
    });

    it("renders ignore policy to log error and proceed to next step", () => {
      const step: PipelineStep = {
        id: "step-safe",
        name: "Optional Analytics",
        type: "service_call",
        enabled: true,
        outputVariable: "analyticsRes",
        functionRef: { name: "sendAnalytics", importPath: "@workspace/services" },
        inputBindings: [],
        onError: {
          action: "ignore",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "reqBody",
      });
      const code = lines.join("\n");

      expect(code).toContain("let analyticsRes: Record<string, string | number | boolean | null> | null = null;");
      expect(code).toContain("try {");
      expect(code).toContain("analyticsRes = await sendAnalytics();");
      expect(code).toContain("} catch (stepErr: unknown) {");
      expect(code).toContain('logger.error("Step Optional Analytics failed, proceeding to next step:", stepErr);');
    });

    it("renders throw policy to log and re-throw error", () => {
      const step: PipelineStep = {
        id: "step-strict",
        name: "Strict Validation",
        type: "transform",
        enabled: true,
        outputVariable: "validRes",
        functionRef: { name: "validateStrict", importPath: "@workspace/utils" },
        inputBindings: [],
        onError: {
          action: "throw",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "reqBody",
      });
      const code = lines.join("\n");

      expect(code).toContain("try {");
      expect(code).toContain("const validRes = validateStrict();");
      expect(code).toContain("} catch (stepErr: unknown) {");
      expect(code).toContain('logger.error("Step Strict Validation failed:", stepErr);');
      expect(code).toContain("throw stepErr;");
    });
  });
});
