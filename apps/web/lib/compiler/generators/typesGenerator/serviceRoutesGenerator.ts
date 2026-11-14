import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile, ServiceInfo } from "@workspace/canvas/types";
import { syncEndpointRouteWithPathParams, parseEndpointRouteWithParams } from "@workspace/canvas";
import {
  toVarName,
  toPascalCase,
  toPascalServiceName,
  toFolderName,
  deriveRouteFileName,
  normalizeEndpointRequestBody,
} from "../../utils";
import {
  parametersToTsInterface,
  parametersToZodSchema,
  schemaToTsInterface,
  schemaToZodSchema,
} from "../schemaToTypeScript";
import { generateResponseInterface } from "./responseInference";
import { classifyEndpointShape } from "../routeGenerator/endpointTypeClassifier";

export function generateServiceRouteTypes(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  servicesInfo?: ServiceInfo[],
  edges: BackendEdge[] = [],
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
    const folderBase = srvInfo?.folderName || toFolderName(rawServiceName);
    let serviceFolderName = toVarName(folderBase) || "service";
    let pascalServiceName = toPascalServiceName(folderBase);

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
      nodeEndpoints.forEach((rawEp, index) => {
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
        let routeFileName = deriveRouteFileName(ep, index, rawServiceName);

        if (usedFileNames.has(routeFileName)) {
          routeFileName = `${routeFileName}_${index + 1}`;
        }
        usedFileNames.add(routeFileName);

        // Disambiguate type names with PascalCase Service Name to prevent TS2308 collisions across modules
        const method = (ep.type || "GET").toLowerCase();
        const pascalName = `${pascalServiceName}${toPascalCase(routeFileName)}`;
        const schemaVarPrefix = `${serviceFolderName}${toPascalCase(routeFileName)}`;
        const isBodyMethod = ["post", "put", "patch", "delete"].includes(method);

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
          edges,
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

        const shape = ep ? classifyEndpointShape(ep, nodes, edges) : { kind: "unknown" as const };
        if (!bodyTypeRes.hasContent && isBodyMethod && shape.kind === "entity") {
          const entityBodyType = method === "post" ? `Create${shape.entity}Data` : `Update${shape.entity}Data`;
          responseResInfo.entityImports.add(entityBodyType);
        }

        const entityImportStatement =
          responseResInfo.entityImports.size > 0
            ? `import type { ${Array.from(responseResInfo.entityImports).join(", ")} } from "../entities";\n`
            : "";

        let singleRouteCode = `import { z } from "zod";\n${entityImportStatement}\n`;
        singleRouteCode += `/**\n * ${ep.type || "GET"} ${ep.name || "/"}\n * Service: ${rawServiceName}\n * ${ep.summary || "Route Schema"}\n */\n`;
        singleRouteCode += `// --- Input Schemas ---\n`;
        singleRouteCode += paramsTypeRes.code + "\n";
        singleRouteCode += queryTypeRes.code + "\n";
        if (bodyTypeRes.hasContent) {
          singleRouteCode += bodyTypeRes.code + "\n";
        } else if (isBodyMethod) {
          if (shape.kind === "entity") {
            const entityBodyType = method === "post" ? `Create${shape.entity}Data` : `Update${shape.entity}Data`;
            singleRouteCode += `export type ${pascalName}Body = ${entityBodyType};\n\n`;
          } else {
            singleRouteCode += `export type ${pascalName}Body = Record<string, string | number | boolean | null>;\n\n`;
          }
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
            singleRouteCode += `export interface ${pascalName}ErrorResponse {\n  error: string;\n  message: string;\n  statusCode?: number;\n  details?: string | Record<string, string | number | boolean | null>;\n}\n\n`;
          }
        } else {
          singleRouteCode += `export interface ${pascalName}ErrorResponse {\n  error: string;\n  message: string;\n  statusCode?: number;\n  details?: string | Record<string, string | number | boolean | null>;\n}\n\n`;
        }

        singleRouteCode += `// --- Zod Validation Schemas ---\n`;
        if (queryTypeRes.hasContent) {
          singleRouteCode += queryZodRes.code + "\n";
        }
        if (bodyTypeRes.hasContent) {
          singleRouteCode += bodyZodRes.code + "\n";
        }

        // File per route: src/<serviceFolderName>/<routeFileName>.ts
        files.push({
          filename: `src/${serviceFolderName}/${routeFileName}.ts`,
          language: "typescript",
          content: singleRouteCode,
        });

        // --- Collect explicit export names (types vs Zod value schemas) ---
        const routeTypeNames: string[] = [
          `${pascalName}Params`,
          `${pascalName}Query`,
          `${pascalName}Body`,
          `${pascalName}Response`,
          `${pascalName}ErrorResponse`,
        ];
        const routeValueNames: string[] = [];
        if (queryTypeRes.hasContent) routeValueNames.push(`${schemaVarPrefix}QuerySchema`);
        if (bodyTypeRes.hasContent) routeValueNames.push(`${schemaVarPrefix}BodySchema`);

        // Build explicit named export line(s) for the service barrel (index.ts)
        let routeExportLine = `export type { ${routeTypeNames.join(", ")} } from "./${routeFileName}";`;
        if (routeValueNames.length > 0) {
          routeExportLine += `\nexport { ${routeValueNames.join(", ")} } from "./${routeFileName}";`;
        }
        routeFileExports.push(routeExportLine);

        // For the root barrel, fully-resolve the path (skip intermediate index)
        const rootTypeExportLine = `export type { ${routeTypeNames.join(", ")} } from "./${serviceFolderName}/${routeFileName}";`;
        barrelExports.push(rootTypeExportLine);
        if (routeValueNames.length > 0) {
          barrelExports.push(`export { ${routeValueNames.join(", ")} } from "./${serviceFolderName}/${routeFileName}";`);
        }
      });

      // Service barrel file: src/<serviceFolderName>/index.ts
      files.push({
        filename: `src/${serviceFolderName}/index.ts`,
        language: "typescript",
        content: `/**\n * Schemas for ${rawServiceName}\n */\n${routeFileExports.join("\n")}\n`,
      });

      const serviceNamespace = pascalServiceName.endsWith("Service")
        ? pascalServiceName
        : `${pascalServiceName}Service`;
      barrelExports.push(
        `export * as ${serviceNamespace} from "./${serviceFolderName}";`,
      );
    }
  });

  return { files, barrelExports };
}
