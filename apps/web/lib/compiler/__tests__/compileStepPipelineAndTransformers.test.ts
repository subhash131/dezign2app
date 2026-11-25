import { describe, it, expect } from "vitest";
import { compileTransformerHelpers } from "../compileTransformerHelpers";
import { renderPipeline, collectPipelineImports } from "../generators/routeGenerator/pipelineRenderer";
import { generateEndpointRouteHandler } from "../generators/routeGenerator/endpointHandlerGenerator";
import { generateConsumers } from "../generators/consumerGenerator";
import { schemaToTsInterface, schemaToZodSchema } from "../generators/schemaToTypeScript";
import { generateResponseInterface } from "../generators/typesGenerator/responseInference";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge, Endpoint, AnyMessagingResource } from "@workspace/canvas/types";

describe("Step Pipeline & Transformer Helpers", () => {
  describe("compileTransformerHelpers", () => {
    it("compiles global transformer helper to packages/transformers and local helper to apps/service/src/transformers", () => {
      const nodes: BackendNode[] = [
        {
          id: "service-1",
          type: "service",
          data: {
            label: "ProductsService",
            transformerHelpers: [
              {
                id: "h1",
                name: "slugifyProductInput",
                description: "Generates slug from product name",
                scope: "local",
                targetServiceId: "service-1",
                inputSchema: [
                  { name: "name", type: "string", required: true },
                  { name: "category", type: "string", required: false },
                ],
                logicMode: "code",
                code: "return {\n  slug: input.name.toLowerCase().replace(/\\s+/g, '-'),\n  category: input.category || 'default'\n};",
                returnSchema: [
                  { name: "slug", type: "string", required: true },
                  { name: "category", type: "string", required: true },
                ],
              },
              {
                id: "h2",
                name: "formatGlobalCurrency",
                description: "Shared currency formatter",
                scope: "global",
                inputSchema: [{ name: "amount", type: "number", required: true }],
                logicMode: "code",
                code: "return { formatted: `$${input.amount.toFixed(2)}` };",
                returnSchema: [{ name: "formatted", type: "string", required: true }],
              },
            ],
          },
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
        },
      ];

      const result = compileTransformerHelpers(nodes);

      // Global helper checks
      expect(result.globalPackageName).toBe("@workspace/transformers");
      const globalFile = result.files.find((f) => f.filename.includes("packages/transformers/src/formatGlobalCurrency.ts"));
      expect(globalFile).toBeDefined();
      expect(globalFile?.content).toContain("export interface FormatGlobalCurrencyInput");
      expect(globalFile?.content).toContain("amount: number;");
      expect(globalFile?.content).toContain("export interface FormatGlobalCurrencyOutput");
      expect(globalFile?.content).toContain("formatted: string;");
      expect(globalFile?.content).toContain("export function formatGlobalCurrency({ amount }: FormatGlobalCurrencyInput): FormatGlobalCurrencyOutput");

      // Local helper checks
      const localFile = result.files.find((f) => f.filename.includes("apps/productsservice/src/transformers/slugifyProductInput.ts"));
      expect(localFile).toBeDefined();
      expect(localFile?.content).toContain("export interface SlugifyProductInputInput");
      expect(localFile?.content).toContain("name: string;");
      expect(localFile?.content).toContain("category?: string;");
      expect(localFile?.content).toContain("export function slugifyProductInput({ name, category }: SlugifyProductInputInput): SlugifyProductInputOutput");

      // Reusable functions
      expect(result.reusableFunctions.some((f) => f.name === "slugifyProductInput")).toBe(true);
      expect(result.reusableFunctions.some((f) => f.name === "formatGlobalCurrency")).toBe(true);
    });

    it("handles full function declarations without double wrapping", () => {
      const nodes: BackendNode[] = [
        {
          id: "trans-custom",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
          data: {
            label: "customTransformer",
            functionName: "customTransformer",
            code: "export function customTransformer(input: CustomTransformerInput): CustomTransformerOutput {\n  return { ok: true };\n}",
            inputSchema: [{ id: "1", name: "foo", type: "string", required: true }],
            returnSchema: [{ id: "2", name: "ok", type: "boolean", required: true }],
          },
        },
      ];
      const result = compileTransformerHelpers(nodes);
      const file = result.files.find((f) => f.filename.includes("customTransformer.ts"));
      expect(file).toBeDefined();
      const occurrences = (file?.content.match(/export function customTransformer/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it("emits empty function input func() and omits input interface when input schema is not configured or empty", () => {
      const nodes: BackendNode[] = [
        {
          id: "trans-no-input",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
          data: {
            label: "generateUniqueId",
            functionName: "generateUniqueId",
            scope: "global",
            code: "return { slug: 'unique-123' };",
            inputSchema: [],
            returnSchema: [{ id: "1", name: "slug", type: "string", required: true }],
          },
        },
      ];
      const result = compileTransformerHelpers(nodes);
      const file = result.files.find((f) => f.filename.includes("generateUniqueId.ts"));
      expect(file).toBeDefined();
      expect(file?.content).toContain("export function generateUniqueId(): GenerateUniqueIdOutput {");
      expect(file?.content).not.toContain("export interface GenerateUniqueIdInput");
      expect(file?.content).toContain("export interface GenerateUniqueIdOutput");

      const reusable = result.reusableFunctions.find((r) => r.name === "generateUniqueId");
      expect(reusable).toBeDefined();
      expect(reusable?.signature).toBe("generateUniqueId(): GenerateUniqueIdOutput");
    });

    it("generates imports for imported transformer dependencies", () => {
      const nodes: BackendNode[] = [
        {
          id: "trans-slugify",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
          data: {
            label: "slugify",
            functionName: "slugify",
            scope: "global",
            code: "return { slug: input.name.toLowerCase() };",
            inputSchema: [{ id: "1", name: "name", type: "string", required: true }],
            returnSchema: [{ id: "2", name: "slug", type: "string", required: true }],
          },
        },
        {
          id: "trans-compose",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a1",
          data: {
            label: "createProductItem",
            functionName: "createProductItem",
            scope: "global",
            importedTransformerIds: ["trans-slugify"],
            code: "const { slug } = slugify({ name: input.title });\nreturn { id: slug, title: input.title };",
            inputSchema: [{ id: "1", name: "title", type: "string", required: true }],
            returnSchema: [
              { id: "1", name: "id", type: "string", required: true },
              { id: "2", name: "title", type: "string", required: true },
            ],
          },
        },
      ];
      const result = compileTransformerHelpers(nodes);
      const composeFile = result.files.find((f) => f.filename.includes("createProductItem.ts"));
      expect(composeFile).toBeDefined();
      expect(composeFile?.content).toContain('import { slugify } from "./slugify";');
    });

    it("warns on mutual circular dependency loops while preserving imports for valid recursion", () => {
      const nodes: BackendNode[] = [
        {
          id: "trans-a",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
          data: {
            label: "fnA",
            functionName: "fnA",
            scope: "global",
            importedTransformerIds: ["trans-b"],
            code: "return { resA: fnB({ val: input.val }).resB };",
            inputSchema: [{ id: "1", name: "val", type: "string", required: true }],
            returnSchema: [{ id: "2", name: "resA", type: "string", required: true }],
          },
        },
        {
          id: "trans-b",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a1",
          data: {
            label: "fnB",
            functionName: "fnB",
            scope: "global",
            // Mutual recursion back to trans-a
            importedTransformerIds: ["trans-a"],
            code: "return { resB: fnA({ val: input.val }).resA };",
            inputSchema: [{ id: "1", name: "val", type: "string", required: true }],
            returnSchema: [{ id: "2", name: "resB", type: "string", required: true }],
          },
        },
      ];
      const result = compileTransformerHelpers(nodes);
      const fileA = result.files.find((f) => f.filename.includes("fnA.ts"));
      const fileB = result.files.find((f) => f.filename.includes("fnB.ts"));
      expect(fileA).toBeDefined();
      expect(fileB).toBeDefined();

      // In Option A, imports are preserved so user-written mutual recursive functions can compile
      expect(fileA?.content).toContain('import { fnB } from "./fnB";');
      expect(fileB?.content).toContain('import { fnA } from "./fnA";');
    });

    it("generates imports for packageImports (named, default, namespace, and type-only) in transformer code", () => {
      const nodes: BackendNode[] = [
        {
          id: "trans-pkg-demo",
          type: "transformer",
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
          data: {
            label: "sanitizeAndFormatUser",
            functionName: "sanitizeAndFormatUser",
            scope: "global",
            packageImports: [
              {
                id: "imp-1",
                packageName: "lodash-es",
                namedImports: ["cloneDeep", "merge"],
              },
              {
                id: "imp-2",
                packageName: "dayjs",
                defaultImport: "dayjs",
              },
              {
                id: "imp-3",
                packageName: "crypto-js",
                namespaceImport: "crypto",
              },
              {
                id: "imp-4",
                packageName: "zod",
                namedImports: ["ZodType"],
                isTypeOnly: true,
              },
            ],
            code: "const cloned = cloneDeep(input);\nreturn { id: cloned.id, formattedDate: dayjs().toISOString() };",
            inputSchema: [{ id: "1", name: "id", type: "string", required: true }],
            returnSchema: [
              { id: "2", name: "id", type: "string", required: true },
              { id: "3", name: "formattedDate", type: "string", required: true },
            ],
          },
        },
      ];

      const result = compileTransformerHelpers(nodes);
      const file = result.files.find((f) => f.filename.includes("sanitizeAndFormatUser.ts"));
      expect(file).toBeDefined();

      // Verify all package import statements generated at top
      expect(file?.content).toContain('import { cloneDeep, merge } from "lodash-es";');
      expect(file?.content).toContain('import dayjs from "dayjs";');
      expect(file?.content).toContain('import * as crypto from "crypto-js";');
      expect(file?.content).toContain('import type { ZodType } from "zod";');

      // Verify packages are added to packages/transformers/package.json dependencies
      const pkgJsonFile = result.files.find((f) => f.filename.includes("packages/transformers/package.json"));
      expect(pkgJsonFile).toBeDefined();
      const parsedPkgJson = JSON.parse(pkgJsonFile!.content);
      expect(parsedPkgJson.dependencies["lodash-es"]).toBeDefined();
      expect(parsedPkgJson.dependencies["dayjs"]).toBeDefined();
      expect(parsedPkgJson.dependencies["crypto-js"]).toBeDefined();
      expect(parsedPkgJson.dependencies["zod"]).toBeDefined();
    });
  });

  describe("pipelineRenderer & endpointHandlerGenerator", () => {
    it("generates deterministic step-by-step pipeline code with explicit input bindings", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-create-product",
        name: "/products",
        type: "POST",
        nodeId: "service-1",
        requestBody: {
          id: "req-1",
          fields: [
            { id: "f1", name: "name", type: "string", required: true },
            { id: "f2", name: "price", type: "number", required: true },
            { id: "f3", name: "category", type: "string", required: true },
          ],
        },
        pipelineSteps: [
          {
            id: "step-1",
            name: "Transform Product Input",
            type: "transform",
            enabled: true,
            functionRef: {
              name: "slugifyProductInput",
              importPath: "./transformers/slugifyProductInput",
            },
            inputBindings: [
              {
                argName: "name",
                source: { kind: "req_body", field: "name" },
              },
            ],
            outputVariable: "transformedInput",
          },
          {
            id: "step-2",
            name: "Insert into Database",
            type: "db_operation",
            enabled: true,
            functionRef: {
              name: "createProduct",
              importPath: "@workspace/db/helpers/products",
            },
            inputBindings: [
              {
                argName: "name",
                source: { kind: "req_body", field: "name" },
              },
              {
                argName: "slug",
                source: { kind: "step_output", stepId: "step-1", field: "slug" },
              },
              {
                argName: "price",
                source: { kind: "req_body", field: "price" },
              },
              {
                argName: "category",
                source: { kind: "req_body", field: "category" },
              },
            ],
            outputVariable: "createdProduct",
          },
          {
            id: "step-3",
            name: "Cache in Redis",
            type: "redis_operation",
            enabled: true,
            functionRef: {
              name: "setProductsCache",
              importPath: "@workspace/primary-redis-cache",
            },
            inputBindings: [
              {
                argName: "0",
                source: { kind: "step_output", stepId: "step-2", field: "id" },
              },
              {
                argName: "1",
                source: { kind: "step_output", stepId: "step-2" },
              },
            ],
            outputVariable: "cacheResult",
          },
          {
            id: "step-4",
            name: "Publish Kafka Event",
            type: "kafka_publish",
            enabled: true,
            functionRef: {
              name: "publishKafkaEvent",
              importPath: "@workspace/kafka/publishers",
            },
            inputBindings: [
              {
                argName: "topic",
                source: { kind: "inline", value: "product-created" },
              },
              {
                argName: "payload",
                source: { kind: "step_output", stepId: "step-2" },
              },
            ],
            outputVariable: "kafkaPublishResult",
          },
          {
            id: "step-5",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: 201,
            inputBindings: [
              {
                argName: "_spread",
                source: { kind: "step_output", stepId: "step-2" },
              },
            ],
            outputVariable: "",
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "ProductsService",
        pascalServiceName: "ProductsService",
        serviceFolderName: "productsservice",
        allNodes: [],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      const content = result.file.content;

      // 1. Pipeline step 1: transform
      expect(content).toContain("const transformedInput = slugifyProductInput(");
      expect(content).toContain("name: body.name");

      // 2. Pipeline step 2: db_operation with prior step binding
      expect(content).toContain("const createdProduct = await createProduct(");
      expect(content).toContain("slug: transformedInput.slug");

      // 3. Pipeline step 3: redis positional call referencing createdProduct
      expect(content).toContain("const cacheResult = await setProductsCache(createdProduct.id, createdProduct);");

      // 4. Pipeline step 4: kafka publish
      expect(content).toContain("const kafkaPublishResult = await publishKafkaEvent(");
      expect(content).toContain('"product-created",');

      // 5. Pipeline step 5: return_response
      expect(content).toContain("return res.status(201).json(createdProduct);");

      // 6. Imports collected from steps
      expect(content).toContain('import { slugifyProductInput } from "./transformers/slugifyProductInput";');
      expect(content).toContain('import { createProduct } from "@workspace/db/helpers/products";');
      expect(content).toContain('import { setProductsCache } from "@workspace/primary-redis-cache";');
      expect(content).toContain('import { publishKafkaEvent } from "@workspace/kafka/publishers";');
    });
  });

  describe("compileMonorepo Integration", () => {
    it("compiles a complete monorepo including transformers package when configured", () => {
      const nodes: BackendNode[] = [
        {
          id: "service-1",
          type: "service",
          data: {
            label: "OrderService",
            transformerHelpers: [
              {
                id: "th1",
                name: "calculateDiscount",
                scope: "global",
                inputSchema: [{ name: "subtotal", type: "number" }],
                logicMode: "code",
                code: "return { total: input.subtotal * 0.9 };",
                returnSchema: [{ name: "total", type: "number" }],
              },
            ],
          },
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
        },
      ];

      const monorepo = compileMonorepo(nodes);
      const pkgJson = monorepo.files.find((f) => f.filename === "packages/transformers/package.json");
      expect(pkgJson).toBeDefined();

      const helperFile = monorepo.files.find((f) => f.filename === "packages/transformers/src/calculateDiscount.ts");
      expect(helperFile).toBeDefined();
      expect(helperFile?.content).toContain("export function calculateDiscount");
    });

    it("compiles standalone transformer nodes placed directly on the visual canvas", () => {
      const nodes: BackendNode[] = [
        {
          id: "trans-1",
          type: "transformer",
          data: {
            label: "formatPhoneNumber",
            functionName: "formatPhoneNumber",
            scope: "global",
            inputSchema: [{ id: "p1", name: "rawPhone", type: "string", required: true }],
            logicMode: "code",
            code: "return { formatted: input.rawPhone.replace(/\\D/g, '') };",
            returnSchema: [{ id: "r1", name: "formatted", type: "string", required: true }],
          },
          position: { x: 100, y: 100 },
          fractionalIndex: "a0",
        },
        {
          id: "service-1",
          type: "service",
          data: {
            label: "UserService",
          },
          position: { x: 300, y: 100 },
          fractionalIndex: "a1",
        },
        {
          id: "trans-local",
          type: "transformer",
          data: {
            label: "validateLocalPin",
            functionName: "validateLocalPin",
            scope: "local",
            targetServiceId: "service-1",
            inputSchema: [{ id: "p2", name: "pin", type: "string", required: true }],
            logicMode: "code",
            code: "return { isValid: input.pin.length === 6 };",
            returnSchema: [{ id: "r2", name: "isValid", type: "boolean", required: true }],
          },
          position: { x: 500, y: 100 },
          fractionalIndex: "a2",
        },
      ];

      const result = compileTransformerHelpers(nodes);

      // Global transformer from canvas node
      const globalFile = result.files.find((f) => f.filename === "packages/transformers/src/formatPhoneNumber.ts");
      expect(globalFile).toBeDefined();
      expect(globalFile?.content).toContain("export function formatPhoneNumber");

      // Local transformer attached to service
      const localFile = result.files.find((f) => f.filename.includes("apps/userservice/src/transformers/validateLocalPin.ts"));
      expect(localFile).toBeDefined();
      expect(localFile?.content).toContain("export function validateLocalPin");
    });
  });

  describe("schemaToTypeScript - nested object & array type tracking", () => {
    it("generates correctly indented recursive TypeScript interfaces and Zod schemas for deep nested payloads", () => {
      const complexSchema = {
        rawJson: JSON.stringify({
          product: {
            name: "Mechanical Keyboard",
            specs: {
              keys: 87,
              bluetooth: true,
              switches: {
                brand: "Cherry MX",
                type: "Brown",
              },
            },
          },
          tags: ["hardware", "keyboard"],
          price: 129.99,
        }),
      };

      const tsResult = schemaToTsInterface("CreateProductBody", complexSchema);
      expect(tsResult.hasContent).toBe(true);
      expect(tsResult.code).toContain("export interface CreateProductBody {");
      expect(tsResult.code).toContain("product: {");
      expect(tsResult.code).toContain("name: string;");
      expect(tsResult.code).toContain("specs: {");
      expect(tsResult.code).toContain("keys: number;");
      expect(tsResult.code).toContain("bluetooth: boolean;");
      expect(tsResult.code).toContain("switches: {");
      expect(tsResult.code).toContain("brand: string;");
      expect(tsResult.code).toContain("tags: string[];");
      expect(tsResult.code).toContain("price: number;");

      const zodResult = schemaToZodSchema("createProductBodySchema", complexSchema);
      expect(zodResult.hasContent).toBe(true);
      expect(zodResult.code).toContain("export const createProductBodySchema = z.object({");
      expect(zodResult.code).toContain("product: z.object({");
      expect(zodResult.code).toContain("specs: z.object({");
      expect(zodResult.code).toContain("switches: z.object({");
      expect(zodResult.code).toContain("tags: z.array(z.string())");
    });
  });

  describe("Transformer & Transformer Ref Connection Validation", () => {
    it("validates that transformer and transformer_ref nodes connect properly to endpoint-in handles", async () => {
      const { isValidConnection } = await import("@workspace/canvas");

      // 1. Transformer node -> Endpoint handle
      const res1 = isValidConnection("transformer", "transformer-out", "service", "endpoint-in-ep1");
      expect(res1.valid).toBe(true);
      if (res1.valid) {
        expect(res1.edgeType).toBe("connection");
      }

      // 2. Transformer Ref node -> Endpoint handle
      const res2 = isValidConnection("transformer_ref", "transformer-out", "service", "endpoint-in-ep1");
      expect(res2.valid).toBe(true);
      if (res2.valid) {
        expect(res2.edgeType).toBe("connection");
      }
    });

    it("compiles standalone local transformer with multiple target endpoint IDs", () => {
      const nodes: BackendNode[] = [
        {
          id: "service-1",
          type: "service",
          data: {
            label: "AuthService",
          },
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
        },
        {
          id: "trans-local-multi",
          type: "transformer",
          data: {
            label: "hashPassword",
            functionName: "hashPassword",
            scope: "local",
            targetServiceId: "service-1",
            targetEndpointIds: ["ep-register", "ep-reset-pw"],
            inputSchema: [{ id: "p3", name: "password", type: "string", required: true }],
            logicMode: "code",
            code: "return { hash: `hashed_${input.password}` };",
            returnSchema: [{ id: "r3", name: "hash", type: "string", required: true }],
          },
          position: { x: 400, y: 0 },
          fractionalIndex: "a1",
        },
      ];

      const result = compileTransformerHelpers(nodes);
      const localFile = result.files.find((f) => f.filename.includes("apps/authservice/src/transformers/hashPassword.ts"));
      expect(localFile).toBeDefined();
      expect(localFile?.content).toContain("export function hashPassword");
    });

    it("validates that transformer and transformer_ref nodes connect properly to consumedEvents-in handles", async () => {
      const { isValidConnection } = await import("@workspace/canvas");

      // 1. Transformer node -> Consumed Event handle
      const res1 = isValidConnection("transformer", "transformer-out", "service", "consumedEvents-in-ev1");
      expect(res1.valid).toBe(true);
      if (res1.valid) {
        expect(res1.edgeType).toBe("connection");
      }

      // 2. Transformer Ref node -> Consumed Event handle
      const res2 = isValidConnection("transformer_ref", "transformer-out", "service", "consumedEvents-in-ev1");
      expect(res2.valid).toBe(true);
      if (res2.valid) {
        expect(res2.edgeType).toBe("connection");
      }
    });

    it("compiles consumer handler with Step Pipeline and Transformer execution", () => {
      const consumedEvents: (AnyMessagingResource & {
        nodeId: string;
        variant: "publish" | "consume";
      })[] = [
        {
          id: "evt-order-created",
          name: "OrderCreated",
          nodeId: "service-1",
          variant: "consume",
          payloadSchema: {
            id: "ps1",
            rawJson: JSON.stringify({ orderId: "123", rawAmount: "100.50" }),
          },
          pipelineSteps: [
            {
              id: "step-1",
              name: "normalizeOrder",
              type: "transform" as const,
              enabled: true,
              functionRef: {
                name: "sanitizeOrderPayload",
                importPath: "../transformers/sanitizeOrderPayload",
                isGlobal: false,
              },
              inputBindings: [
                {
                  argName: "rawAmount",
                  source: {
                    kind: "req_body" as const,
                    field: "rawAmount",
                  },
                },
              ],
              outputVariable: "sanitizedOrder",
            },
          ],
        },
      ];

      const files = generateConsumers("OrderService", consumedEvents);
      const consumerFile = files.find((f) => f.filename === "src/consumer/orderCreated.ts");
      expect(consumerFile).toBeDefined();
      expect(consumerFile?.content).toContain("import { sanitizeOrderPayload } from \"../transformers/sanitizeOrderPayload\";");
      expect(consumerFile?.content).toContain("const sanitizedOrder = sanitizeOrderPayload(");
      expect(consumerFile?.content).toContain("rawAmount: validatedPayload.rawAmount");
    });

    it("sanitizes transformer names with spaces and normalizes @/services/... aliases to relative ../transformers/<name>", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-cache",
        nodeId: "service-conv",
        name: "/insert-cache",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "transform req to cache",
            type: "transform",
            enabled: true,
            functionRef: {
              name: "transform req to cache",
              importPath: "@/services/service-conv/transformers/transform req to cache",
            },
            inputBindings: [
              {
                argName: "data",
                source: { kind: "req_body", field: "data" },
              },
            ],
            outputVariable: "transformData1Result",
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "ConversationService",
        pascalServiceName: "ConversationService",
        serviceFolderName: "conversation",
        allNodes: [],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      const content = result.file.content;
      // 1. Should NOT contain spaces in import identifier or use invalid @/services/ alias
      expect(content).not.toContain("import { transform req to cache }");
      expect(content).not.toContain("transform req to cache(");
      expect(content).not.toContain("@/services/");
      // 2. Should import sanitized identifier from relative path ../transformers/transformReqToCache
      expect(content).toContain('import { transformReqToCache } from "../transformers/transformReqToCache";');
      // 3. Should call sanitized function name
      expect(content).toContain("const transformData1Result = transformReqToCache(");
    });

    it("reconciles return schema to nested object types when code returns nested structure", () => {
      const nodes: BackendNode[] = [
        {
          id: "service-conv",
          type: "service",
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
          data: {
            label: "Conversation",
            transformerHelpers: [
              {
                id: "h-cache",
                name: "transformReqToCache",
                scope: "local",
                targetServiceId: "service-conv",
                inputSchema: [
                  { name: "message", type: "string", required: true },
                  { name: "sender", type: "string", required: true },
                  { name: "conversationId", type: "string", required: true },
                ],
                logicMode: "code",
                code: `return {\n  key: conversationId,\n  value: { message, sender }\n};`,
                returnSchema: [
                  { name: "key", type: "string", required: true },
                  { name: "value", type: "string", required: true },
                ],
              },
            ],
          },
        },
      ];

      const result = compileTransformerHelpers(nodes);
      const file = result.files.find((f) => f.filename.includes("transformReqToCache.ts"));
      expect(file).toBeDefined();
      expect(file?.content).toContain("value: { message: string; sender: string };");
      expect(file?.content).not.toContain("value: string;");
    });

    it("renders redis_operation steps with named bindings positionally instead of wrapping into an object literal", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-insert-cache",
        nodeId: "service-conv",
        name: "/insert-cache",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "transformData1",
            type: "transform",
            enabled: true,
            functionRef: {
              name: "transformReqToCache",
              importPath: "../transformers/transformReqToCache",
            },
            inputBindings: [
              { argName: "data", source: { kind: "req_body" } },
            ],
            outputVariable: "transformData1Result",
          },
          {
            id: "step-2",
            name: "insertCache",
            type: "redis_operation",
            enabled: true,
            functionRef: {
              name: "appendConversationItem",
              importPath: "@workspace/primary-cache",
              signature: "appendConversationItem(id: string | number, item: ConversationItem): Promise<number>",
            },
            inputBindings: [
              {
                argName: "key",
                source: { kind: "step_output", stepId: "step-1", field: "key" },
              },
              {
                argName: "item",
                source: { kind: "step_output", stepId: "step-1", field: "value" },
              },
            ],
            outputVariable: "insertCacheResult",
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "ConversationService",
        pascalServiceName: "ConversationService",
        serviceFolderName: "conversation",
        allNodes: [],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      const content = result.file.content;
      expect(content).toContain(
        "const insertCacheResult = await appendConversationItem(transformData1Result.key, transformData1Result.value);",
      );
      expect(content).not.toContain("key: transformData1Result.key");
    });

    it("emits array element navigation [0]?.field when step output has array return type", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-get-conversations",
        nodeId: "service-conv",
        name: "/get-conversations",
        type: "GET",
        pipelineSteps: [
          {
            id: "step-get-conv",
            name: "getConversationResult",
            type: "redis_operation",
            enabled: true,
            functionRef: {
              name: "getConversation",
              importPath: "@workspace/primary-cache",
              signature: "getConversation(id: string): Promise<Conversation | null>",
              returnIsArray: true,
            },
            inputBindings: [
              { argName: "id", source: { kind: "req_body", field: "conversation_id" } },
            ],
            outputVariable: "getConversationResult",
          },
          {
            id: "step-ret",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: 200,
            inputBindings: [
              {
                argName: "_spread",
                source: { kind: "step_output", stepId: "step-get-conv", field: "message" },
              },
            ],
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "ConversationsService",
        pascalServiceName: "ConversationsService",
        serviceFolderName: "conversations",
        allNodes: [],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      const content = result.file.content;
      expect(content).toContain("return res.status(200).json(getConversationResult[0]?.message);");
    });

    it("infers string | undefined response type when step output field is mapped from redis operation", () => {
      const ep: Endpoint = {
        id: "ep-get-conversations",
        name: "/get-conversations",
        type: "GET",
        pipelineSteps: [
          {
            id: "step-get-conv",
            name: "getConversationResult",
            type: "redis_operation",
            enabled: true,
            functionRef: {
              name: "getConversation",
              importPath: "@workspace/primary-cache",
              signature: "getConversation(id: string): Promise<Conversation | null>",
              returnIsArray: true,
            },
            inputBindings: [
              { argName: "id", source: { kind: "req_body", field: "conversation_id" } },
            ],
            outputVariable: "getConversationResult",
          },
          {
            id: "step-ret",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: 200,
            inputBindings: [
              {
                argName: "_spread",
                source: { kind: "step_output", stepId: "step-get-conv", field: "message" },
              },
            ],
          },
        ],
      };

      const nodes: BackendNode[] = [
        {
          id: "redis-node-1",
          type: "redis_schema",
          data: {
            label: "conversation",
            jsonRootType: "array",
            columns: [
              { name: "message", type: "string" },
              { name: "sender", type: "string" },
            ],
          },
          position: { x: 0, y: 0 },
          fractionalIndex: "a0",
        },
      ];

      const res = generateResponseInterface("ConversationsGetGetConversationsResponse", [], undefined, nodes, ep);
      expect(res.code).toContain("export type ConversationsGetGetConversationsResponse = string | undefined;");
    });

    it("resolves array step field navigation even without returnIsArray on dynamic step functionRef", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-conv",
        nodeId: "svc-1",
        name: "/get-conversations",
        type: "GET",
        pipelineSteps: [
          {
            id: "step-1",
            name: "getConversationResult",
            type: "redis_operation",
            enabled: true,
            // Notice: returnIsArray is omitted, simulating dynamic canvas state
            functionRef: {
              name: "getConversation",
              importPath: "@workspace/primary-cache",
              signature: "getConversation(id: string): Promise<Conversation | null>",
            },
            inputBindings: [
              { argName: "id", source: { kind: "req_body", field: "conversation_id" } },
            ],
            outputVariable: "getConversationResult",
          },
          {
            id: "step-2",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: 200,
            inputBindings: [
              {
                argName: "data",
                source: { kind: "step_output", stepId: "step-1", field: "id" },
              },
            ],
          },
        ],
      };

      const redisNode: BackendNode = {
        id: "redis-node-1",
        type: "redis_schema",
        data: {
          label: "conversation",
          jsonRootType: "array",
          columns: [
            { name: "id", type: "string" },
            { name: "role", type: "string" },
            { name: "message", type: "string" },
          ],
        },
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "conversations",
        pascalServiceName: "Conversations",
        serviceFolderName: "conversations",
        allNodes: [redisNode],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [
          {
            name: "getConversation",
            importPath: "@workspace/primary-cache",
            signature: "getConversation(id: string): Promise<Conversation | null>",
            targetName: "conversation",
            kind: "findById",
            returnIsArray: true,
          },
        ],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      // Must emit [0]?.id instead of invalid .id on array
      expect(result.file.content).toContain("getConversationResult[0]?.id");
      expect(result.file.content).not.toContain("getConversationResult.id");
    });

    it("preserves object wrapper when return_response explicitly names field 'data'", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-data-field",
        nodeId: "svc-items",
        name: "/get-items",
        type: "GET",
        pipelineSteps: [
          {
            id: "step-ret",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: 200,
            inputBindings: [
              {
                argName: "data",
                source: { kind: "req_body", field: "items" },
              },
            ],
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "items",
        pascalServiceName: "Items",
        serviceFolderName: "items",
        allNodes: [],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      expect(result.file.content).toContain(
        "    return res.status(200).json({\n      data: body.items\n    });",
      );
    });
  });
});



