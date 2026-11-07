// ═══════════════════════════════════════════════════════════════
// MODULE: EndpointHandlerGenerator
// LAYER:  generators / routeGenerator
// EMITS:  Express route handler files (src/routes/<routeFileName>.ts)
// ═══════════════════════════════════════════════════════════════

import { Endpoint, AnyMessagingResource, CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { syncEndpointRouteWithPathParams, parseEndpointRouteWithParams } from "@workspace/canvas";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { parseSchemaJson, deriveRouteFileName, cleanUnusedImports, normalizeEndpointRequestBody } from "../../utils";
import { parametersToTsInterface, schemaToTsInterface } from "../schemaToTypeScript";
import { resolveEndpointTrace, isRouteConnectedToAuthenticatedPage } from "../../traceResolver";
import { pickDbFunctionsForEndpoint } from "./dbResolver";
import { pickKafkaPublishFunction } from "./kafkaResolver";
import { buildResponsePayloadCode } from "./responseBuilder";
import { renderPipeline } from "./pipelineRenderer";
import { classifyEndpointShape } from "./endpointTypeClassifier";
import {
  resolveEndpointAuth,
  emitValidationBlocks,
  emitAiDirective,
  emitLegacyDbRedisOperations,
  emitKafkaPublish,
  emitInterServiceCalls,
  emitHandlerPreamble,
  emitStorageOperations,
  toTsType,
  traceHasStorage,
} from "./handlers";

export { toTsType };
export * from "./handlers";

export interface GenerateEndpointHandlerParams {
  ep: Endpoint & { nodeId: string };
  index: number;
  serviceName: string;
  pascalServiceName: string;
  serviceFolderName: string;
  serviceNode?: BackendNode;
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  allEndpoints: (Endpoint & { nodeId: string })[];
  dbFunctions: ReusableFunction[];
  kafkaFunctions: ReusableFunction[];
  redisFunctions?: ReusableFunction[];
  storageFunctions?: ReusableFunction[];
  nodePublishedEvents: (AnyMessagingResource & { nodeId: string; variant: "publish" | "consume" })[];
  usedFileNames: Set<string>;
}

export interface GenerateEndpointHandlerResult {
  file: CompiledFile;
  routeImport: string;
  /** Bare router registration — middleware is injected by the caller based on requiresAuth/authOptions. */
  routeRegistration: string;
  /** Whether this endpoint requires authentication. */
  requiresAuth: boolean;
  /** JSON-serialized options object string, e.g. '{}' or '{"roles":["admin"]}'. Always valid JSON. */
  authOptions: string;
}

/**
 * Compiles a single canvas endpoint into an Express route handler TypeScript file.
 */
export function generateEndpointRouteHandler(
  params: GenerateEndpointHandlerParams,
): GenerateEndpointHandlerResult {
  const {
    ep: rawEp,
    index,
    serviceName,
    pascalServiceName,
    serviceFolderName,
    serviceNode,
    allNodes,
    allEdges,
    allEndpoints,
    dbFunctions,
    kafkaFunctions,
    redisFunctions = [],
    storageFunctions = [],
    nodePublishedEvents,
    usedFileNames,
  } = params;

  let ep = normalizeEndpointRequestBody(rawEp);
  let epName = ep.name || "/";
  let epPathParams = ep.pathParams || [];
  if (epPathParams.length > 0) {
    epName = syncEndpointRouteWithPathParams({
      currentRoute: epName,
      oldPathParams: [],
      newPathParams: epPathParams,
    });
  } else if (epName.includes("/:")) {
    const parsed = parseEndpointRouteWithParams(epName);
    if (parsed.extractedPathParams.length > 0) {
      epPathParams = parsed.extractedPathParams;
    }
  }
  ep = { ...ep, name: epName, pathParams: epPathParams };
  const method = (ep.type || "GET").toLowerCase();
  let routeFileName = deriveRouteFileName(ep, index, serviceName);

  if (usedFileNames.has(routeFileName)) {
    routeFileName = `${routeFileName}_${index + 1}`;
  }
  usedFileNames.add(routeFileName);

  // rawName = the actual endpoint path, used for event-name fuzzy matching.
  const rawName = ep.name?.trim() ? ep.name.trim() : `endpoint_${index + 1}`;

  const handlerName = `${routeFileName}Handler`;
  const pascalName = `${pascalServiceName}${toPascalCase(routeFileName)}`;
  const schemaVarPrefix = `${serviceFolderName}${toPascalCase(routeFileName)}`;
  const rawPath = ep.name?.startsWith("/") ? ep.name : `/${ep.name || ""}`;
  const path = rawPath.replace(/\s+/g, "-");
  const summary = ep.summary || `Handler for ${ep.type || "GET"} ${path}`;

  // Helper from utils for pascal naming
  function toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
      .replace(/^[a-z]/, (chr) => chr.toUpperCase());
  }

  const shape = classifyEndpointShape(ep, allNodes, allEdges);
  const isHealth =
    shape.kind === "health" ||
    path === "/health" ||
    path.endsWith("/health") ||
    rawPath === "/health" ||
    rawPath.endsWith("/health") ||
    ep.name === "/health" ||
    ep.name === "health";
  const isConnectedToAuthPage = serviceNode
    ? isRouteConnectedToAuthenticatedPage(serviceNode, ep, allNodes, allEdges)
    : false;

  const parsedResSchema = parseSchemaJson(ep.responseBody?.rawJson);
  let responseData: string;
  if (parsedResSchema) {
    responseData = JSON.stringify(parsedResSchema, null, 6).replace(
      /\n/g,
      "\n    ",
    );
  } else if (Array.isArray(ep.responseBody?.fields) && ep.responseBody.fields.length > 0) {
    const obj: Record<string, string | number | boolean | string[] | Record<string, string | number | boolean | null>> = {};
    for (const f of ep.responseBody.fields) {
      if (!f.name) continue;
      if (f.type === "number") obj[f.name] = 0;
      else if (f.type === "boolean") obj[f.name] = true;
      else if (f.type === "array") obj[f.name] = [];
      else if (f.type === "object") obj[f.name] = {};
      else obj[f.name] = "success";
    }
    responseData = JSON.stringify(obj, null, 6).replace(/\n/g, "\n    ");
  } else {
    responseData = `{\n      message: "Successfully executed ${ep.type || "GET"} ${path}"\n    }`;
  }

  const queryTypeRes = parametersToTsInterface(
    `${pascalName}Query`,
    ep.queryParams,
    false,
  );
  const bodyTypeRes = schemaToTsInterface(
    `${pascalName}Body`,
    ep.requestBody,
  );
  const isBodyMethod = ["post", "put", "patch"].includes(method);

  // Resolve targeted connection trace for this endpoint
  const trace = serviceNode
    ? resolveEndpointTrace(
        serviceNode,
        ep,
        allNodes,
        allEdges,
        allEndpoints,
      )
    : { incoming: [], outgoing: [] };

  const pipelineSteps = ep.pipelineSteps;
  const hasPipelineSteps = Array.isArray(pipelineSteps) && pipelineSteps.length > 0;

  // --- Resolve reusable function imports ---
  // In pipeline mode, database operations and imports are driven strictly by the configured pipeline steps.
  // Do NOT auto-infer legacy CRUD database operations when explicit pipeline steps exist.
  const pickedDbOps = hasPipelineSteps
    ? []
    : pickDbFunctionsForEndpoint(
        ep,
        dbFunctions,
        allNodes,
        path,
        allEdges,
        redisFunctions,
      );
  const hasPublishedEvents =
    nodePublishedEvents.length > 0 || Boolean(ep.publishedEvents && ep.publishedEvents.length > 0);
  const hasBrokerTrace = trace.outgoing.some((out) => out.nodeType === "Message Broker");
  const pickedKafka =
    (hasPublishedEvents || hasBrokerTrace) && kafkaFunctions.length > 0
      ? pickKafkaPublishFunction(kafkaFunctions)
      : null;

  const codeBlockText = (ep.body || ep.code || "").trim();
  const pipelineStepsEarly = ep.pipelineSteps;
  const hasStreamingStep = Array.isArray(pipelineStepsEarly) && pipelineStepsEarly.some(
    (s) => s.type === "langgraph_invoke" && s.langGraphStreamingEnabled && (!s.langGraphStreamingProtocol || s.langGraphStreamingProtocol === "sse" || s.langGraphStreamingProtocol === "raw") && s.enabled !== false,
  );

  // 1. Auth Resolution
  const { requiresAuth: baseRequiresAuth, authOptions } = resolveEndpointAuth(ep, trace);
  const requiresAuth = baseRequiresAuth || isConnectedToAuthPage;
  if (isHealth && requiresAuth && !parsedResSchema && (!ep.responseBody?.fields || ep.responseBody.fields.length === 0)) {
    responseData = `{\n      message: "Successfully executed ${ep.type || "GET"} ${path}",\n      status: "ok",\n      service: "${serviceName}",\n      timestamp: new Date().toISOString(),\n      user: req.user\n    }`;
  }

  // 2. Preamble (imports, request/response context types, function header)
  const { preambleCode } = emitHandlerPreamble({
    serviceName,
    routeFileName,
    handlerName,
    pascalName,
    schemaVarPrefix,
    method,
    path,
    summary,
    pickedDbOps,
    dbFunctions,
    redisFunctions,
    kafkaFunctions,
    pickedKafka,
    codeBlockText,
    hasStreamingStep,
    queryTypeResHasContent: queryTypeRes.hasContent,
    isBodyMethod,
    bodyTypeResHasContent: bodyTypeRes.hasContent,
    pipelineSteps: pipelineStepsEarly,
    requiresAuth,
  });

  let routeHandlerCode = preambleCode;

  // 3. Validation Checks
  const hasValidatedBody = bodyTypeRes.hasContent;
  routeHandlerCode += emitValidationBlocks({
    schemaVarPrefix,
    hasValidatedBody,
    hasQueryParams: queryTypeRes.hasContent,
    isBodyMethod,
  });

  // 4. AI Coding Agent Directive & Context
  routeHandlerCode += emitAiDirective({
    ep,
    trace,
    allNodes,
    pickedDbOps,
  });

  // 5. Business Logic Section
  routeHandlerCode += `    // --- Business Logic ---\n`;
  const payloadVar = (hasValidatedBody || isBodyMethod) ? "body" : "req.body";

  // -----------------------------------------------------------------------
  // PIPELINE MODE: explicit configured pipeline steps
  // -----------------------------------------------------------------------
  if (hasPipelineSteps && pipelineSteps) {
    const allReusableFunctions = [
      ...dbFunctions,
      ...(redisFunctions || []),
      ...(kafkaFunctions || []),
      ...(storageFunctions || []),
    ];
    const pipelineLines = renderPipeline(pipelineSteps, payloadVar, {
      reusableFunctions: allReusableFunctions,
      allNodes,
    });
    if (pipelineLines.some((line) => /\bauth\b/.test(line))) {
      routeHandlerCode += `    const auth = req.user!;\n`;
    }
    pipelineLines.forEach((line) => {
      routeHandlerCode += `    ${line}\n`;
    });

    // If connected to storage on canvas but no storage_operation pipeline step was manually configured,
    // emit the concrete presign-URL upload flow automatically.
    const hasStorageStep = pipelineSteps.some(
      (s) => s.type === "storage_operation" && s.enabled !== false,
    );
    let autoEmittedStorage = false;
    if (!hasStorageStep && traceHasStorage(trace)) {
      const storageCode = emitStorageOperations({
        trace,
        ep,
        payloadVar,
        storageFunctions,
      });
      if (storageCode) {
        routeHandlerCode += storageCode;
        autoEmittedStorage = true;
      }
    }

    const hasReturnStep = pipelineSteps.some(
      (s) => s.type === "return_response" && s.enabled !== false,
    );
    const hasStreaming = pipelineSteps.some(
      (s) => s.type === "langgraph_invoke" && s.langGraphStreamingEnabled && (!s.langGraphStreamingProtocol || s.langGraphStreamingProtocol === "sse" || s.langGraphStreamingProtocol === "raw") && s.enabled !== false,
    );

    if (!hasReturnStep && !hasStreaming && !autoEmittedStorage) {
      const lastStep = [...pipelineSteps].reverse().find((s) => s.enabled !== false);
      const lastOutputVar = lastStep?.outputVariable || payloadVar;
      const statusCode = ep.type === "POST" ? 201 : 200;

      const responseDataExpr =
        lastStep?.type === "storage_operation" && lastStep.functionRef?.name === "getUploadPresignedUrl"
          ? `{ signedUrl: ${lastOutputVar} }`
          : lastOutputVar;

      routeHandlerCode += `\n    logger.debug("Successfully generated response for ${path}");\n`;
      routeHandlerCode += `    return res.status(${statusCode}).json({ data: ${responseDataExpr} });\n`;
    }

    routeHandlerCode += `  } catch (err) {\n`;
    routeHandlerCode += `    const message = err instanceof Error ? err.message : String(err);\n`;
    if (hasStreaming) {
      routeHandlerCode += `    if (abort.signal.aborted) {\n`;
      routeHandlerCode += `      logger.info("Client disconnected; stream aborted");\n`;
      routeHandlerCode += `      return;\n`;
      routeHandlerCode += `    }\n`;
    }
    routeHandlerCode += `    logger.error("Error in ${method.toUpperCase()} ${path}:", message);\n`;
    if (hasStreaming) {
      const isRawStream = pipelineSteps.some(
        (s) => s.type === "langgraph_invoke" && s.langGraphStreamingProtocol === "raw",
      );
      routeHandlerCode += `    if (res.writableEnded) {\n`;
      routeHandlerCode += `      return;\n`;
      routeHandlerCode += `    }\n`;
      routeHandlerCode += `    if (res.headersSent) {\n`;
      if (isRawStream) {
        routeHandlerCode += `      res.write(\`\\n[ERROR: \${message}]\\n\`);\n`;
      } else {
        routeHandlerCode += `      res.write(\`data: \${JSON.stringify({ error: message })}\\n\\n\`);\n`;
        routeHandlerCode += `      res.write("data: [DONE]\\n\\n");\n`;
      }
      routeHandlerCode += `      res.end();\n`;
      routeHandlerCode += `    } else {\n`;
      routeHandlerCode += `      return res.status(500).json({ error: "Internal Server Error", details: message });\n`;
      routeHandlerCode += `    }\n`;
      routeHandlerCode += `  } finally {\n`;
      routeHandlerCode += `    res.off?.("close", onClose);\n`;
      routeHandlerCode += `  }\n}\n`;
    } else {
      routeHandlerCode += `    return res.status(500).json({ error: "Internal Server Error", details: message });\n`;
      routeHandlerCode += `  }\n}\n`;
    }

    return {
      file: {
        filename: `src/routes/${routeFileName}.ts`,
        language: "typescript",
        content: cleanUnusedImports(routeHandlerCode),
      },
      routeImport: `import { ${handlerName} } from "./${routeFileName}";`,
      routeRegistration: `router.${method}("${path}", ${handlerName});`,
      requiresAuth,
      authOptions,
    };
  }

  // -----------------------------------------------------------------------
  // LEGACY AUTO-INFERENCE MODE (backward compat when no pipeline steps set)
  // -----------------------------------------------------------------------
  const targetVarMap = new Map<string, string>();

  // DB & Redis operations
  const { code: dbRedisCode } = emitLegacyDbRedisOperations({
    method,
    path,
    ep,
    payloadVar,
    pickedDbOps,
    codeBlock: codeBlockText,
    targetVarMap,
  });
  routeHandlerCode += dbRedisCode;

  // Kafka publish
  routeHandlerCode += emitKafkaPublish({
    pickedKafka,
    codeBlock: codeBlockText,
    ep,
    nodePublishedEvents,
    rawName,
    allNodes,
    method,
    path,
    payloadVar,
  });

  // Inter-service calls
  routeHandlerCode += emitInterServiceCalls({
    trace,
    codeBlock: codeBlockText,
    allNodes,
    allEndpoints,
    ep,
    payloadVar,
  });

  // Storage operations (presign-URL flow) — emitted when a StorageRef node is connected
  const storageCode = emitStorageOperations({
    trace,
    ep,
    payloadVar,
    storageFunctions,
  });
  const hasStorageResponse = storageCode.length > 0;
  if (hasStorageResponse) {
    routeHandlerCode += storageCode;
  }

  // Custom manual code block
  if (codeBlockText) {
    codeBlockText.split("\n").forEach((line: string) => {
      routeHandlerCode += `    ${line}\n`;
    });
  }

  // Check if custom code already handles sending a response
  const hasCustomResponse =
    Boolean(codeBlockText) &&
    (codeBlockText.includes("res.json(") ||
      codeBlockText.includes("res.send(") ||
      codeBlockText.includes("return res.") ||
      codeBlockText.includes("res.end("));

  if (!hasCustomResponse && !hasStorageResponse) {
    const statusCode = ep.type === "POST" ? 201 : 200;
    const responsePayload = buildResponsePayloadCode(
      ep,
      statusCode,
      path,
      pickedDbOps,
      targetVarMap,
      responseData,
    );

    routeHandlerCode += `\n\n    logger.debug("Successfully generated response for ${path}");\n`;
    routeHandlerCode += `    return res.status(${statusCode}).json(${responsePayload});\n`;
  }

  routeHandlerCode += `  } catch (err) {\n`;
  routeHandlerCode += `    const message = err instanceof Error ? err.message : String(err);\n`;
  routeHandlerCode += `    logger.error("Error in ${method.toUpperCase()} ${path}:", message);\n`;
  routeHandlerCode += `    return res.status(500).json({ error: "Internal Server Error", details: message });\n`;
  routeHandlerCode += `  }\n}\n`;

  return {
    file: {
      filename: `src/routes/${routeFileName}.ts`,
      language: "typescript",
      content: cleanUnusedImports(routeHandlerCode),
    },
    routeImport: `import { ${handlerName} } from "./${routeFileName}";`,
    routeRegistration: `router.${method}("${path}", ${handlerName});`,
    requiresAuth,
    authOptions,
  };
}
