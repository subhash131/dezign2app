import { BackendNode } from "@/types/canvas";
import { Endpoint, CompiledFile, ServiceInfo } from "@workspace/canvas/types";
import {
  toVarName,
  toPascalCase,
  deriveRouteFileName,
} from "../../utils";
import {
  parametersToTsInterface,
  parametersToZodSchema,
  schemaToTsInterface,
  schemaToZodSchema,
} from "../schemaToTypeScript";
import { generateResponseInterface } from "./responseInference";

export function generateServiceRouteTypes(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  servicesInfo?: ServiceInfo[],
): { files: CompiledFile[]; barrelExports: string[] } {
  const files: CompiledFile[] = [];
  const barrelExports: string[] = [];

  const endpointNodes = nodes.filter(
    (n) =>
      n.type === "service" ||
      n.type === "api_gateway" ||
      n.type === "serverless" ||
      Boolean(n.data && (n.data.endpoints || n.data.routeGroups)),
  );

  const processedServiceFolders = new Set<string>();

  endpointNodes.forEach((serviceNode) => {
    const srvInfo = servicesInfo?.find((s) => s.id === serviceNode.id);
    const rawServiceName =
      srvInfo?.name || serviceNode.data?.label || serviceNode.id || "Service";
    const folderBase = srvInfo?.folderName || rawServiceName;
    let serviceFolderName = toVarName(folderBase) || "service";
    let pascalServiceName = toPascalCase(folderBase);

    let dupCount = 1;
    const baseFolderName = serviceFolderName;
    const basePascalName = pascalServiceName;
    while (processedServiceFolders.has(serviceFolderName)) {
      dupCount += 1;
      serviceFolderName = `${baseFolderName}_${dupCount}`;
      pascalServiceName = `${basePascalName}${dupCount}`;
    }
    processedServiceFolders.add(serviceFolderName);

    // Gather all endpoints for this node
    let nodeEndpoints = endpoints.filter(
      (e) =>
        e.nodeId === serviceNode.id ||
        (e.nodeId &&
          ((serviceNode.data?.label && e.nodeId === serviceNode.data.label) ||
            (serviceNode.data?.label && e.nodeId === serviceNode.data.label.toLowerCase()))),
    );
    if (nodeEndpoints.length === 0 && serviceNode.data?.endpoints) {
      nodeEndpoints = serviceNode.data.endpoints.map((ep) => ({
        ...ep,
        nodeId: serviceNode.id,
      }));
    }

    const routeFileExports: string[] = [];
    const usedFileNames = new Set<string>();

    if (nodeEndpoints.length > 0) {
      nodeEndpoints.forEach((ep, index) => {
        let routeFileName = deriveRouteFileName(ep, index, rawServiceName);

        if (usedFileNames.has(routeFileName)) {
          routeFileName = `${routeFileName}_${index + 1}`;
        }
        usedFileNames.add(routeFileName);

        // Disambiguate type names with PascalCase Service Name to prevent TS2308 collisions across modules
        const method = (ep.type || "GET").toLowerCase();
        const pascalName = `${pascalServiceName}${toPascalCase(routeFileName)}`;
        const schemaVarPrefix = `${serviceFolderName}${toPascalCase(routeFileName)}`;
        const isBodyMethod = ["post", "put", "patch"].includes(method);

        const paramsTypeRes = parametersToTsInterface(
          `${pascalName}Params`,
          ep.pathParams,
          true,
        );
        const queryTypeRes = parametersToTsInterface(
          `${pascalName}Query`,
          ep.queryParams,
          false,
        );
        const bodyTypeRes = schemaToTsInterface(
          `${pascalName}Body`,
          ep.requestBody,
        );
        const responseResInfo = generateResponseInterface(
          `${pascalName}Response`,
          ep.responseFields,
          ep.responseBody,
          nodes,
          ep,
          serviceNode,
        );

        const queryZodRes = parametersToZodSchema(
          `${schemaVarPrefix}QuerySchema`,
          ep.queryParams,
          false,
        );
        const bodyZodRes = schemaToZodSchema(
          `${schemaVarPrefix}BodySchema`,
          ep.requestBody,
        );

        const entityImportStatement =
          responseResInfo.entityImports.size > 0
            ? `import type { ${Array.from(responseResInfo.entityImports).join(", ")} } from "../entities";\n`
            : "";

        let singleRouteCode = `import { z } from "zod";\n${entityImportStatement}\n`;
        singleRouteCode += `/**\n * ${ep.type || "GET"} ${ep.name || "/"}\n * Service: ${rawServiceName}\n * ${ep.summary || "Route Schema"}\n */\n`;
        singleRouteCode += `// --- Input Schemas ---\n`;
        singleRouteCode += paramsTypeRes.code + "\n";
        singleRouteCode += queryTypeRes.code + "\n";
        if (isBodyMethod) {
          singleRouteCode += bodyTypeRes.code + "\n";
        } else {
          singleRouteCode += `export type ${pascalName}Body = never;\n\n`;
        }

        singleRouteCode += `// --- Output Schemas (Success & Error) ---\n`;
        singleRouteCode += responseResInfo.code + "\n";
        if (ep.errorResponseBody) {
          const errorRes = schemaToTsInterface(`${pascalName}ErrorResponse`, ep.errorResponseBody);
          if (errorRes.hasContent) {
            singleRouteCode += errorRes.code + "\n";
          } else {
            singleRouteCode += `export interface ${pascalName}ErrorResponse {\n  error: string;\n  message: string;\n  statusCode?: number;\n  details?: unknown;\n}\n\n`;
          }
        } else {
          singleRouteCode += `export interface ${pascalName}ErrorResponse {\n  error: string;\n  message: string;\n  statusCode?: number;\n  details?: unknown;\n}\n\n`;
        }

        singleRouteCode += `// --- Zod Validation Schemas ---\n`;
        if (queryTypeRes.hasContent) {
          singleRouteCode += queryZodRes.code + "\n";
        }
        if (isBodyMethod && bodyTypeRes.hasContent) {
          singleRouteCode += bodyZodRes.code + "\n";
        }

        // File per route: src/<serviceFolderName>/<routeFileName>.ts
        files.push({
          filename: `src/${serviceFolderName}/${routeFileName}.ts`,
          language: "typescript",
          content: singleRouteCode,
        });

        routeFileExports.push(`export * from "./${routeFileName}";`);
      });

      // Service barrel file: src/<serviceFolderName>/index.ts
      files.push({
        filename: `src/${serviceFolderName}/index.ts`,
        language: "typescript",
        content: `/**\n * Schemas for ${rawServiceName}\n */\n${routeFileExports.join("\n")}\n`,
      });

      barrelExports.push(`export * from "./${serviceFolderName}";`);
      barrelExports.push(
        `export * as ${pascalServiceName} from "./${serviceFolderName}";`,
      );
    }
  });

  return { files, barrelExports };
}
