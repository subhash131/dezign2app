import { Endpoint, AnyMessagingResource, CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { parseSchemaJson, toVarName, toPascalCase, toEnvVarName, deriveRouteFileName } from "../../utils";

function toTsType(colType: string): string {
  const t = (colType || "string").toLowerCase();
  if (["int", "integer", "bigint", "number"].includes(t)) return "number";
  if (["boolean", "bool"].includes(t)) return "boolean";
  return "string";
}
import {
  INTER_SERVICE_PROTOCOL_GRPC,
  GRPC_DEFAULT_PORT,
} from "@workspace/canvas";
import {
  parametersToTsInterface,
  schemaToTsInterface,
} from "../schemaToTypeScript";
import { resolveEndpointTrace } from "../../traceResolver";
import { pickDbFunctionsForEndpoint } from "./dbResolver";
import { pickKafkaPublishFunction, toKafkaTopicKey } from "./kafkaResolver";
import { buildResponsePayloadCode } from "./responseBuilder";
import { renderPipeline, collectPipelineImports } from "./pipelineRenderer";
import { classifyEndpointShape } from "./endpointTypeClassifier";

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

export function generateEndpointRouteHandler(
  params: GenerateEndpointHandlerParams,
): GenerateEndpointHandlerResult {
  const {
    ep,
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
    nodePublishedEvents,
    usedFileNames,
  } = params;

  const method = (ep.type || "GET").toLowerCase();
  let routeFileName = deriveRouteFileName(ep, index, serviceName);

  if (usedFileNames.has(routeFileName)) {
    routeFileName = `${routeFileName}_${index + 1}`;
  }
  usedFileNames.add(routeFileName);

  // rawName = the actual endpoint path, used for event-name fuzzy matching below.
  // It is intentionally separate from routeFileName (which is the human-readable derived name).
  const rawName = ep.name?.trim() ? ep.name.trim() : `endpoint_${index + 1}`;

  const handlerName = `${routeFileName}Handler`;
  const pascalName = `${pascalServiceName}${toPascalCase(routeFileName)}`;
  const schemaVarPrefix = `${serviceFolderName}${toPascalCase(routeFileName)}`;
  const rawPath = ep.name?.startsWith("/") ? ep.name : `/${ep.name || ""}`;
  const path = rawPath.replace(/\s+/g, "-");
  const summary = ep.summary || `Handler for ${ep.type || "GET"} ${path}`;

  const endpointShape = classifyEndpointShape(ep, allNodes);
  const parsedResSchema = parseSchemaJson(ep.responseBody?.rawJson);
  let responseData: string;
  if (parsedResSchema) {
    responseData = JSON.stringify(parsedResSchema, null, 6).replace(
      /\n/g,
      "\n    ",
    );
  } else if (Array.isArray(ep.responseBody?.fields) && ep.responseBody.fields.length > 0) {
    const obj: Record<string, unknown> = {};
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

  // --- Resolve reusable function imports ---
  const pickedDbOps = pickDbFunctionsForEndpoint(
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

  // Build the extra import lines (de-duped by importPath)
  const extraImports: Map<string, Set<string>> = new Map();
  pickedDbOps.forEach((op) => {
    let importSet = extraImports.get(op.fn.importPath);
    if (!importSet) {
      importSet = new Set();
      extraImports.set(op.fn.importPath, importSet);
    }
    importSet.add(op.fn.name);
  });

  // Scan user's manual codeBlock for DB and Redis function references
  const codeBlockText = (ep.body || ep.code || "").trim();
  [...dbFunctions, ...redisFunctions].forEach((f) => {
    if (codeBlockText.includes(f.name)) {
      let importSet = extraImports.get(f.importPath);
      if (!importSet) {
        importSet = new Set();
        extraImports.set(f.importPath, importSet);
      }
      importSet.add(f.name);
    }
  });

  // Scan for Kafka publisher references or configured published events
  if (
    pickedKafka ||
    codeBlockText.includes("publishKafkaEvent") ||
    codeBlockText.includes("KAFKA_TOPICS")
  ) {
    const publishFn =
      pickedKafka ||
      kafkaFunctions.find((f) => f.name === "publishKafkaEvent");
    if (publishFn) {
      if (!extraImports.has(publishFn.importPath)) {
        extraImports.set(publishFn.importPath, new Set());
      }
      extraImports.get(publishFn.importPath)!.add("publishKafkaEvent");
    }
    const topicsConst = kafkaFunctions.find((f) => f.name === "KAFKA_TOPICS");
    if (topicsConst) {
      const importPath = topicsConst.importPath;
      if (!extraImports.has(importPath)) {
        extraImports.set(importPath, new Set());
      }
      extraImports.get(importPath)!.add("KAFKA_TOPICS");
    }
  }

  const extraImportLines = Array.from(extraImports.entries())
    .map(([pkg, names]) => `import { ${Array.from(names).join(", ")} } from "${pkg}";`)
    .join("\n");

  // Pre-collect pipeline step imports so they land in the file's import block
  // (pipeline steps are processed later, but imports must be at the top)
  const pipelineStepsEarly = ep.pipelineSteps;
  if (Array.isArray(pipelineStepsEarly) && pipelineStepsEarly.length > 0) {
    const pipelineImports = collectPipelineImports(pipelineStepsEarly);
    pipelineImports.forEach((names, importPath) => {
      if (!extraImports.has(importPath)) {
        extraImports.set(importPath, new Set());
      }
      names.forEach((n) => extraImports.get(importPath)!.add(n));
    });
  }

  const allExtraImportLines = Array.from(extraImports.entries())
    .map(([pkg, names]) => `import { ${Array.from(names).join(", ")} } from "${pkg}";`)
    .join("\n");

  // Build imports from @workspace/types
  const typeImportsList = [
    `${pascalName}Params`,
    `${pascalName}Query`,
    `${pascalName}Body`,
    `${pascalName}Response`,
  ];
  if (queryTypeRes.hasContent) {
    typeImportsList.push(`${schemaVarPrefix}QuerySchema`);
  }
  if (isBodyMethod && bodyTypeRes.hasContent) {
    typeImportsList.push(`${schemaVarPrefix}BodySchema`);
  }

  let routeHandlerCode = `import { Request, Response } from "express";
import { createLogger } from "@workspace/logger";
import {
  ${typeImportsList.join(",\n  ")}
} from "@workspace/types";
${allExtraImportLines ? `${allExtraImportLines}\n` : ""}\nconst logger = createLogger("${serviceName}:${routeFileName}");

type ${pascalName}ErrorResponse = {
  error: string;
  details?: string | { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> } | Record<string, string | number | boolean | null>;
};

export type ${pascalName}Request =
  | Request<${pascalName}Params, ${pascalName}Response | ${pascalName}ErrorResponse, ${pascalName}Body, ${pascalName}Query>
  | {
      headers?: Record<string, string | string[] | undefined>;
      params: ${pascalName}Params;
      query: ${pascalName}Query;
      body: ${pascalName}Body;
    };

export type ${pascalName}ResponseContext =
  | Response<${pascalName}Response | ${pascalName}ErrorResponse | Record<string, unknown>>
  | {
      status: (code: number) => {
        json: (data: ${pascalName}Response | ${pascalName}ErrorResponse | Record<string, unknown> | { error: string; details?: string }) => void | Response;
      };
      json: (data: ${pascalName}Response | ${pascalName}ErrorResponse | Record<string, unknown> | { error: string; details?: string }) => void | Response;
    };

/**
 * ${ep.type || "GET"} ${path}
 * ${summary}
 */
export async function ${handlerName}(
  req: ${pascalName}Request,
  res: ${pascalName}ResponseContext
) {
  try {
    logger.info("Handling ${ep.type || "GET"} ${path}");
    logger.debug("Request details", { params: req.params, query: req.query, body: req.body });

`;

  // Compute per-endpoint auth requirements — surfaced on the return value so the
  // router builder can inject requireAuth() at the registration site, not inline.
  const isCallerProtected = trace.incoming.some((inc) => inc.isProtected);
  const requiresAuth =
    ep.requireAuth !== false &&
    (isCallerProtected ||
      Boolean(ep.authRuleId) ||
      Boolean(ep.requiredRoles && ep.requiredRoles.length > 0) ||
      Boolean(ep.requiredScopes && ep.requiredScopes.length > 0));

  // Build the JSON-safe options object for requireAuth().
  // JSON.stringify ensures user-supplied role strings are safely escaped —
  // never interpolated as raw code regardless of what the canvas config contains.
  const authOptionsObj: { roles?: string[] } = {};
  if (ep.requiredRoles && ep.requiredRoles.length > 0) {
    authOptionsObj.roles = ep.requiredRoles;
  }
  const authOptions = JSON.stringify(authOptionsObj);


  // 1. Validation Checks
  const hasValidatedBody = isBodyMethod && bodyTypeRes.hasContent;
  if (hasValidatedBody) {
    routeHandlerCode += `    // Validate Body Payload\n`;
    routeHandlerCode += `    const bodyParsed = ${schemaVarPrefix}BodySchema.safeParse(req.body);\n`;
    routeHandlerCode += `    if (!bodyParsed.success) {\n`;
    routeHandlerCode += `      logger.warn("Request body validation failed", bodyParsed.error.flatten());\n`;
    routeHandlerCode += `      return res.status(400).json({ error: "Invalid request body", details: bodyParsed.error.flatten() });\n`;
    routeHandlerCode += `    }\n`;
    routeHandlerCode += `    const body = bodyParsed.data;\n\n`;
  }

  if (queryTypeRes.hasContent) {
    routeHandlerCode += `    // Validate Query Parameters\n`;
    routeHandlerCode += `    const queryParsed = ${schemaVarPrefix}QuerySchema.safeParse(req.query);\n`;
    routeHandlerCode += `    if (!queryParsed.success) {\n`;
    routeHandlerCode += `      logger.warn("Query parameters validation failed", queryParsed.error.flatten());\n`;
    routeHandlerCode += `      return res.status(400).json({ error: "Invalid query parameters", details: queryParsed.error.flatten() });\n`;
    routeHandlerCode += `    }\n`;
    routeHandlerCode += `    const query = queryParsed.data;\n\n`;
  }

  // 2. AI Coding Agent Directive & Context (placed before operations)
  const promptText = (ep.businessLogic || ep.prompt || "").trim();
  const codeBlock = (ep.body || ep.code || "").trim();

  if (promptText || trace.incoming.length > 0 || trace.outgoing.length > 0) {
    routeHandlerCode += `    // =========================================================================\n`;
    routeHandlerCode += `    // AI CODING AGENT DIRECTIVE:\n`;
    if (ep.summary && !ep.summary.startsWith("Handler for ")) {
      routeHandlerCode += `    // Goal: ${ep.summary.trim()}\n`;
    }

    if (trace.incoming.length > 0) {
      routeHandlerCode += `    //\n    // INBOUND TRIGGER / CALLER:\n`;
      trace.incoming.forEach((inc) => {
        routeHandlerCode += `    // - ${inc.nodeType}: "${inc.nodeName}" (${inc.detail})\n`;
        if (inc.dataContext)
          routeHandlerCode += `    //   Data Context: ${inc.dataContext.replace(/\n/g, "\n    //     ")}\n`;
      });
    }

    const reqBodyFields = ep.requestBody?.fields;
    if (Array.isArray(reqBodyFields) && reqBodyFields.length > 0) {
      const fieldStr = reqBodyFields
        .filter((f) => f && f.name)
        .map((f) => `${f.name}${f.required === false ? "?" : ""}: ${f.type || "string"}`)
        .join(", ");
      if (fieldStr) {
        routeHandlerCode += `    //\n    // CONFIGURED REQUEST BODY SCHEMA:\n`;
        routeHandlerCode += `    // - Body: { ${fieldStr} }\n`;
      }
    }

    if (trace.outgoing.length > 0) {
      routeHandlerCode += `    //\n    // RESOURCE DEPENDENCIES:\n`;
      trace.outgoing.forEach((out) => {
        routeHandlerCode += `    // - ${out.nodeType}: "${out.nodeName}"\n`;
        if (out.dataContext)
          routeHandlerCode += `    //   ${out.dataContext.replace(/\n/g, "\n    //     ")}\n`;
      });
    }

    if (ep.crudOperations && Object.keys(ep.crudOperations).length > 0) {
      const activeOps = Object.entries(ep.crudOperations).filter(
        ([_, ops]) => ops && ops.length > 0,
      );
      if (activeOps.length > 0) {
        routeHandlerCode += `    //\n    // DATABASE OPERATIONS REQUIRED:\n`;
        for (const [tableId, ops] of activeOps) {
          const tableNode = allNodes.find((n) => n.id === tableId);
          const tableName =
            tableNode?.data?.label ||
            tableNode?.data?.tableRef ||
            "Unknown Table";
          routeHandlerCode += `    // - Table [${tableName}]: ${ops.map((o) => o.toUpperCase()).join(", ")}\n`;
          if (ep.crudExplanations && ep.crudExplanations[tableId]) {
            for (const op of ops) {
              const explanation = ep.crudExplanations[tableId][op];
              if (explanation) {
                routeHandlerCode += `    //   * ${op.toUpperCase()} Context: ${explanation.replace(/\n/g, "\n    //     ")}\n`;
              }
            }
          }
        }
      }
    }

    const traceTargetDbNodeIds = trace.outgoing
      .filter((out) => out.nodeType === "Database Table" || out.nodeType === "Redis Cache")
      .map((out) => out.nodeId);

    // Embed detailed database entity type definitions and schemas for AI coding agents
    const targetDbNodeIds = new Set<string>([
      ...(ep.databaseNodeIds || []),
      ...(ep.databaseNodeId && ep.databaseNodeId !== "none" ? [ep.databaseNodeId] : []),
      ...(ep.crudOperations ? Object.keys(ep.crudOperations) : []),
      ...traceTargetDbNodeIds,
      ...pickedDbOps
        .map((op) => op.tableNodeId)
        .filter((id): id is string => Boolean(id)),
    ]);

    if (targetDbNodeIds.size > 0) {
      routeHandlerCode += `    //\n    // DATABASE & CACHE SCHEMAS & FULL TYPE DEFINITIONS:\n`;
      targetDbNodeIds.forEach((tableId) => {
        const tableNode = allNodes.find((n) => n.id === tableId);
        if (!tableNode) return;
        const entityNode =
          tableNode.type === "db_ref" && tableNode.data?.tableRef
            ? allNodes.find((n) => n.id === tableNode.data?.tableRef)
            : tableNode.type === "redis-cache" && tableNode.data?.schemaRef
              ? allNodes.find((n) => n.id === tableNode.data?.schemaRef)
              : tableNode;
        if (!entityNode) return;

        const tableName = entityNode.data?.label || "Table";
        const cleanTableName = toVarName(tableName.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        const Pascal = toPascalCase(cleanTableName);

        const isRedis =
          entityNode.type === "redis_schema" ||
          entityNode.type === "redis-cache" ||
          entityNode.data?.dbType === "redis";

        const cols = entityNode.data?.columns && Array.isArray(entityNode.data.columns)
          ? entityNode.data.columns
          : [];

        if (cols.length > 0) {
          const allColFields = cols.map((c: { name?: string; type?: string }) => `${c.name || "col"}: ${toTsType(c.type || "string")}`).join("; ");
          const writableColFields = cols.filter((c: { isPrimaryKey?: boolean }) => !c.isPrimaryKey).map((c: { name?: string; type?: string }) => `${c.name || "col"}: ${toTsType(c.type || "string")}`).join("; ");

          if (isRedis) {
            routeHandlerCode += `    // - Redis Cache Schema: "${tableName}" (@workspace/redis)\n`;
            routeHandlerCode += `    //   interface ${Pascal} { ${allColFields} }\n`;
          } else {
            routeHandlerCode += `    // - Table: "${tableName}" (@workspace/db)\n`;
            routeHandlerCode += `    //   type ${Pascal}Row = { ${allColFields} };\n`;
            routeHandlerCode += `    //   type Create${Pascal}Data = { ${writableColFields} };\n`;
            routeHandlerCode += `    //   type Update${Pascal}Data = Partial<Create${Pascal}Data>;\n`;
          }
        }

        const tablePickedFns = pickedDbOps.filter((op) => op.tableNodeId === tableId || (op.fn.targetName || "").toLowerCase() === tableName.toLowerCase());
        if (tablePickedFns.length > 0) {
          routeHandlerCode += `    //   Available Helper Functions:\n`;
          tablePickedFns.forEach((op) => {
            routeHandlerCode += `    //     * ${op.fn.signature || op.fn.name}\n`;
          });
        }
      });
    }

    routeHandlerCode += `    // =========================================================================\n`;

    if (promptText) {
      promptText.split("\n").forEach((line: string, idx: number) => {
        if (line.trim())
          routeHandlerCode += `    // STEP ${idx + 1}: ${line.trim()}\n`;
      });
      routeHandlerCode += `\n`;
    }
  }

  // Business Logic
  routeHandlerCode += `    // --- Business Logic ---\n`;

  // Payload reference for DB and Messaging operations
  const payloadVar = hasValidatedBody ? "body" : "req.body";

  // -----------------------------------------------------------------------
  // PIPELINE MODE: if the endpoint has configured pipeline steps, render
  // them with explicit per-argument bindings. No auto-inference is done.
  // -----------------------------------------------------------------------
  const pipelineSteps = ep.pipelineSteps;
  const hasPipelineSteps = Array.isArray(pipelineSteps) && pipelineSteps.length > 0;

  if (hasPipelineSteps) {
    // Collect imports needed by the pipeline steps and add to extraImports
    const pipelineImports = collectPipelineImports(pipelineSteps);
    pipelineImports.forEach((names, importPath) => {
      if (!extraImports.has(importPath)) {
        extraImports.set(importPath, new Set());
      }
      names.forEach((n) => extraImports.get(importPath)!.add(n));
    });

    // Render all pipeline steps into code lines (4-space indent for handler body)
    const pipelineLines = renderPipeline(pipelineSteps, payloadVar);
    pipelineLines.forEach((line) => {
      routeHandlerCode += `    ${line}\n`;
    });

    // Check if the pipeline includes an explicit return_response step
    const hasReturnStep = pipelineSteps.some(
      (s) => s.type === "return_response" && s.enabled !== false,
    );

    if (!hasReturnStep) {
      // Determine the response payload: use the last step's outputVariable
      const lastStep = [...pipelineSteps].reverse().find((s) => s.enabled !== false);
      const lastOutputVar = lastStep?.outputVariable || payloadVar;
      const statusCode = ep.type === "POST" ? 201 : 200;

      routeHandlerCode += `\n    logger.debug("Successfully generated response for ${path}");\n`;
      routeHandlerCode += `    return res.status(${statusCode}).json({ data: ${lastOutputVar} });\n`;
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
        content: routeHandlerCode,
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
  const hasDbInCodeBlock = Boolean(
    codeBlock &&
      (codeBlock.includes("findAll") ||
        codeBlock.includes("find") ||
        codeBlock.includes("create") ||
        codeBlock.includes("update") ||
        codeBlock.includes("delete") ||
        codeBlock.includes("db.")),
  );

  const isRedisOp = (op: { fn: { importPath: string; name: string } }) =>
    op.fn.importPath.includes("redis") || op.fn.name.toLowerCase().includes("cache");
  const sqlOps = pickedDbOps.filter((op) => !isRedisOp(op));
  const redisOps = pickedDbOps.filter((op) => isRedisOp(op));

  // 1. Redis Cache Lookup (Cache-Aside for GET requests)
  if (method === "get" && redisOps.length > 0 && !hasDbInCodeBlock) {
    const readRedisOps = redisOps.filter((op) => op.operationKind === "read");
    if (readRedisOps.length > 0) {
      routeHandlerCode += `    // --- Redis Cache Lookup (Cache-Aside) ---\n`;
      readRedisOps.forEach((op) => {
        const callExpr = op.callExpr.replaceAll("PAYLOAD_VAR", payloadVar);
        const rawTableName = op.fn.targetName || "Cache";
        const cleanTableName = toVarName(rawTableName.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        const Pascal = toPascalCase(cleanTableName);
        const cachedVar = `cached${Pascal || "Data"}`;
        if (op.tableNodeId) {
          targetVarMap.set(op.tableNodeId, cachedVar);
        }
        routeHandlerCode += `    const ${cachedVar} = ${callExpr};\n`;
        routeHandlerCode += `    if (${cachedVar} !== undefined && ${cachedVar} !== null) {\n`;
        routeHandlerCode += `      logger.debug("Returning cached ${rawTableName} data");\n`;
        routeHandlerCode += `      return res.status(200).json({ message: "Successfully executed ${ep.type || "GET"} ${path}", data: ${cachedVar} });\n`;
        routeHandlerCode += `    }\n\n`;
      });
    }
  }

  // 2. SQL DB Calls
  if (sqlOps.length > 0 && !hasDbInCodeBlock) {
    routeHandlerCode += `    // --- Database Operation(s) (via @workspace/db prepared statement) ---\n`;
    sqlOps.forEach((op) => {
      const callExpr = op.callExpr.replaceAll("PAYLOAD_VAR", payloadVar);
      const rawTableName = op.fn.targetName || "record";
      const cleanTableName = toVarName(rawTableName.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
      const Pascal = toPascalCase(cleanTableName);

      let varName = `${op.fn.name}Result`;
      if (op.operationKind === "create") {
        varName = `created${Pascal || "Record"}`;
      } else if (op.operationKind === "update") {
        varName = `updated${Pascal || "Record"}`;
      } else if (op.operationKind === "read") {
        varName = (path.includes(":id") || path.includes("{id}")) ? cleanTableName : `${cleanTableName}List`;
      } else if (op.operationKind === "delete") {
        varName = `deleted${Pascal || "Record"}Result`;
      }

      if (op.tableNodeId) {
        targetVarMap.set(op.tableNodeId, varName);
      }

      if (op.operationKind === "read" && (path.includes(":id") || path.includes("{id}"))) {
        routeHandlerCode += `    const ${varName} = ${callExpr};\n`;
        routeHandlerCode += `    if (${varName} === undefined || ${varName} === null) {\n`;
        routeHandlerCode += `      return res.status(404).json({ error: "Not found" });\n`;
        routeHandlerCode += `    }\n\n`;
      } else {
        routeHandlerCode += `    const ${varName} = ${callExpr};\n\n`;
      }
    });
  }

  // 3. Redis Cache Mutations / Writes (POST / PUT / PATCH)
  if (["post", "put", "patch"].includes(method) && redisOps.length > 0 && !hasDbInCodeBlock) {
    const writeRedisOps = redisOps.filter((op) => op.operationKind === "create" || op.operationKind === "update");
    if (writeRedisOps.length > 0) {
      routeHandlerCode += `    // --- Update Redis Cache ---\n`;
      writeRedisOps.forEach((op) => {
        let callExpr = op.callExpr.replaceAll("PAYLOAD_VAR", payloadVar);
        if (sqlOps.length > 0) {
          const primarySql = sqlOps[0];
          const rawSqlName = primarySql?.fn.targetName || "record";
          const cleanSqlName = toVarName(rawSqlName.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
          const sqlPascal = toPascalCase(cleanSqlName);
          const sqlVarName = primarySql?.operationKind === "create" ? `created${sqlPascal || "Record"}` : cleanSqlName;
          callExpr = callExpr.replaceAll(`((${payloadVar} as { id?: string })?.id || "default")`, `(${sqlVarName}?.id || (${payloadVar} as { id?: string })?.id || "default")`);
          callExpr = callExpr.replaceAll(`${payloadVar}?.id`, `(${sqlVarName}?.id || (${payloadVar} as { id?: string })?.id || "default")`);
        }
        const varName = `${toVarName(op.fn.name)}Result`;
        routeHandlerCode += `    const ${varName} = ${callExpr};\n\n`;
        if (op.tableNodeId && sqlOps.length === 0) {
          targetVarMap.set(op.tableNodeId, payloadVar);
        }
      });
    }
  }

  // 4. Redis Cache Invalidation (DELETE)
  if (method === "delete" && redisOps.length > 0 && !hasDbInCodeBlock) {
    const deleteRedisOps = redisOps.filter((op) => op.operationKind === "delete");
    if (deleteRedisOps.length > 0) {
      routeHandlerCode += `    // --- Invalidate Redis Cache ---\n`;
      deleteRedisOps.forEach((op) => {
        let callExpr = op.callExpr.replaceAll("PAYLOAD_VAR", payloadVar);
        const varName = `${toVarName(op.fn.name)}Result`;
        routeHandlerCode += `    const ${varName} = ${callExpr};\n\n`;
      });
    }
  }

  // 5. Populate Redis Cache on GET cache miss
  if (method === "get" && sqlOps.length > 0 && redisOps.length > 0 && !hasDbInCodeBlock) {
    const setOp = redisOps.find((op) => op.fn.name.toLowerCase().startsWith("set"));
    if (setOp) {
      const primarySql = sqlOps[0];
      const rawSqlName = primarySql?.fn.targetName || "record";
      const cleanSqlName = toVarName(rawSqlName.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
      const sqlVarName = (path.includes(":id") || path.includes("{id}")) ? cleanSqlName : `${cleanSqlName}List`;
      const keyArg = path.includes(":id") || path.includes("{id}") ? "req.params.id" : `"${cleanSqlName}_list"`;
      routeHandlerCode += `    // --- Populate Redis Cache ---\n`;
      routeHandlerCode += `    await ${setOp.fn.name}(${keyArg}, ${sqlVarName});\n\n`;
    }
  }

  // 4. Kafka Publish Call
  const hasKafkaInCodeBlock = Boolean(
    codeBlock && codeBlock.includes("publishKafkaEvent"),
  );

  if (pickedKafka && !hasKafkaInCodeBlock) {
    const allPublished = [
      ...(ep.publishedEvents || []),
      ...nodePublishedEvents,
    ];

    const matchedEvent =
      allPublished.find((e) =>
        rawName.toLowerCase().includes((e.name || "").toLowerCase()) ||
        (e.name || "").toLowerCase().includes(rawName.toLowerCase()),
      ) ?? allPublished[0];

    let resolvedTopicName: string | undefined;

    if (matchedEvent) {
      const brokerId =
        "brokerNodeId" in matchedEvent && typeof matchedEvent.brokerNodeId === "string"
          ? matchedEvent.brokerNodeId
          : undefined;
      const resourceId =
        "messagingResourceId" in matchedEvent && typeof matchedEvent.messagingResourceId === "string"
          ? matchedEvent.messagingResourceId
          : undefined;

      if (brokerId && resourceId) {
        const brokerNode = allNodes.find((n) => n.id === brokerId);
        const topics = brokerNode?.data?.topics;
        const topicRes = Array.isArray(topics) ? topics.find((t) => t.id === resourceId) : undefined;
        if (topicRes?.name) {
          resolvedTopicName = topicRes.name;
        }
      }

      if (!resolvedTopicName && matchedEvent.name) {
        for (const node of allNodes) {
          const topics = node.data?.topics;
          const t = Array.isArray(topics) ? topics.find((top) => top.name === matchedEvent.name) : undefined;
          if (t?.name) {
            resolvedTopicName = t.name;
            break;
          }
        }
      }
    }

    if (!resolvedTopicName) {
      for (const node of allNodes) {
        if (node.type === "kafka") {
          const topics = node.data?.topics;
          const firstTopicName = Array.isArray(topics) ? topics[0]?.name : undefined;
          if (firstTopicName) {
            resolvedTopicName = firstTopicName;
            break;
          }
        }
      }
    }

    const topicName = resolvedTopicName || matchedEvent?.name || rawName;
    const topicKey = toKafkaTopicKey(topicName);
    const topicRef = `KAFKA_TOPICS.${topicKey}`;

    routeHandlerCode += `    // --- Kafka Event Publish ---\n`;
    routeHandlerCode += `    await publishKafkaEvent(\n`;
    routeHandlerCode += `      ${topicRef},\n`;
    routeHandlerCode += `      { action: "${method}", path: "${path}", payload: ${payloadVar} },\n`;
    routeHandlerCode += `    );\n\n`;
  }

  // 5. Inter-Service Call(s) — HTTP or gRPC based on ep.interServiceProtocol
  const outgoingServices = trace.outgoing.filter(
    (out) => out.nodeType === "Microservice",
  );
  const hasFetchInCodeBlock = Boolean(
    codeBlock && (codeBlock.includes("fetch(") || codeBlock.includes("axios")),
  );
  const hasGrpcInCodeBlock = Boolean(
    codeBlock && codeBlock.includes("GrpcClient"),
  );

  const sourceNode = allNodes.find((n) => n.id === ep.nodeId);
  const useGrpc =
    (sourceNode?.data?.interServiceProtocol ?? ep.interServiceProtocol) ===
    INTER_SERVICE_PROTOCOL_GRPC;


  if (outgoingServices.length > 0 && !(useGrpc ? hasGrpcInCodeBlock : hasFetchInCodeBlock)) {
    outgoingServices.forEach((outService) => {
      const targetNode = allNodes.find((n) => n.id === outService.nodeId);
      const tgtLabel = targetNode?.data?.label || outService.nodeName || "Service";
      const tgtPort = targetNode?.data?.port || "8080";
      const varPrefix = toVarName(tgtLabel);
      const tgtServiceName = toPascalCase(tgtLabel.replace(/[^a-zA-Z0-9]/g, "_"));

      const tgtEndpoints = allEndpoints.filter(
        (e) => e.nodeId === outService.nodeId,
      );
      const targetEp = tgtEndpoints[0];

      if (useGrpc) {
        const envVarName = `${toEnvVarName(tgtLabel)}_GRPC_URL`;
        const packageName = `@workspace/grpc-${tgtLabel.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}`;
        const rawRpcName = (targetEp?.name || "Execute")
          .replace(/^\//, "")
          .replace(/[^a-zA-Z0-9]/g, "_");
        const rpcName = toPascalCase(rawRpcName || "Execute");
        const endpointName = rawRpcName.toLowerCase() || "execute";
        const rpcMethod = rpcName.charAt(0).toLowerCase() + rpcName.slice(1);


        const tgtGrpcPort = targetNode?.data?.grpcPort || "50051";
        routeHandlerCode += `    // --- Inter-Service gRPC Call: ${tgtLabel} (${rpcName}) ---\n`;
        routeHandlerCode += `    const { create${rpcName}Client } = await import("${packageName}/${endpointName}");\n`;
        routeHandlerCode += `    type ${rpcName}Response = import("${packageName}/${endpointName}").${rpcName}Response;\n`;
        routeHandlerCode += `    const ${varPrefix}GrpcClient = create${rpcName}Client(\n`;
        routeHandlerCode += `      process.env.${envVarName} || "localhost:${tgtGrpcPort}",\n`;
        routeHandlerCode += `    );\n`;

        routeHandlerCode += `    let ${varPrefix}Data: ${rpcName}Response | null = null;\n`;
        routeHandlerCode += `    ${varPrefix}Data = await new Promise((resolve, reject) => {\n`;
        routeHandlerCode += `      ${varPrefix}GrpcClient.${rpcMethod}(${payloadVar}, (err, response) => {\n`;
        routeHandlerCode += `        if (err) {\n`;
        routeHandlerCode += `          logger.error("gRPC call to ${tgtLabel} failed", { err });\n`;
        routeHandlerCode += `          return reject(err);\n`;
        routeHandlerCode += `        }\n`;
        routeHandlerCode += `        logger.info("gRPC response from ${tgtLabel}", { data: response });\n`;
        routeHandlerCode += `        resolve(response);\n`;
        routeHandlerCode += `      });\n`;
        routeHandlerCode += `    });\n\n`;

      } else {
        // ── REST HTTP fetch call ──────────────────────────────────────────────
        const envVarName = `${toEnvVarName(tgtLabel)}_BASE_URL`;
        const targetMethod = (targetEp?.type || "GET").toUpperCase();
        const rawTargetName = targetEp?.name || "/";
        const targetPath = rawTargetName.startsWith("/") ? rawTargetName : `/${rawTargetName}`;
        const isTargetBodyMethod = ["POST", "PUT", "PATCH"].includes(targetMethod);

        routeHandlerCode += `    // --- Inter-Service HTTP Call: ${tgtLabel} ---\n`;
        routeHandlerCode += `    const ${varPrefix}BaseUrl = process.env.${envVarName} || "http://localhost:${tgtPort}";\n`;
        routeHandlerCode += `    const ${varPrefix}Response = await fetch(\`\${${varPrefix}BaseUrl}${targetPath}\`, {\n`;
        routeHandlerCode += `      method: "${targetMethod}",\n`;
        routeHandlerCode += `      headers: {\n`;
        routeHandlerCode += `        "Content-Type": "application/json",\n`;
        routeHandlerCode += `        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),\n`;
        routeHandlerCode += `      },\n`;
        if (isTargetBodyMethod) {
          routeHandlerCode += `      body: JSON.stringify(${payloadVar}),\n`;
        }
        routeHandlerCode += `    });\n\n`;
        routeHandlerCode += `    let ${varPrefix}Data: Record<string, string | number | boolean | null> | null = null;\n`;
        routeHandlerCode += `    if (!${varPrefix}Response.ok) {\n`;
        routeHandlerCode += `      logger.error("Inter-service request to ${tgtLabel} failed", { status: ${varPrefix}Response.status, statusText: ${varPrefix}Response.statusText });\n`;
        routeHandlerCode += `    } else {\n`;
        routeHandlerCode += `      ${varPrefix}Data = await ${varPrefix}Response.json();\n`;
        routeHandlerCode += `      logger.info("Successfully received response from ${tgtLabel}", { data: ${varPrefix}Data });\n`;
        routeHandlerCode += `    }\n\n`;
      }
    });
  }

  if (codeBlock) {

    codeBlock.split("\n").forEach((line: string) => {
      routeHandlerCode += `    ${line}\n`;
    });
  }

  // Check if custom code already handles sending a response
  const hasCustomResponse =
    Boolean(codeBlock) &&
    (codeBlock.includes("res.json(") ||
      codeBlock.includes("res.send(") ||
      codeBlock.includes("return res.") ||
      codeBlock.includes("res.end("));

  if (!hasCustomResponse) {
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
      content: routeHandlerCode,
    },
    routeImport: `import { ${handlerName} } from "./${routeFileName}";`,
    routeRegistration: `router.${method}("${path}", ${handlerName});`,
    requiresAuth,
    authOptions,
  };
}
