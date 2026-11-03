import { PipelineStep } from "@workspace/canvas/types";
import { toVarName } from "../../../utils";

/**
 * Builds an import map from pipeline steps (including recursive nested branches).
 * Returns a map of { importPath -> Set<functionName> }.
 */
export function collectPipelineImports(
  steps: PipelineStep[],
): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>();

  function addStepImports(s: PipelineStep): void {
    if (s.functionRef && s.enabled !== false) {
      const name = toVarName(s.functionRef.name || "fn");
      let importPath = s.functionRef.importPath || "";

      if (s.type === "transform" || importPath.includes("transformers")) {
        if (s.functionRef.isGlobal || importPath.startsWith("@workspace/transformers")) {
          importPath = "@workspace/transformers";
        } else if (
          importPath.startsWith("@/services/") ||
          importPath.startsWith("@workspace/services/") ||
          importPath.startsWith("@/")
        ) {
          importPath = `../transformers/${name}`;
        }
      } else if (
        s.type === "storage_operation" ||
        importPath.endsWith("/operations") ||
        importPath.endsWith("/buckets") ||
        importPath.endsWith("/client")
      ) {
        if (importPath.startsWith("@workspace/") && !importPath.startsWith("@workspace/storage")) {
          const parts = importPath.split("/");
          const subPath = parts.slice(2).join("/");
          importPath = subPath ? `@workspace/storage/${subPath}` : "@workspace/storage";
        }
      }

      const existing = imports.get(importPath);
      if (existing) {
        existing.add(name);
      } else {
        imports.set(importPath, new Set([name]));
      }
    } else if (s.type === "langgraph_invoke" && s.enabled !== false) {
      // For history steps the name contains " History" suffix — strip it so
      // the import resolves to the same package as the regular invoke step.
      const rawLabel = (s.name || "agent").replace(/\s+history$/i, "").trim() || "agent";
      let importPath: string;
      if (s.functionRef?.importPath && s.functionRef.importPath.startsWith("@")) {
        importPath = s.functionRef.importPath;
      } else {
        const pkgSlug =
          rawLabel
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "-")
            .replace(/^-+|-+$/g, "") || "agent";
        importPath = `@workspace/langgraph-${pkgSlug.replace(/^langgraph-/, "")}`;
      }
      const graphName =
        s.functionRef?.name ||
        (s.langGraphTargetNodeId &&
        !/^[0-9]/.test(s.langGraphTargetNodeId) &&
        !s.langGraphTargetNodeId.includes("-") &&
        s.langGraphTargetNodeId.length < 20
          ? `${toVarName(s.langGraphTargetNodeId)}Graph`
          : `${toVarName(rawLabel)}Graph`);
      const existing = imports.get(importPath);
      if (existing) {
        existing.add(graphName);
      } else {
        imports.set(importPath, new Set([graphName]));
      }

      if (s.langGraphMessagesConfig) {
        const set = imports.get(importPath)!;
        if (s.langGraphMessagesConfig.mode === "bulk") {
          set.add("HumanMessage");
          set.add("SystemMessage");
          set.add("AIMessage");
        } else {
          set.add("HumanMessage");
          if (s.langGraphMessagesConfig.systemMessageSource?.trim()) {
            set.add("SystemMessage");
          }
          if (s.langGraphMessagesConfig.aiMessageSource?.trim()) {
            set.add("AIMessage");
          }
        }
      }

      if (s.langGraphStreamingEnabled) {
        const streamProtocol = s.langGraphStreamingProtocol || "sse";
        if (streamProtocol === "websocket") {
          const wsPath = "../lib";
          const wsExisting = imports.get(wsPath);
          if (wsExisting) {
            wsExisting.add("wsBroadcast");
          } else {
            imports.set(wsPath, new Set(["wsBroadcast"]));
          }
        } else if (streamProtocol === "kafka") {
          const kafkaPath = "@workspace/kafka";
          const kafkaExisting = imports.get(kafkaPath);
          if (kafkaExisting) {
            kafkaExisting.add("publishKafkaEvent");
          } else {
            imports.set(kafkaPath, new Set(["publishKafkaEvent"]));
          }
        } else if (streamProtocol === "redis_stream") {
          const redisPath = "@workspace/redis";
          const redisExisting = imports.get(redisPath);
          if (redisExisting) {
            redisExisting.add("getRedisClient");
          } else {
            imports.set(redisPath, new Set(["getRedisClient"]));
          }
        }
      }
    } else if (s.type === "push_to_client" && s.enabled !== false) {
      const protocol = s.clientDeliveryProtocol || "SSE";
      let fnName: string | null = null;
      if (protocol === "SSE") {
        fnName = "sseBroadcast";
      } else if (protocol === "WEBSOCKET") {
        fnName = "wsBroadcast";
      } else if (protocol === "WEBRTC") {
        fnName = "webrtcBroadcast";
      }
      if (fnName) {
        const importPath = "../lib";
        const existing = imports.get(importPath);
        if (existing) {
          existing.add(fnName);
        } else {
          imports.set(importPath, new Set([fnName]));
        }
      }
    }

    // Cache Miss imports for Redis operations
    if (
      s.type === "redis_operation" &&
      s.cacheMiss?.enabled &&
      s.enabled !== false
    ) {
      if (s.cacheMiss.action === "fallback_db" && s.cacheMiss.functionRef?.name) {
        const dbName = toVarName(s.cacheMiss.functionRef.name);
        const dbPath = s.cacheMiss.functionRef.importPath || "@workspace/db";
        const existing = imports.get(dbPath);
        if (existing) {
          existing.add(dbName);
        } else {
          imports.set(dbPath, new Set([dbName]));
        }
      }

      if (
        s.cacheMiss.writeBackToCache &&
        s.cacheMiss.writeBackFunctionRef?.name
      ) {
        const writeBackFn = toVarName(s.cacheMiss.writeBackFunctionRef.name);
        const redisPath =
          s.cacheMiss.writeBackFunctionRef.importPath ||
          s.functionRef?.importPath ||
          "@workspace/redis";
        const existing = imports.get(redisPath);
        if (existing) {
          existing.add(writeBackFn);
        } else {
          imports.set(redisPath, new Set([writeBackFn]));
        }
      }
    }
    if (s.thenSteps) s.thenSteps.forEach(addStepImports);
    if (s.elseSteps) s.elseSteps.forEach(addStepImports);
    if (s.trySteps) s.trySteps.forEach(addStepImports);
    if (s.catchSteps) s.catchSteps.forEach(addStepImports);
    if (s.cacheMissSteps) s.cacheMissSteps.forEach(addStepImports);
    if (s.switchCases) s.switchCases.forEach((c) => c.steps?.forEach(addStepImports));
    if (s.switchDefault) s.switchDefault.forEach(addStepImports);
    if (s.parallelBranches) s.parallelBranches.forEach((b) => b.steps?.forEach(addStepImports));
    if (s.loopBody) s.loopBody.forEach(addStepImports);
  }

  for (const step of steps) {
    addStepImports(step);
  }

  return imports;
}
