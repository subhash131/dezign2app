// ═══════════════════════════════════════════════════════════════
// MODULE: HandlerPreambleEmitter
// LAYER:  generators / routeGenerator / handlers
// EMITS:  Imports, error response types, request & response context types, handler declaration
// ═══════════════════════════════════════════════════════════════

import { ReusableFunction, TargetDbOperation } from "@workspace/canvas/types";
import { Endpoint } from "@workspace/canvas/types";
import { collectPipelineImports } from "../pipelineRenderer";

export interface HandlerPreambleParams {
  serviceName: string;
  routeFileName: string;
  handlerName: string;
  pascalName: string;
  schemaVarPrefix: string;
  method: string;
  path: string;
  summary: string;
  pickedDbOps: TargetDbOperation[];
  dbFunctions: ReusableFunction[];
  redisFunctions: ReusableFunction[];
  kafkaFunctions: ReusableFunction[];
  pickedKafka: ReusableFunction | null;
  codeBlockText: string;
  hasStreamingStep: boolean;
  queryTypeResHasContent: boolean;
  isBodyMethod: boolean;
  bodyTypeResHasContent: boolean;
  pipelineSteps?: Endpoint["pipelineSteps"];
  requiresAuth?: boolean;
}

export interface HandlerPreambleResult {
  preambleCode: string;
  extraImports: Map<string, Set<string>>;
}

/**
 * Builds the import lines, type aliases, and function header for an Express route handler.
 */
export function emitHandlerPreamble(params: HandlerPreambleParams): HandlerPreambleResult {
  const {
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
    queryTypeResHasContent,
    isBodyMethod,
    bodyTypeResHasContent,
    pipelineSteps,
    requiresAuth = false,
  } = params;

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

  // Pre-collect pipeline step imports so they land in the file's import block
  if (Array.isArray(pipelineSteps) && pipelineSteps.length > 0) {
    const pipelineImports = collectPipelineImports(pipelineSteps);
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
  if (queryTypeResHasContent) {
    typeImportsList.push(`${schemaVarPrefix}QuerySchema`);
  }
  if (bodyTypeResHasContent) {
    typeImportsList.push(`${schemaVarPrefix}BodySchema`);
  }
  if (requiresAuth) {
    typeImportsList.push("AuthUser");
  }

  let code = `import { Request, Response } from "express";
import { createLogger } from "@workspace/logger";
import {
  ${typeImportsList.join(",\n  ")}
} from "@workspace/types";
${allExtraImportLines ? `${allExtraImportLines}\n` : ""}\nconst logger = createLogger("${serviceName}:${routeFileName}");

type ${pascalName}ErrorResponse = {
  error: string;
  details?: string | { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> } | Record<string, string | number | boolean | null>;
};

${
  requiresAuth
    ? `export type ${pascalName}Request =
  | (Request<${pascalName}Params, ${pascalName}Response | ${pascalName}ErrorResponse, ${pascalName}Body, ${pascalName}Query> & {
      user?: AuthUser;
    })
  | {
      headers?: Record<string, string | string[] | undefined>;
      params: ${pascalName}Params;
      query: ${pascalName}Query;
      body?: ${pascalName}Body;
      user?: AuthUser;
    };`
    : `export type ${pascalName}Request =
  | Request<${pascalName}Params, ${pascalName}Response | ${pascalName}ErrorResponse, ${pascalName}Body, ${pascalName}Query>
  | {
      headers?: Record<string, string | string[] | undefined>;
      params: ${pascalName}Params;
      query: ${pascalName}Query;
      body?: ${pascalName}Body;
    };`
}

${hasStreamingStep ? `export type ${pascalName}ResponseContext = Response;\n
// ---------------------------------------------------------------------------
// Helpers (module-level: allocated once, not per request / per chunk)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
type Usage = { input_tokens: number; output_tokens: number; total_tokens: number; reasoning_tokens: number };

const STREAM_MODES = new Set(["messages", "updates", "custom", "values", "debug"]);

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** First numeric value found under any of keys. */
function pickNumber(obj: Rec | undefined, keys: string[]): number {
  if (!obj) return 0;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
  }
  return 0;
}

/** Locate response_metadata on a message chunk (direct or serialized under kwargs). */
function getResponseMetadata(m: Rec): Rec | undefined {
  if (isRec(m.response_metadata)) return m.response_metadata;
  if (isRec(m.kwargs) && isRec(m.kwargs.response_metadata)) return m.kwargs.response_metadata;
  return undefined;
}

/** Locate the usage object across the various provider shapes. */
function findUsage(m: Rec, rm: Rec | undefined): Rec | undefined {
  if (isRec(m.usage_metadata)) return m.usage_metadata;
  if (isRec(m.kwargs) && isRec(m.kwargs.usage_metadata)) return m.kwargs.usage_metadata;
  if (rm) {
    for (const k of ["token_usage", "tokenUsage", "usage"]) {
      if (isRec(rm[k])) return rm[k];
    }
  }
  return undefined;
}

function findReasoningTokens(usage: Rec, rm: Rec | undefined): number {
  const direct = pickNumber(usage, ["reasoning_tokens", "reasoningTokens"]);
  if (direct) return direct;
  for (const k of ["completion_tokens_details", "output_token_details"]) {
    if (isRec(usage[k])) {
      const n = pickNumber(usage[k], ["reasoning_tokens", "reasoning"]);
      if (n) return n;
    }
  }
  if (rm) {
    const src = isRec(rm.usage) ? rm.usage : rm;
    if (isRec(src.completion_tokens_details)) {
      const n = pickNumber(src.completion_tokens_details, ["reasoning_tokens", "reasoning"]);
      if (n) return n;
    }
    const n = pickNumber(src, ["reasoning_tokens"]);
    if (n) return n;
  }
  return 0;
}

/** Pull text + reasoning out of a message chunk in a single pass. */
function extractTokens(m: unknown): { text: string; reasoning: string } {
  if (typeof m === "string") return { text: m, reasoning: "" };
  if (!isRec(m)) return { text: "", reasoning: "" };

  let text = "";
  let reasoning = "";

  if (Array.isArray(m.contentBlocks)) {
    for (const b of m.contentBlocks) {
      if (!isRec(b)) continue;
      if (b.type === "reasoning" || b.type === "thinking") {
        reasoning += str(b.reasoning) || str(b.thinking) || str(b.text);
      } else if (b.type === "text") {
        text += str(b.text);
      }
    }
  }

  if (!reasoning && isRec(m.additional_kwargs)) {
    reasoning = str(m.additional_kwargs.reasoning_content) || str(m.additional_kwargs.thinking);
  }

  if (!text) {
    if (typeof m.content === "string") text = m.content;
    else if (typeof m.text === "string") text = m.text;
    else if (Array.isArray(m.content)) {
      for (const item of m.content) {
        if (typeof item === "string") text += item;
        else if (isRec(item)) {
          if (item.type === "text") text += str(item.text);
          else if ((item.type === "reasoning" || item.type === "thinking") && !reasoning) {
            reasoning += str(item.reasoning) || str(item.thinking) || str(item.text);
          }
        }
      }
    }
  }

  return { text, reasoning };
}

/** Normalize the many LangGraph chunk shapes into { mode, payload }. */
function normalizeChunk(chunk: unknown): { mode: string; payload: unknown } {
  if (Array.isArray(chunk)) {
    const a = chunk.length > 0 ? chunk[0] : undefined;
    const b = chunk.length > 1 ? chunk[1] : undefined;
    const c = chunk.length > 2 ? chunk[2] : undefined;
    // subgraphs + multi-mode: [namespace[], mode, data]
    if (chunk.length === 3 && Array.isArray(a) && typeof b === "string" && STREAM_MODES.has(b)) {
      return { mode: b, payload: c };
    }
    if (chunk.length === 2) {
      // subgraphs + single-mode: [namespace[], data]
      if (Array.isArray(a)) return { mode: "messages", payload: b };
      // multi-mode: [mode, data]
      if (typeof a === "string" && STREAM_MODES.has(a)) return { mode: a, payload: b };
    }
    return { mode: "messages", payload: chunk };
  }
  if (isRec(chunk) && !("content" in chunk) && !("text" in chunk)) {
    return { mode: "updates", payload: chunk };
  }
  return { mode: "messages", payload: chunk };
}
` : `export type ${pascalName}ResponseContext =
  | Response<${pascalName}Response | ${pascalName}ErrorResponse>
  | {
      status: (code: number) => {
        json: (data?: ${pascalName}Response | ${pascalName}ErrorResponse) => void | Response;
      };
      json: (data?: ${pascalName}Response | ${pascalName}ErrorResponse) => void | Response;
      setHeader?: (name: string, value: string | number | readonly string[]) => void | Response;
      header?: (name: string, value?: string | number | readonly string[]) => void | Response;
    };
`}

/**
 * ${method.toUpperCase()} ${path}
 * ${summary}
 */
export async function ${handlerName}(
  req: ${pascalName}Request,
  res: ${pascalName}ResponseContext
) {
${hasStreamingStep ? `  const abort = new AbortController();
  const onClose = () => abort.abort();

  try {
    res.on("close", onClose);
    logger.info("Handling ${method.toUpperCase()} ${path}");
    logger.debug("Request details", { params: req.params, query: req.query, messageLength: req.body?.message?.length });
` : `  try {
    logger.info("Handling ${method.toUpperCase()} ${path}");
    logger.debug("Request details", { params: req.params, query: req.query, body: req.body });
`}

`;

  return {
    preambleCode: code,
    extraImports,
  };
}
