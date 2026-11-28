import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile, JSONValue } from "@workspace/canvas/types";
import { parseSchemaJson, toPascalCase } from "../../../../utils";
import { resolveEndpointTrace } from "../../../../traceResolver";
import { resolveEndpointAuth, resolveServiceAuthContext } from "../../../../generators/routeGenerator/handlers/authResolver";
import { generateFastApiMiddleware } from "../../../../auth/better-auth/v1.6/generators/generateFastApiMiddleware";
import { convertPathParams, toPythonRouteFileName } from "./utils";

interface RouteGeneratorOptions {
  node: BackendNode;
  serviceName: string;
  nodeEndpoints: (Endpoint & { nodeId: string })[];
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  endpoints: (Endpoint & { nodeId: string })[];
}

export function generateRoutes({
  node,
  serviceName,
  nodeEndpoints,
  allNodes,
  allEdges,
  endpoints,
}: RouteGeneratorOptions): { files: CompiledFile[]; routeFileNames: string[] } {
  const files: CompiledFile[] = [];
  const routeImports: string[] = [];
  const routeInclusions: string[] = [];
  const usedFileNames = new Set<string>();
  const routeFileNames: string[] = [];
  let hasAnyAuthRoute = false;

  if (nodeEndpoints.length === 0) {
    files.push({
      filename: "routes/health_route.py",
      language: "python",
      content: `from fastapi import APIRouter
from core.logger import get_logger
from core.response import format_response

logger = get_logger("${serviceName}:health_route")
router = APIRouter()

@router.get("/health", tags=["Health"])
async def health_handler():
    logger.info("Executing health check route handler")
    return format_response(
        {"status": "ok", "service": "${serviceName}"},
        "Service is healthy."
    )
`,
    });
    routeImports.push(`from .health_route import router as health_router`);
    routeInclusions.push(`router.include_router(health_router)`);
    routeFileNames.push("health_route");
  } else {
    nodeEndpoints.forEach((ep, index) => {
      const method = (ep.type || "GET").toLowerCase();
      const rawName = ep.name?.trim() ? ep.name.trim() : `endpoint_${index + 1}`;
      let routeFileName = toPythonRouteFileName(method, rawName, index);

      if (usedFileNames.has(routeFileName)) {
        routeFileName = `${routeFileName}_${index + 1}`;
      }
      usedFileNames.add(routeFileName);
      routeFileNames.push(routeFileName);

      const handlerName = `${routeFileName}_handler`;
      const pascalName = toPascalCase(rawName);
      const rawPath = ep.name?.startsWith("/") ? ep.name : `/${ep.name || ""}`;
      const path = convertPathParams(rawPath).replace(/\s+/g, "-");
      const summary = ep.summary || `Handler for ${ep.type || "GET"} ${path}`;

      const parsedResSchema = parseSchemaJson(ep.responseBody?.rawJson);
      let responseDataJson: string;
      if (parsedResSchema) {
        responseDataJson = JSON.stringify(parsedResSchema, null, 8)
          .replace(/true/g, "True")
          .replace(/false/g, "False")
          .replace(/null/g, "None");
      } else {
        responseDataJson = `{\n        "success": True,\n        "message": f"Successfully executed ${ep.type || "GET"} ${path}"\n    }`;
      }

      const trace = resolveEndpointTrace(
        node,
        ep,
        allNodes,
        allEdges,
        endpoints,
      );
      const authRes = resolveEndpointAuth(ep, trace);
      if (authRes.requiresAuth) {
        hasAnyAuthRoute = true;
      }
      const isBodyMethod = ["post", "put", "patch"].includes(method);

      let requestModelName: string | null = null;
      let pydanticModelCode = "";
      if (isBodyMethod && ep.requestBody?.rawJson) {
        const parsedReqBody = parseSchemaJson(ep.requestBody.rawJson);
        if (
          parsedReqBody !== null &&
          typeof parsedReqBody === "object" &&
          !Array.isArray(parsedReqBody)
        ) {
          requestModelName = `${pascalName}Request`;
          pydanticModelCode += `class ${requestModelName}(BaseModel):\n`;
          Object.keys(parsedReqBody).forEach((key) => {
            const val = parsedReqBody[key];
            let pyType = "Any";
            if (typeof val === "string") pyType = "str";
            else if (typeof val === "number") pyType = "float";
            else if (typeof val === "boolean") pyType = "bool";
            else if (Array.isArray(val)) pyType = "List[Any]";
            else if (typeof val === "object" && val !== null)
              pyType = "Dict[str, Any]";
            pydanticModelCode += `    ${key}: Optional[${pyType}] = None\n`;
          });
          pydanticModelCode += `\n`;
        }
      }

      const statusCode =
        method === "post" ? "status.HTTP_201_CREATED" : "status.HTTP_200_OK";
      const requiredRoles = ep.requiredRoles && ep.requiredRoles.length > 0 ? ep.requiredRoles : [];
      const authParamStr = authRes.requiresAuth
        ? requiredRoles.length > 0
          ? `current_user: dict = Depends(require_roles(${JSON.stringify(requiredRoles)}))`
          : `current_user: dict = Depends(get_current_user)`
        : "";
      const routeParams = [
        ...(requestModelName ? [`body: ${requestModelName}`] : []),
        ...(authParamStr ? [authParamStr] : []),
      ].join(", ");
      const dependsImport = authRes.requiresAuth ? ", Depends" : "";
      const authMiddlewareImport = authRes.requiresAuth
        ? requiredRoles.length > 0
          ? "from auth_middleware import get_current_user, require_roles\n"
          : "from auth_middleware import get_current_user\n"
        : "";

      let routeCode = `from fastapi import APIRouter, HTTPException, status${dependsImport}
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from core.logger import get_logger
from core.response import format_response
${authMiddlewareImport}
logger = get_logger("${serviceName}:${routeFileName}")
router = APIRouter()

${pydanticModelCode}@router.${method}("${path}", status_code=${statusCode}, tags=["${serviceName}"])\n`;
      routeCode += `async def ${handlerName}(${routeParams}):\n`;
      routeCode += `    """\n`;
      routeCode += `    ${ep.type || "GET"} ${path}\n`;
      routeCode += `    ${summary}\n`;
      routeCode += `    \n`;
      routeCode += `    🤖 AI CODING AGENT DIRECTIVE:\n`;
      if (ep.summary && !ep.summary.startsWith("Handler for ")) {
        routeCode += `    Goal: ${ep.summary.trim()}\n`;
      }

      if (trace.incoming.length > 0) {
        routeCode += `    \n    📥 INBOUND TRIGGER / CALLER:\n`;
        trace.incoming.forEach((inc) => {
          routeCode += `    - ${inc.nodeType}: "${inc.nodeName}" (${inc.detail})\n`;
          if (inc.dataContext)
            routeCode += `      Data Context: ${inc.dataContext}\n`;
        });
      }

      if (trace.outgoing.length > 0) {
        routeCode += `    \n    🔗 RESOURCE DEPENDENCIES:\n`;
        trace.outgoing.forEach((out) => {
          routeCode += `    - ${out.nodeType}: "${out.nodeName}"\n`;
          if (out.dataContext)
            routeCode += `      ${out.dataContext}\n`;
        });
      }

      if (ep.crudOperations && Object.keys(ep.crudOperations).length > 0) {
        const activeOps = Object.entries(ep.crudOperations).filter(
          ([_, ops]) => ops && ops.length > 0,
        );
        if (activeOps.length > 0) {
          routeCode += `    \n    🗄️ DATABASE OPERATIONS REQUIRED:\n`;
          for (const [tableId, ops] of activeOps) {
            const tableNode = allNodes.find((n) => n.id === tableId);
            const tableName =
              tableNode?.data?.label ||
              tableNode?.data?.tableRef ||
              "Unknown Table";
            routeCode += `    - Table [${tableName}]: ${ops.map((o) => o.toUpperCase()).join(", ")}\n`;
            if (ep.crudExplanations && ep.crudExplanations[tableId]) {
              for (const op of ops) {
                const explanation = ep.crudExplanations[tableId][op];
                if (explanation) {
                  routeCode += `      * ${op.toUpperCase()} Context: ${explanation.replace(/\n/g, "\n        ")}\n`;
                }
              }
            }
          }
        }
      }

      routeCode += `    """\n`;
      routeCode += `    try:\n`;
      routeCode += `        logger.info(f"Handling ${ep.type || "GET"} ${path}")\n`;

      const promptText = (ep.businessLogic || ep.prompt || "").trim();
      const codeBlock = (ep.body || ep.code || "").trim();

      if (promptText) {
        routeCode += `        # --- Natural Language Instructions ---\n`;
        promptText.split("\n").forEach((line: string, idx: number) => {
          if (line.trim())
            routeCode += `        # STEP ${idx + 1}: ${line.trim()}\n`;
        });
        routeCode += `\n`;
      } else if (!codeBlock) {
        routeCode += `        # STEP 1: Validate payload and path params\n`;
        routeCode += `        # STEP 2: Execute database query/mutation\n`;
        routeCode += `        # STEP 3: Return response\n`;
      }

      if (codeBlock) {
        routeCode += `        # --- Business Logic Code Execution ---\n`;
        codeBlock.split("\n").forEach((line: string) => {
          routeCode += `        ${line}\n`;
        });
        routeCode += `\n`;
      }

      routeCode += `        return format_response(${responseDataJson}, "${summary}")\n`;
      routeCode += `    except Exception as e:\n`;
      routeCode += `        logger.error(f"Error handling ${ep.type || "GET"} ${path}: {e}")\n`;
      routeCode += `        raise HTTPException(status_code=500, detail=str(e))\n`;

      files.push({
        filename: `routes/${routeFileName}.py`,
        language: "python",
        content: routeCode,
      });

      routeImports.push(
        `from .${routeFileName} import router as ${routeFileName}_router`,
      );
      routeInclusions.push(`router.include_router(${routeFileName}_router)`);
    });
  }

  if (hasAnyAuthRoute) {
    const authCtx = resolveServiceAuthContext(node, allNodes, allEdges);
    files.push({
      filename: "auth_middleware.py",
      language: "python",
      content: generateFastApiMiddleware({
        ...(authCtx.authNode?.data || {}),
        baseUrl: authCtx.authServerUrl,
      }),
    });
  }

  files.push({
    filename: "routes/__init__.py",
    language: "python",
    content: `from fastapi import APIRouter
${routeImports.join("\n")}

router = APIRouter()
${routeInclusions.join("\n")}

__all__ = ["router"]
`,
  });

  return { files, routeFileNames };
}
