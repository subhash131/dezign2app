// ═══════════════════════════════════════════════════════════════
// MODULE: AgentPipelineStepsRenderer
// LAYER:  compiler / langgraph / typescript / v1 / generators
// EMITS:  TypeScript statements for generic pipeline steps inside
//         LangGraph agent node functions.
// ═══════════════════════════════════════════════════════════════

import type {
  LangGraphNodePipelineStep,
  PipelineStepInputBinding,
  CanvasNodeData,
} from "@workspace/canvas";
import type { CompileContext } from "../types";
import {
  toCamelCase,
  toIdentifier,
  escapeTemplateLiteral,
  indent,
} from "../utils";

export interface StepImportItem {
  source: string;
  specifiers: string[];
  isDefault?: boolean;
  defaultName?: string;
}

export interface RenderedAgentPipeline {
  bodyLines: string[];
  imports: StepImportItem[];
  outputVarMap: Map<string, string>;
  hasLLMCall: boolean;
  llmOutputVar: string;
}

/**
 * Resolves an input binding into a TypeScript expression inside a LangGraph node.
 */
export function resolveLangGraphBinding(
  binding: PipelineStepInputBinding | undefined,
  stepOutputVars: Map<string, string>,
): string {
  if (!binding || !binding.source) return "undefined";
  const source = binding.source;

  switch (source.kind) {
    case "state": {
      const field = source.field ? source.field.trim() : "";
      return field ? `state.${toCamelCase(field)}` : "state";
    }

    case "req_body":
    case "req_params":
    case "req_query":
    case "req_headers": {
      // In LangGraph, request fields map to state channels
      const field = source.field ? source.field.trim() : "";
      return field ? `state.${toCamelCase(field)}` : "state";
    }

    case "env": {
      const field = source.field ? source.field.trim() : "";
      return field ? `process.env.${field}` : "process.env";
    }

    case "step_output": {
      const varName = stepOutputVars.get(source.stepId) || source.stepId;
      const field = source.field ? source.field.trim() : "";
      return field ? `${varName}?.${field}` : varName;
    }

    case "inline": {
      const v = source.value;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      const str = String(v ?? "").trim();
      if (!str) return '""';
      if (str.startsWith("`") || str.startsWith('"') || str.startsWith("'")) {
        return str;
      }
      if (str.includes("${")) {
        return `\`${str}\``;
      }
      return JSON.stringify(str);
    }

    default:
      return "undefined";
  }
}

/**
 * Extracts parameter names from a function signature string like "findAllConversations(limit?: number, offset?: number)"
 */
export function extractSigParamNames(signature?: string): string[] {
  if (!signature) return [];
  const match = signature.match(/\((.*?)\)/);
  const paramList = match?.[1];
  if (!paramList || !paramList.trim()) return [];
  return paramList
    .split(",")
    .map((p) => (p.trim().split(/[:=]/)[0] ?? "").replace(/^\.\.\./, "").replace(/\?$/, "").trim())
    .filter(Boolean);
}

/**
 * Renders a single pipeline step into TypeScript lines inside an Agent node function.
 */
function renderSinglePipelineStep(
  step: LangGraphNodePipelineStep,
  index: number,
  ctx: CompileContext,
  llmVar: string | null,
  stepOutputVars: Map<string, string>,
  bodyLines: string[],
  imports: StepImportItem[],
  agentData: CanvasNodeData,
): { isLLM: boolean; outVar: string } {
  const stepLabel = step.label || step.name || `Step ${index + 1}`;
  const outVar =
    step.outputVariable?.trim() ||
    toCamelCase(step.label || `${step.type}_${index + 1}`);
  stepOutputVars.set(step.id, outVar);
  if (step.outputVariable) {
    stepOutputVars.set(step.outputVariable.trim(), outVar);
  }

  const decl =
    step.declarationKind === "reassign"
      ? ""
      : `${step.declarationKind || "const"} `;

  let isLLM = false;

  bodyLines.push(`  // --- Step ${index + 1}: ${stepLabel} (${step.type}) ---`);

  switch (step.type) {
    case "kafka_publish": {
      const topicBinding = step.inputBindings?.find((b) => b.argName === "topic");
      const keyBinding = step.inputBindings?.find((b) => b.argName === "key");
      const payloadBindings =
        step.inputBindings?.filter(
          (b) => b.argName !== "topic" && b.argName !== "key",
        ) || [];

      const topicExpr = topicBinding
        ? resolveLangGraphBinding(topicBinding, stepOutputVars)
        : JSON.stringify(step.name || `${ctx.graphId}-events`);

      const keyExpr = keyBinding
        ? resolveLangGraphBinding(keyBinding, stepOutputVars)
        : null;

      let payloadExpr = "{}";
      if (
        payloadBindings.length === 1 &&
        (payloadBindings[0]?.argName === "payload" ||
          payloadBindings[0]?.argName === "data" ||
          payloadBindings[0]?.argName === "message")
      ) {
        payloadExpr = resolveLangGraphBinding(payloadBindings[0], stepOutputVars);
      } else if (payloadBindings.length > 0) {
        const fields = payloadBindings
          .map(
            (b) =>
              `    ${b.argName}: ${resolveLangGraphBinding(b, stepOutputVars)},`,
          )
          .join("\n");
        payloadExpr = `{\n${fields}\n  }`;
      } else {
        payloadExpr = `{ message: state.messages[state.messages.length - 1]?.content }`;
      }

      const kafkaImportSource = ctx.input.packageName
        ? "@workspace/kafka/publishers"
        : "../lib/kafka";

      imports.push({
        source: kafkaImportSource,
        specifiers: ["publishKafkaEvent"],
      });

      bodyLines.push(
        `  ${decl}${outVar} = await publishKafkaEvent(${topicExpr}, ${payloadExpr}${keyExpr ? `, ${keyExpr}` : ""});`,
      );
      break;
    }

    case "db_operation": {
      const functionRef = step.functionRef;
      if (functionRef && functionRef.name) {
        const fnName = functionRef.name.trim() || toIdentifier(step.name || "dbOperation");
        let importSource =
          functionRef.importPath ||
          (ctx.input.dbPackageName
            ? `${ctx.input.dbPackageName}/helpers`
            : "../lib/db");
        if (ctx.input.dbPackageName && importSource.startsWith("@workspace/db")) {
          importSource = importSource.replace("@workspace/db", ctx.input.dbPackageName);
        }

        imports.push({
          source: importSource,
          specifiers: [fnName],
        });

        // Resolve arguments
        const sigParams = extractSigParamNames(functionRef.signature);
        const isDestructuredOrObject = Boolean(
          functionRef.signature &&
            (functionRef.signature.includes("({") ||
              functionRef.signature.includes("(data:") ||
              functionRef.signature.includes("(payload:")),
        );

        let argsExpr = "";
        const bindings = step.inputBindings || [];
        if (bindings.length > 0) {
          if (!isDestructuredOrObject && sigParams.length > 0) {
            // Positional parameter call
            const resolvedList: string[] = [];
            for (const param of sigParams) {
              const bound = bindings.find(
                (b) =>
                  b.argName.replace(/\?$/, "").toLowerCase() ===
                  param.toLowerCase(),
              );
              if (bound && bound.source) {
                resolvedList.push(
                  resolveLangGraphBinding(bound, stepOutputVars),
                );
              } else {
                resolvedList.push("undefined");
              }
            }
            while (
              resolvedList.length > 0 &&
              resolvedList[resolvedList.length - 1] === "undefined"
            ) {
              resolvedList.pop();
            }
            argsExpr = resolvedList.join(", ");
          } else if (isDestructuredOrObject) {
            const argsList = bindings
              .map(
                (b) =>
                  `    ${b.argName}: ${resolveLangGraphBinding(b, stepOutputVars)},`,
              )
              .join("\n");
            argsExpr = argsList ? `{\n${argsList}\n  }` : "{}";
          } else {
            argsExpr = bindings
              .map((b) => resolveLangGraphBinding(b, stepOutputVars))
              .join(", ");
          }
        }

        bodyLines.push(`  ${decl}${outVar} = await ${fnName}(${argsExpr});`);
      } else {
        const table = toCamelCase(step.tableNodeId || step.name || "entity");
        const op = step.operationId || "findMany";
        const argsList = (step.inputBindings || [])
          .map((b) => `    ${b.argName}: ${resolveLangGraphBinding(b, stepOutputVars)},`)
          .join("\n");
        const argsExpr = argsList ? `{\n${argsList}\n  }` : "";

        const dbImportSource = ctx.input.dbPackageName || "../lib/db";
        imports.push({
          source: dbImportSource,
          specifiers: ["db"],
        });

        bodyLines.push(`  ${decl}${outVar} = await db.${table}.${op}(${argsExpr});`);
      }
      break;
    }

    case "redis_operation": {
      const command = (step.operationId || step.functionRef?.name || "get").toLowerCase();
      const bindings = step.inputBindings || [];
      const args = bindings
        .map((b) => resolveLangGraphBinding(b, stepOutputVars))
        .join(", ");

      const redisImportSource = ctx.input.redisPackageName || "../lib/redis";
      imports.push({
        source: redisImportSource,
        specifiers: ["getRedisClient"],
      });

      bodyLines.push(`  const redisClient = await getRedisClient();`);
      bodyLines.push(
        `  ${decl}${outVar} = await redisClient.${command}(${args});`,
      );
      break;
    }

    case "storage_operation": {
      const op = step.operationId || step.functionRef?.name || "uploadObject";
      const bindings = step.inputBindings || [];
      const args = bindings
        .map((b) => resolveLangGraphBinding(b, stepOutputVars))
        .join(", ");

      imports.push({
        source: "../lib/storage",
        specifiers: [op],
      });

      bodyLines.push(`  ${decl}${outVar} = await ${op}(${args});`);
      break;
    }

    case "external_call": {
      const urlBinding = step.inputBindings?.find((b) => b.argName === "url");
      const methodBinding = step.inputBindings?.find((b) => b.argName === "method");
      const bodyBinding = step.inputBindings?.find((b) => b.argName === "body");

      const urlExpr = urlBinding
        ? resolveLangGraphBinding(urlBinding, stepOutputVars)
        : JSON.stringify(step.functionRef?.name || "https://api.example.com");

      const method = methodBinding
        ? resolveLangGraphBinding(methodBinding, stepOutputVars)
        : JSON.stringify("GET");

      const bodyExpr = bodyBinding
        ? `JSON.stringify(${resolveLangGraphBinding(bodyBinding, stepOutputVars)})`
        : "undefined";

      bodyLines.push(`  const ${outVar}Response = await fetch(${urlExpr}, {`);
      bodyLines.push(`    method: ${method},`);
      bodyLines.push(`    headers: { "Content-Type": "application/json" },`);
      bodyLines.push(`    body: ${bodyExpr},`);
      bodyLines.push(`  });`);
      bodyLines.push(
        `  ${decl}${outVar} = await ${outVar}Response.json().catch(() => ({}));`,
      );
      break;
    }

    case "service_call": {
      const targetService = toCamelCase(step.functionRef?.name || "service");
      const bindings = step.inputBindings || [];
      const argsList = bindings
        .map((b) => `    ${b.argName}: ${resolveLangGraphBinding(b, stepOutputVars)},`)
        .join("\n");
      const argsExpr = argsList ? `{\n${argsList}\n  }` : "{}";

      bodyLines.push(
        `  ${decl}${outVar} = await callService("${targetService}", ${argsExpr});`,
      );
      break;
    }

    case "variable": {
      const valBinding = step.inputBindings?.find(
        (b) => b.argName === "value" || b.argName === "val",
      );
      const valExpr = valBinding
        ? resolveLangGraphBinding(valBinding, stepOutputVars)
        : step.variableSource
          ? resolveLangGraphBinding({ argName: "val", source: step.variableSource }, stepOutputVars)
          : '""';
      bodyLines.push(`  ${decl}${outVar} = ${valExpr};`);
      break;
    }

    case "transform":
    case "transformer": {
      const code = step.customCode?.trim();
      if (code) {
        bodyLines.push(`  ${decl}${outVar} = await (async () => {`);
        bodyLines.push(indent(code, 4));
        bodyLines.push(`  })();`);
      } else {
        const bindings = step.inputBindings || [];
        const fields = bindings
          .map(
            (b) =>
              `    ${b.argName}: ${resolveLangGraphBinding(b, stepOutputVars)},`,
          )
          .join("\n");
        bodyLines.push(
          `  ${decl}${outVar} = {\n${fields || "    result: true"}\n  };`,
        );
      }
      break;
    }

    case "custom_code": {
      const code = step.customCode?.trim();
      if (code) {
        bodyLines.push(indent(code, 2));
      }
      break;
    }

    case "llm_call": {
      isLLM = true;
      if (llmVar) {
        const sysPrompt = (agentData.systemPrompt || "").trim();
        if (sysPrompt) {
          imports.push({
            source: "@langchain/core/messages",
            specifiers: ["SystemMessage"],
          });
          bodyLines.push(`  const messages = [`);
          bodyLines.push(
            `    new SystemMessage(\`${escapeTemplateLiteral(sysPrompt)}\`),`,
          );
          bodyLines.push(`    ...state.messages,`);
          bodyLines.push(`  ];`);
          bodyLines.push(`  ${decl}${outVar} = await ${llmVar}.invoke(messages);`);
        } else {
          bodyLines.push(
            `  ${decl}${outVar} = await ${llmVar}.invoke(state.messages);`,
          );
        }

        const isStructured = Boolean(agentData.responseFormat?.enabled);
        if (isStructured) {
          bodyLines.push(`  let ${outVar}Parsed: Record<string, string | number | boolean | object | null> = {};`);
          bodyLines.push(`  try {`);
          bodyLines.push(
            `    const rawContent = typeof ${outVar}?.content === "string" ? ${outVar}.content : (typeof ${outVar} === "object" && ${outVar} !== null ? JSON.stringify(${outVar}) : "{}");`,
          );
          bodyLines.push(`    ${outVar}Parsed = JSON.parse(rawContent);`);
          bodyLines.push(`  } catch {`);
          bodyLines.push(
            `    ${outVar}Parsed = {};`,
          );
          bodyLines.push(`  }`);
        }
      } else {
        bodyLines.push(`  ${decl}${outVar} = { content: "No LLM attached" };`);
      }
      break;
    }

    case "push_to_client": {
      const payloadBinding = step.inputBindings?.[0];
      const payloadExpr = payloadBinding
        ? resolveLangGraphBinding(payloadBinding, stepOutputVars)
        : `{ event: "${stepLabel}", state }`;
      bodyLines.push(`  // Push event to connected client`);
      bodyLines.push(`  // broadcastClientEvent(${payloadExpr});`);
      break;
    }

    case "condition": {
      const condBinding = step.inputBindings?.find((b) => b.argName === "condition");
      const condExpr = condBinding
        ? resolveLangGraphBinding(condBinding, stepOutputVars)
        : "true";
      bodyLines.push(`  if (${condExpr}) {`);
      if (step.thenSteps && step.thenSteps.length > 0) {
        for (let i = 0; i < step.thenSteps.length; i++) {
          renderSinglePipelineStep(
            step.thenSteps[i]!,
            i,
            ctx,
            llmVar,
            stepOutputVars,
            bodyLines,
            imports,
            agentData,
          );
        }
      }
      if (step.elseSteps && step.elseSteps.length > 0) {
        bodyLines.push(`  } else {`);
        for (let i = 0; i < step.elseSteps.length; i++) {
          renderSinglePipelineStep(
            step.elseSteps[i]!,
            i,
            ctx,
            llmVar,
            stepOutputVars,
            bodyLines,
            imports,
            agentData,
          );
        }
      }
      bodyLines.push(`  }`);
      break;
    }

    case "try_catch": {
      bodyLines.push(`  try {`);
      if (step.trySteps && step.trySteps.length > 0) {
        for (let i = 0; i < step.trySteps.length; i++) {
          renderSinglePipelineStep(
            step.trySteps[i]!,
            i,
            ctx,
            llmVar,
            stepOutputVars,
            bodyLines,
            imports,
            agentData,
          );
        }
      }
      bodyLines.push(`  } catch (caughtError) {`);
      if (step.catchSteps && step.catchSteps.length > 0) {
        for (let i = 0; i < step.catchSteps.length; i++) {
          renderSinglePipelineStep(
            step.catchSteps[i]!,
            i,
            ctx,
            llmVar,
            stepOutputVars,
            bodyLines,
            imports,
            agentData,
          );
        }
      }
      bodyLines.push(`  }`);
      break;
    }

    default: {
      bodyLines.push(`  // [pipeline] unhandled step type "${step.type}"`);
      break;
    }
  }

  return { isLLM, outVar };
}

/**
 * Compiles all pipeline steps for a LangGraph Agent node.
 */
export function renderAgentPipelineSteps(
  pipelineSteps: LangGraphNodePipelineStep[],
  agentData: CanvasNodeData,
  ctx: CompileContext,
  llmVar: string | null,
): RenderedAgentPipeline {
  const bodyLines: string[] = [];
  const imports: StepImportItem[] = [];
  const outputVarMap = new Map<string, string>();
  let hasLLMCall = false;
  let llmOutputVar = "response";

  for (let i = 0; i < pipelineSteps.length; i++) {
    const step = pipelineSteps[i]!;
    if (step.enabled === false) continue;

    const res = renderSinglePipelineStep(
      step,
      i,
      ctx,
      llmVar,
      outputVarMap,
      bodyLines,
      imports,
      agentData,
    );

    if (res.isLLM) {
      hasLLMCall = true;
      llmOutputVar = res.outVar;
    }
  }

  return {
    bodyLines,
    imports,
    outputVarMap,
    hasLLMCall,
    llmOutputVar,
  };
}
