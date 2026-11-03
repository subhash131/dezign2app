import type { LangGraphLLMNodeData } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/types";
import type { CompileContext, LLMMeta, ToolMeta } from "../types";
import { toIdentifier, getProviderPackage, getProviderClass } from "../utils";

export function buildIndividualLLMFile(
  llmNode: { id: string; data: LangGraphLLMNodeData },
  ctx: CompileContext,
  llmMetaMap: Map<string, LLMMeta>,
  toolMetaMap: Map<string, ToolMeta>,
): string {
  const d = llmNode.data;
  const meta = llmMetaMap.get(llmNode.id);
  const varName = meta
    ? meta.varName
    : toIdentifier(d.label || `llm_${llmNode.id}`);

  const pkg = getProviderPackage(d.provider);
  const cls = getProviderClass(d.provider);

  const imports: string[] = [];
  if (pkg && cls) {
    imports.push(`import { ${cls} } from "${pkg}";`);
  }

  const connectedAgentIds = [...ctx.agentLLMMap.entries()]
    .filter(([, llmId]) => llmId === llmNode.id)
    .map(([agentId]) => agentId);

  const connectedToolIds = new Set<string>();
  for (const agentId of connectedAgentIds) {
    const toolIds = ctx.agentToolsMap.get(agentId) || [];
    toolIds.forEach((tid) => connectedToolIds.add(tid));
  }

  const toolVarNames: string[] = [
    ...new Set(
      [...connectedToolIds]
        .map((tid) => {
          const tMeta = toolMetaMap.get(tid);
          return tMeta ? tMeta.varName : "";
        })
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  if (toolVarNames.length > 0) {
    imports.push(`import { ${toolVarNames.join(", ")} } from "../tools";`);
  }

  const configLines: string[] = [];
  if (d.model) configLines.push(`  model: "${d.model}",`);
  if (d.temperature !== undefined)
    configLines.push(`  temperature: ${d.temperature},`);
  if (d.maxTokens !== undefined)
    configLines.push(`  maxTokens: ${d.maxTokens},`);
  if (d.provider === "openai" || d.provider === "groq" || d.provider === "azure") {
    configLines.push(`  streamUsage: true,`);
  }

  if (
    (d.provider === "ollama" || d.provider === "custom") &&
    (d.baseUrl || d.url)
  ) {
    configLines.push(`  baseURL: "${d.baseUrl || d.url}",`);
  }

  const parts: string[] = [imports.join("\n"), ""];

  if (toolVarNames.length > 0) {
    parts.push(
      `const ${varName}Base = new ${cls}({\n${configLines.join("\n")}\n});`,
    );
    parts.push(
      `export const ${varName} = ${varName}Base.bindTools([${toolVarNames.join(", ")}]);`,
    );
  } else {
    parts.push(
      `export const ${varName} = new ${cls}({\n${configLines.join("\n")}\n});`,
    );
  }

  return parts.join("\n\n");
}

export function buildLLMIndexFile(
  ctx: CompileContext,
  llmMetaMap: Map<string, LLMMeta>,
): string {
  const exports = ctx.llmNodes.map((l) => {
    const meta = llmMetaMap.get(l.id);
    return `export * from "./${meta?.fileName}";`;
  });
  return exports.join("\n") + "\n";
}
