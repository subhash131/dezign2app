import { Endpoint, CompiledFile } from "@workspace/canvas/types";
import { parseSchemaJson } from "../../../../utils";
import {
  toPascalCase,
  toCamelCase,
  toGoFieldName,
  convertGinPathParams,
  toGoRouteFileName,
  toGoHandlerName,
} from "./utils";

interface GenerateRoutesOptions {
  serviceName: string;
  moduleName: string;
  nodeEndpoints: (Endpoint & { nodeId?: string })[];
  requestModelMap: Map<string, string>;
  responseModelMap: Map<string, string>;
}

export function generateRoutes(options: GenerateRoutesOptions): {
  files: CompiledFile[];
  routeRegistrations: { method: string; path: string; handlerName: string }[];
} {
  const { serviceName, moduleName, nodeEndpoints, requestModelMap, responseModelMap } = options;
  const files: CompiledFile[] = [];
  const routeRegistrations: { method: string; path: string; handlerName: string }[] = [];
  const usedFileNames = new Set<string>();

  // 1. Health Check Route
  const hasExplicitHealth = nodeEndpoints.some(
    (ep) => (ep.name || "").trim().toLowerCase() === "/health",
  );

  if (!hasExplicitHealth) {
    files.push({
      filename: "routes/health.go",
      language: "go",
      content: `package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthHandler returns the health status of the service
func HealthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "${serviceName}",
	})
}
`,
    });
    routeRegistrations.push({
      method: "GET",
      path: "/health",
      handlerName: "HealthHandler",
    });
  }

  // 2. Process each endpoint
  nodeEndpoints.forEach((ep, index) => {
    const rawMethod = (ep.type || "GET").toUpperCase();
    const ginMethod = rawMethod === "ALL" ? "Any" : rawMethod;
    const rawPath = ep.name || `/endpoint_${index + 1}`;
    const ginPath = convertGinPathParams(rawPath);
    const handlerName = toGoHandlerName(rawMethod, rawPath, index);

    let routeFileName = toGoRouteFileName(rawMethod, rawPath, index);
    if (usedFileNames.has(routeFileName)) {
      routeFileName = routeFileName.replace(/\.go$/, `_${index + 1}.go`);
    }
    usedFileNames.add(routeFileName);

    routeRegistrations.push({
      method: ginMethod,
      path: ginPath,
      handlerName,
    });

    const requestModel = requestModelMap.get(ep.id);
    const responseModel = responseModelMap.get(ep.id);

    const imports = new Set<string>(['"net/http"', '"github.com/gin-gonic/gin"']);
    if (requestModel || responseModel) {
      imports.add(`"${moduleName}/models"`);
    }

    let paramParsingCode = "";
    let strconvNeeded = false;

    // --- A. Path Parameters ---
    const pathParams = ep.pathParams || [];
    if (pathParams.length > 0) {
      paramParsingCode += `\t// --- 1. Path Parameters ---\n`;
      pathParams.forEach((param) => {
        const varName = toCamelCase(param.name);
        const pType = (param.type || "string").toLowerCase();

        if (pType === "int" || pType === "integer" || pType === "number") {
          strconvNeeded = true;
          paramParsingCode += `\t${varName}Str := c.Param("${param.name}")\n`;
          paramParsingCode += `\t${varName}, err := strconv.ParseInt(${varName}Str, 10, 64)\n`;
          paramParsingCode += `\tif err != nil {\n\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Path parameter '${param.name}' must be an integer"})\n\t\treturn\n\t}\n`;
        } else {
          paramParsingCode += `\t${varName} := c.Param("${param.name}")\n`;
          if (param.required) {
            paramParsingCode += `\tif ${varName} == "" {\n\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Path parameter '${param.name}' is required"})\n\t\treturn\n\t}\n`;
          }
        }
      });
      paramParsingCode += `\n`;
    }

    // --- B. Query Parameters ---
    const queryParams = ep.queryParams || [];
    if (queryParams.length > 0) {
      paramParsingCode += `\t// --- 2. Query Parameters ---\n`;
      queryParams.forEach((param) => {
        const varName = toCamelCase(param.name);
        const pType = (param.type || "string").toLowerCase();
        const defaultVal = param.defaultValue ?? "";

        if (pType === "int" || pType === "integer") {
          strconvNeeded = true;
          paramParsingCode += `\tvar ${varName} int64\n`;
          paramParsingCode += `\tif ${varName}Raw := c.Query("${param.name}"); ${varName}Raw != "" {\n`;
          paramParsingCode += `\t\tval, err := strconv.ParseInt(${varName}Raw, 10, 64)\n`;
          paramParsingCode += `\t\tif err != nil {\n\t\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter '${param.name}' must be an integer"})\n\t\t\treturn\n\t\t}\n`;
          paramParsingCode += `\t\t${varName} = val\n`;
          if (param.required) {
            paramParsingCode += `\t} else {\n\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter '${param.name}' is required"})\n\t\treturn\n\t}\n`;
          } else {
            paramParsingCode += `\t}\n`;
          }
        } else {
          if (defaultVal) {
            paramParsingCode += `\t${varName} := c.DefaultQuery("${param.name}", "${defaultVal}")\n`;
          } else {
            paramParsingCode += `\t${varName} := c.Query("${param.name}")\n`;
            if (param.required) {
              paramParsingCode += `\tif ${varName} == "" {\n\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter '${param.name}' is required"})\n\t\treturn\n\t}\n`;
            }
          }
        }
      });
      paramParsingCode += `\n`;
    }

    // --- C. Request Headers ---
    const headers = ep.headers || [];
    if (headers.length > 0) {
      paramParsingCode += `\t// --- 3. Request Headers ---\n`;
      headers.forEach((h) => {
        const varName = toCamelCase(h.name.replace(/-/g, "_"));
        paramParsingCode += `\t${varName} := c.GetHeader("${h.name}")\n`;
        if (h.required) {
          paramParsingCode += `\tif ${varName} == "" {\n\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Header '${h.name}' is required"})\n\t\treturn\n\t}\n`;
        }
      });
      paramParsingCode += `\n`;
    }

    // --- D. Request Body Binding ---
    let bodyBindingCode = "";
    if (requestModel) {
      bodyBindingCode += `\t// --- 4. Request Body Binding ---\n`;
      bodyBindingCode += `\tvar req models.${requestModel}\n`;
      bodyBindingCode += `\tif err := c.ShouldBindJSON(&req); err != nil {\n`;
      bodyBindingCode += `\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})\n`;
      bodyBindingCode += `\t\treturn\n`;
      bodyBindingCode += `\t}\n\n`;
    }

    // --- E. Response Return ---
    let statusCode = "http.StatusOK";
    if (rawMethod === "POST") statusCode = "http.StatusCreated";
    if (rawMethod === "DELETE" && !responseModel) statusCode = "http.StatusOK";

    let responseCode = "";
    if (responseModel) {
      responseCode = `\t// --- 5. Return Response ---\n\tresp := models.${responseModel}{}\n\tc.JSON(${statusCode}, resp)\n`;
    } else {
      const parsedRes = parseSchemaJson(ep.responseBody?.rawJson);
      if (parsedRes && typeof parsedRes === "object") {
        // Emit sample data map
        const jsonStr = JSON.stringify(parsedRes, null, 2)
          .split("\n")
          .map((line, i) => (i === 0 ? line : `\t\t${line}`))
          .join("\n");
        responseCode = `\t// --- 5. Return Response ---\n\tc.JSON(${statusCode}, gin.H{\n\t\t"data": ${jsonStr},\n\t})\n`;
      } else {
        responseCode = `\t// --- 5. Return Response ---\n\tc.JSON(${statusCode}, gin.H{\n\t\t"success": true,\n\t\t"message": "Successfully executed ${rawMethod} ${ginPath}",\n\t})\n`;
      }
    }

    if (strconvNeeded) {
      imports.add('"strconv"');
    }

    const fileContent = `package routes

import (
\t${Array.from(imports).sort().join("\n\t")}
)

// ${handlerName} handles ${rawMethod} ${ginPath}
// ${ep.summary || "Endpoint handler"}
func ${handlerName}(c *gin.Context) {
${paramParsingCode}${bodyBindingCode}${responseCode}}
`;

    files.push({
      filename: `routes/${routeFileName}`,
      language: "go",
      content: fileContent,
    });
  });

  // 3. Generate router.go with RegisterRoutes
  let routerContent = `package routes

import (
\t"github.com/gin-gonic/gin"
)

// RegisterRoutes registers all service endpoints with the Gin engine
func RegisterRoutes(r *gin.Engine) {
`;

  routeRegistrations.forEach((reg) => {
    routerContent += `\tr.${reg.method}("${reg.path}", ${reg.handlerName})\n`;
  });

  routerContent += `}\n`;

  files.push({
    filename: "routes/router.go",
    language: "go",
    content: routerContent,
  });

  return {
    files,
    routeRegistrations,
  };
}

