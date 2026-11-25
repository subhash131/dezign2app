import { describe, it, expect } from "vitest";
import { renderPipeline, renderPipelineStep } from "../generators/routeGenerator/pipeline";
import { collectPipelineImports } from "../generators/routeGenerator/pipeline/importCollector";
import { emitHandlerPreamble } from "../generators/routeGenerator/handlers/handlerPreambleEmitter";
import { PipelineStep } from "@workspace/canvas/types";
import type { BackendNode } from "@/types/canvas";
import {
  getAvailableSources,
  getPriorMutableVariables,
  getPriorVariables,
} from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/utils";

describe("compileVariablePipelineStep", () => {
  it("renders a mutable variable declaration (let)", () => {
    const step: PipelineStep = {
      id: "var-1",
      name: "Initialize count",
      type: "variable",
      outputVariable: "count",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "number",
      variableSource: { kind: "inline", value: 0 },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["let count: number = 0;"]);
  });

  it("renders an immutable variable declaration (const)", () => {
    const step: PipelineStep = {
      id: "var-2",
      name: "Tax rate",
      type: "variable",
      outputVariable: "taxRate",
      declarationKind: "const",
      variableOperation: "declare",
      variableDataType: "number",
      variableSource: { kind: "inline", value: 0.08 },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["const taxRate: number = 0.08;"]);
  });

  it("renders an uninitialized mutable variable declaration", () => {
    const step: PipelineStep = {
      id: "var-3",
      name: "Result placeholder",
      type: "variable",
      outputVariable: "pendingOrder",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "Order | null",
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["let pendingOrder: Order | null;"]);
  });

  it("renders variable declaration mapped from request body", () => {
    const step: PipelineStep = {
      id: "var-4",
      name: "Extract user status",
      type: "variable",
      outputVariable: "currentStatus",
      declarationKind: "let",
      variableOperation: "declare",
      variableSource: { kind: "req_body", field: "initialStatus" },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["let currentStatus = body.initialStatus;"]);
  });

  it("renders variable assignment / update step", () => {
    const step: PipelineStep = {
      id: "var-5",
      name: "Increment counter",
      type: "variable",
      outputVariable: "count",
      variableOperation: "assign",
      variableOperator: "+=",
      variableSource: { kind: "inline", value: 1 },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["count += 1;"]);
  });

  it("renders transform step with declarationKind = 'reassign'", () => {
    const step: PipelineStep = {
      id: "step-transform-1",
      name: "Format user",
      type: "transform",
      outputVariable: "userData",
      declarationKind: "reassign",
      functionRef: {
        name: "formatUserData",
        importPath: "@/transformers/formatUserData",
      },
      inputBindings: [
        { argName: "data", source: { kind: "req_body", field: "user" } },
      ],
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines.join("\n")).toContain("userData = formatUserData(");
    expect(lines.join("\n")).toContain("data: body.user");
  });

  it("renders async operation with declarationKind = 'reassign'", () => {
    const step: PipelineStep = {
      id: "step-db-1",
      name: "Update order",
      type: "db_operation",
      outputVariable: "order",
      declarationKind: "reassign",
      functionRef: {
        name: "updateOrder",
        importPath: "@/db/orderOperations",
      },
      inputBindings: [
        { argName: "id", source: { kind: "req_params", field: "orderId" } },
      ],
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines.join("\n")).toContain("order = await updateOrder(");
    expect(lines.join("\n")).toContain("id: req.params.orderId");
  });

  it("renders complete real-world pipeline with variable declaration, mutation, and response", () => {
    const steps: PipelineStep[] = [
      {
        id: "v1",
        name: "Declare total",
        type: "variable",
        outputVariable: "total",
        declarationKind: "let",
        variableOperation: "declare",
        variableDataType: "number",
        variableSource: { kind: "inline", value: 0 },
      },
      {
        id: "t1",
        name: "Calculate tax",
        type: "transform",
        outputVariable: "tax",
        declarationKind: "const",
        functionRef: {
          name: "calculateTax",
          importPath: "@/utils/tax",
        },
        inputBindings: [
          { argName: "baseAmount", source: { kind: "req_body", field: "amount" } },
        ],
      },
      {
        id: "v2",
        name: "Update total with tax",
        type: "variable",
        outputVariable: "total",
        variableOperation: "assign",
        variableOperator: "=",
        variableSource: { kind: "step_output", stepId: "t1" },
      },
      {
        id: "r1",
        name: "Return response",
        type: "return_response",
        statusCode: 200,
        inputBindings: [
          { argName: "total", source: { kind: "step_output", stepId: "v1" } },
        ],
      },
    ];

    const lines = renderPipeline(steps, "body");
    const code = lines.join("\n");

    expect(code).toContain("let total: number = 0;");
    expect(code).toContain("const tax = calculateTax(");
    expect(code).toContain("total = tax;");
    expect(code).toContain("return res.status(200).json({");
  });

  it("does not append a numeric suffix to variable reassignment steps during disambiguation", () => {
    const steps: PipelineStep[] = [
      {
        id: "step-1",
        name: "Variable: simpleTest",
        type: "variable",
        outputVariable: "simpleTest",
        declarationKind: "let",
        variableOperation: "declare",
        variableDataType: "string",
        variableSource: { kind: "inline", value: "" },
      },
      {
        id: "step-2",
        name: "transformData1Result",
        type: "transform",
        outputVariable: "transformData1Result",
        declarationKind: "const",
        functionRef: {
          name: "transformData1",
          importPath: "@/transformers/transformData1",
        },
        inputBindings: [
          { argName: "input", source: { kind: "req_body", field: "inputText" } },
        ],
      },
      {
        id: "step-3",
        name: "Assign simpleTest",
        type: "variable",
        outputVariable: "simpleTest",
        variableOperation: "assign",
        declarationKind: "reassign",
        variableOperator: "=",
        variableSource: { kind: "step_output", stepId: "step-2", field: "result" },
      },
      {
        id: "step-4",
        name: "Return Response",
        type: "return_response",
        statusCode: 201,
        inputBindings: [
          { argName: "data", source: { kind: "step_output", stepId: "step-1" } },
        ],
      },
    ];

    const lines = renderPipeline(steps, "body");
    const code = lines.join("\n");

    expect(code).toContain('let simpleTest: string = "";');
    expect(code).toContain("simpleTest = transformData1Result.result;");
    expect(code).not.toContain("simpleTest2");
    expect(code).toContain("data: simpleTest");
  });

  it("adds declared variables to getAvailableSources for downstream steps", () => {
    const priorSteps: PipelineStep[] = [
      {
        id: "v-declared",
        name: "Order total",
        type: "variable",
        outputVariable: "orderTotal",
        declarationKind: "let",
        variableOperation: "declare",
        variableDataType: "number",
      },
      {
        id: "v-assigned",
        name: "Mutate total",
        type: "variable",
        outputVariable: "orderTotal",
        variableOperation: "assign",
      },
    ];

    const sources = getAvailableSources(undefined, priorSteps, []);
    const varSource = sources.find((s) => s.variableName === "orderTotal");

    expect(varSource).toBeDefined();
    expect(varSource?.label).toContain("Variable: orderTotal (let)");
  });

  it("collects prior mutable variables correctly via getPriorMutableVariables", () => {
    const priorSteps: PipelineStep[] = [
      {
        id: "v1",
        name: "Let variable",
        type: "variable",
        outputVariable: "counter",
        declarationKind: "let",
        variableOperation: "declare",
        variableDataType: "number",
      },
      {
        id: "v2",
        name: "Const variable",
        type: "variable",
        outputVariable: "MAX_LIMIT",
        declarationKind: "const",
        variableOperation: "declare",
      },
      {
        id: "s1",
        name: "Let operation",
        type: "db_operation",
        outputVariable: "activeUser",
        declarationKind: "let",
      },
    ];

    const mutables = getPriorMutableVariables(priorSteps);
    expect(mutables.map((m) => m.name)).toEqual(["counter", "activeUser"]);
  });

  it("renders object property assignment / update on a const object", () => {
    const step: PipelineStep = {
      id: "var-obj-mutate",
      name: "Update user status",
      type: "variable",
      outputVariable: "user",
      variableOperation: "assign",
      variableMutationKind: "property",
      variablePropertyPath: "status",
      variableOperator: "=",
      variableSource: { kind: "inline", value: "active" },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(['user.status = "active";']);
  });

  it("renders object property numeric increment", () => {
    const step: PipelineStep = {
      id: "var-obj-inc",
      name: "Increment view count",
      type: "variable",
      outputVariable: "analytics",
      variableOperation: "assign",
      variableMutationKind: "property",
      variablePropertyPath: "stats.viewCount",
      variableOperator: "+=",
      variableSource: { kind: "inline", value: 1 },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["analytics.stats.viewCount += 1;"]);
  });

  it("renders array push on a const array", () => {
    const step: PipelineStep = {
      id: "var-arr-push",
      name: "Add item to cart",
      type: "variable",
      outputVariable: "items",
      variableOperation: "assign",
      variableMutationKind: "array_push",
      variableOperator: "push",
      variableSource: { kind: "req_body", field: "newItem" },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(["items.push(body.newItem);"]);
  });

  it("renders array push on a nested object property array", () => {
    const step: PipelineStep = {
      id: "var-nested-push",
      name: "Push role to user roles",
      type: "variable",
      outputVariable: "user",
      variableOperation: "assign",
      variableMutationKind: "array_push",
      variablePropertyPath: "roles",
      variableOperator: "push",
      variableSource: { kind: "inline", value: "admin" },
    };

    const lines = renderPipelineStep(step, {
      priorOutputs: new Map(),
      bodyVar: "body",
    });

    expect(lines).toEqual(['user.roles.push("admin");']);
  });

  it("extracts rich variable info via getPriorVariables including const/let, objects, and schemas", () => {
    const priorSteps: PipelineStep[] = [
      {
        id: "s1",
        name: "Create User",
        type: "db_operation",
        outputVariable: "createdUser",
        declarationKind: "const",
        outputSchema: [
          { name: "id", type: "string" },
          { name: "email", type: "string" },
          { name: "status", type: "string" },
        ],
      },
      {
        id: "s2",
        name: "Init Tags",
        type: "variable",
        outputVariable: "tags",
        declarationKind: "const",
        variableOperation: "declare",
        variableDataType: "string[]",
      },
      {
        id: "s3",
        name: "Init Counter",
        type: "variable",
        outputVariable: "counter",
        declarationKind: "let",
        variableOperation: "declare",
        variableDataType: "number",
      },
    ];

    const vars = getPriorVariables(priorSteps);
    expect(vars).toHaveLength(3);

    const userVar = vars.find((v) => v.name === "createdUser");
    expect(userVar).toBeDefined();
    expect(userVar?.declarationKind).toBe("const");
    expect(userVar?.isMutable).toBe(false);
    expect(userVar?.isObject).toBe(true);
    expect(userVar?.knownProperties).toEqual(["id", "email", "status"]);

    const tagsVar = vars.find((v) => v.name === "tags");
    expect(tagsVar).toBeDefined();
    expect(tagsVar?.isArray).toBe(true);
    expect(tagsVar?.declarationKind).toBe("const");

    const counterVar = vars.find((v) => v.name === "counter");
    expect(counterVar).toBeDefined();
    expect(counterVar?.declarationKind).toBe("let");
    expect(counterVar?.isMutable).toBe(true);
  });

  it("compiles stringified numeric/boolean inline values according to variableDataType", () => {
    const numZeroStep: PipelineStep = {
      id: "var-num-str-zero",
      name: "Zero count",
      type: "variable",
      outputVariable: "count",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "number",
      variableSource: { kind: "inline", value: "0" },
    };

    const numEmptyStep: PipelineStep = {
      id: "var-num-empty",
      name: "Empty count",
      type: "variable",
      outputVariable: "emptyCount",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "number",
      variableSource: { kind: "inline", value: "" },
    };

    const boolStrStep: PipelineStep = {
      id: "var-bool-str",
      name: "Flag",
      type: "variable",
      outputVariable: "isReady",
      declarationKind: "const",
      variableOperation: "declare",
      variableDataType: "boolean",
      variableSource: { kind: "inline", value: "false" },
    };

    const arrayStrStep: PipelineStep = {
      id: "var-arr-str",
      name: "Items",
      type: "variable",
      outputVariable: "items",
      declarationKind: "const",
      variableOperation: "declare",
      variableDataType: "string[]",
      variableSource: { kind: "inline", value: "[]" },
    };

    expect(
      renderPipelineStep(numZeroStep, { priorOutputs: new Map(), bodyVar: "body" }),
    ).toEqual(["let count: number = 0;"]);
    expect(
      renderPipelineStep(numEmptyStep, { priorOutputs: new Map(), bodyVar: "body" }),
    ).toEqual(["let emptyCount: number = 0;"]);
    expect(
      renderPipelineStep(boolStrStep, { priorOutputs: new Map(), bodyVar: "body" }),
    ).toEqual(["const isReady: boolean = false;"]);
    expect(
      renderPipelineStep(arrayStrStep, { priorOutputs: new Map(), bodyVar: "body" }),
    ).toEqual(["const items: string[] = [];"]);
  });

  it("imports custom TypesNode types from @workspace/types and safely initializes custom object/array variables", () => {
    const typesNode: BackendNode = {
      id: "types-node-1",
      type: "types",
      position: { x: 0, y: 0 },
      data: {
        label: "Domain Types",
        types: [
          {
            id: "t-user",
            name: "UserProfile",
            kind: "interface",
            fields: [{ id: "f1", name: "id", type: "string", required: true }],
          },
        ],
      },
    } as unknown as BackendNode;

    const singleCustomStep: PipelineStep = {
      id: "var-custom-obj",
      name: "Profile",
      type: "variable",
      outputVariable: "profile",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "UserProfile",
      variableSource: { kind: "inline", value: "{}" },
    };

    const arrayCustomStep: PipelineStep = {
      id: "var-custom-arr",
      name: "Profiles",
      type: "variable",
      outputVariable: "profiles",
      declarationKind: "let",
      variableOperation: "declare",
      variableDataType: "UserProfile[]",
      variableSource: { kind: "inline", value: "[]" },
    };

    expect(
      renderPipelineStep(singleCustomStep, { priorOutputs: new Map(), bodyVar: "body" }),
    ).toEqual(["let profile: UserProfile = {} as UserProfile;"]);
    expect(
      renderPipelineStep(arrayCustomStep, { priorOutputs: new Map(), bodyVar: "body" }),
    ).toEqual(["let profiles: UserProfile[] = [];"]);

    const imports = collectPipelineImports([singleCustomStep, arrayCustomStep], [typesNode]);
    expect(Array.from(imports.get("@workspace/types") || [])).toEqual(["UserProfile"]);

    const { preambleCode } = emitHandlerPreamble({
      serviceName: "Users",
      routeFileName: "getUsers",
      handlerName: "getUsers",
      pascalName: "UsersGetUsers",
      schemaVarPrefix: "usersGetUsers",
      method: "GET",
      path: "/users",
      summary: "Get users",
      pickedDbOps: [],
      dbFunctions: [],
      redisFunctions: [],
      kafkaFunctions: [],
      pickedKafka: null,
      codeBlockText: "",
      hasStreamingStep: false,
      queryTypeResHasContent: false,
      isBodyMethod: false,
      bodyTypeResHasContent: false,
      pipelineSteps: [singleCustomStep, arrayCustomStep],
      allNodes: [typesNode],
    });

    expect(preambleCode).toContain("UserProfile");
    expect(preambleCode.match(/from "@workspace\/types"/g)?.length).toBe(1);
  });
});
