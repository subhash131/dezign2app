// ═══════════════════════════════════════════════════════════════
// MODULE: InterServiceCallEmitter
// LAYER:  generators / routeGenerator / handlers
// EMITS:  gRPC client calls or HTTP fetch() calls between microservices
// ═══════════════════════════════════════════════════════════════

import { Endpoint, EndpointTraceResult } from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";
import { INTER_SERVICE_PROTOCOL_GRPC } from "@workspace/canvas";
import { toVarName, toPascalCase, toEnvVarName } from "../../../utils";

export interface InterServiceCallEmitterParams {
  trace: EndpointTraceResult;
  codeBlock: string;
  allNodes: BackendNode[];
  allEndpoints: (Endpoint & { nodeId: string })[];
  ep: Endpoint & { nodeId: string };
  payloadVar: string;
}

/**
 * Emits inter-service communication statements (either gRPC dynamic import or HTTP fetch).
 */
export function emitInterServiceCalls(params: InterServiceCallEmitterParams): string {
  const { trace, codeBlock, allNodes, allEndpoints, ep, payloadVar } = params;

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

  if (outgoingServices.length === 0 || (useGrpc ? hasGrpcInCodeBlock : hasFetchInCodeBlock)) {
    return "";
  }

  let code = "";

  outgoingServices.forEach((outService) => {
    const targetNode = allNodes.find((n) => n.id === outService.nodeId);
    const tgtLabel = targetNode?.data?.label || outService.nodeName || "Service";
    const tgtPort = targetNode?.data?.port || "8080";
    const varPrefix = toVarName(tgtLabel);

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
      code += `    // --- Inter-Service gRPC Call: ${tgtLabel} (${rpcName}) ---\n`;
      code += `    const { create${rpcName}Client } = await import("${packageName}/${endpointName}");\n`;
      code += `    const { Metadata: ${varPrefix}GrpcMetadata } = await import("@grpc/grpc-js");\n`;
      code += `    type ${rpcName}Response = import("${packageName}/${endpointName}").${rpcName}Response;\n`;
      code += `    const ${varPrefix}GrpcClient = create${rpcName}Client(\n`;
      code += `      process.env.${envVarName} || "localhost:${tgtGrpcPort}",\n`;
      code += `    );\n`;
      code += `    const ${varPrefix}Meta = new ${varPrefix}GrpcMetadata();\n`;
      code += `    if (req.headers.authorization) {\n`;
      code += `      ${varPrefix}Meta.set("authorization", String(req.headers.authorization));\n`;
      code += `    }\n`;

      code += `    let ${varPrefix}Data: ${rpcName}Response | null = null;\n`;
      code += `    ${varPrefix}Data = await new Promise((resolve, reject) => {\n`;
      code += `      ${varPrefix}GrpcClient.${rpcMethod}(${payloadVar}, ${varPrefix}Meta, (err, response) => {\n`;
      code += `        if (err) {\n`;
      code += `          logger.error("gRPC call to ${tgtLabel} failed", { err });\n`;
      code += `          return reject(err);\n`;
      code += `        }\n`;
      code += `        logger.info("gRPC response from ${tgtLabel}", { data: response });\n`;
      code += `        resolve(response);\n`;
      code += `      });\n`;
      code += `    });\n\n`;
    } else {
      // ── REST HTTP fetch call ──────────────────────────────────────────────
      const envVarName = `${toEnvVarName(tgtLabel)}_BASE_URL`;
      const targetMethod = (targetEp?.type || "GET").toUpperCase();
      const rawTargetName = targetEp?.name || "/";
      const targetPath = rawTargetName.startsWith("/") ? rawTargetName : `/${rawTargetName}`;
      const isTargetBodyMethod = ["POST", "PUT", "PATCH"].includes(targetMethod);

      code += `    // --- Inter-Service HTTP Call: ${tgtLabel} ---\n`;
      code += `    const ${varPrefix}BaseUrl = process.env.${envVarName} || "http://localhost:${tgtPort}";\n`;
      code += `    const ${varPrefix}Response = await fetch(\`\${${varPrefix}BaseUrl}${targetPath}\`, {\n`;
      code += `      method: "${targetMethod}",\n`;
      code += `      headers: {\n`;
      code += `        "Content-Type": "application/json",\n`;
      code += `        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),\n`;
      code += `      },\n`;
      if (isTargetBodyMethod) {
        code += `      body: JSON.stringify(${payloadVar}),\n`;
      }
      code += `    });\n\n`;
      code += `    let ${varPrefix}Data: Record<string, string | number | boolean | null> | null = null;\n`;
      code += `    if (!${varPrefix}Response.ok) {\n`;
      code += `      logger.error("Inter-service request to ${tgtLabel} failed", { status: ${varPrefix}Response.status, statusText: ${varPrefix}Response.statusText });\n`;
      code += `    } else {\n`;
      code += `      ${varPrefix}Data = await ${varPrefix}Response.json();\n`;
      code += `      logger.info("Successfully received response from ${tgtLabel}", { data: ${varPrefix}Data });\n`;
      code += `    }\n\n`;
    }
  });

  return code;
}
