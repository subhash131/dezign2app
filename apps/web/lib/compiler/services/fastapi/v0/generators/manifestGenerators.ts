import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile } from "@workspace/canvas/types";
import { resolveEndpointTrace } from "../../../../traceResolver";
import { resolveServiceAuthContext } from "../../../../generators/routeGenerator/handlers/authResolver";
import { toEnvVarName } from "../../../../utils";

interface ManifestGeneratorsOptions {
  node: BackendNode;
  serviceName: string;
  sanitizedName: string;
  port: string;
  nodeEndpoints: (Endpoint & { nodeId: string })[];
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  endpoints: (Endpoint & { nodeId: string })[];
}

export function generateManifestFiles({
  node,
  serviceName,
  sanitizedName,
  port,
  nodeEndpoints,
  allNodes,
  allEdges,
  endpoints,
}: ManifestGeneratorsOptions): CompiledFile[] {
  const files: CompiledFile[] = [];

  const authCtx = resolveServiceAuthContext(node, allNodes, allEdges);
  const authDeps = authCtx.authNode ? "PyJWT[crypto]>=2.8.0\n" : "";

  files.push({
    filename: "requirements.txt",
    language: "plaintext",
    content: `fastapi>=0.110.0
uvicorn[standard]>=0.28.0
pydantic>=2.6.0
httpx>=0.27.0
${authDeps}pytest>=8.0.0
pytest-asyncio>=0.23.5
python-dotenv>=1.0.1
`,
  });

  files.push({
    filename: "pyproject.toml",
    language: "toml",
    content: `[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "${sanitizedName}"
version = "0.1.0"
description = "${node.data?.description || `FastAPI microservice for ${serviceName}`}"
readme = "README.md"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.28.0",
    "pydantic>=2.6.0",
    "httpx>=0.27.0",
${authCtx.authNode ? '    "PyJWT[crypto]>=2.8.0",\n' : ""}    "python-dotenv>=1.0.1"
]

[tool.pytest.ini_options]
minversion = "8.0"
addopts = "-ra -q"
testpaths = [
    "tests",
]
`,
  });

  const connectedServiceEnvLines: string[] = [];
  allEdges.forEach((edge) => {
    if (edge.source === node.id) {
      const targetNode = allNodes.find(
        (n) => n.id === edge.target && n.type === "service",
      );
      if (targetNode) {
        const tgtData = targetNode.data;
        const tgtServer = tgtData?.server || tgtData?.serverConfig;
        const tgtLabel = tgtData?.label || targetNode.id;
        const tgtPort = String(tgtData?.port ?? tgtServer?.port ?? "8080");
        const envVarName = `${toEnvVarName(tgtLabel)}_BASE_URL`;
        connectedServiceEnvLines.push(`${envVarName}=http://localhost:${tgtPort}`);
      }
    }
  });

  const connectedEnvString =
    connectedServiceEnvLines.length > 0
      ? `\n# Connected Services\n${connectedServiceEnvLines.join("\n")}\n`
      : "";
  const authEnvString = authCtx.authNode
    ? `\n# Auth Server / JWKS Verification\nAUTH_SERVER_URL=${authCtx.authServerUrl}\nBETTER_AUTH_URL=${authCtx.authServerUrl}\nJWKS_URL=${authCtx.authServerUrl}/api/auth/jwks\n`
    : "";

  files.push({
    filename: ".env",
    language: "dotenv",
    content: `PORT=${port}\nENVIRONMENT=development\nLOG_LEVEL=info\n${connectedEnvString}${authEnvString}`,
  });

  files.push({
    filename: ".gitignore",
    language: "gitignore",
    content: `__pycache__/\n*.py[cod]\n*$py.class\n.pytest_cache/\n.env\nvenv/\n.venv/\n`,
  });

  let readmeLines = [
    `# ${serviceName} Microservice (FastAPI)`,
    ``,
    `Port: \`${port}\``,
    `Framework: **FastAPI (Python)**`,
    `Description: ${node.data?.description || "Modular FastAPI microservice compiled from Dezign2App architecture canvas."}`,
    ``,
    `## Project Structure`,
    ``,
    `\`\`\``,
    `apps/${sanitizedName}/`,
    `├── main.py                     # Entry point server file`,
    `├── core/                       # Config, logger, and format response helpers`,
    `├── routes/                     # Modular route handlers (1 file per route)`,
    `├── consumers/                  # Event consumer handlers`,
    `├── producers/                  # Event producer helper functions`,
    `└── tests/unit/                 # Unit test suite (1 file per route test)`,
    `\`\`\``,
    ``,
    `## Getting Started`,
    ``,
    `1. **Create virtual environment & install dependencies**:`,
    `   \`\`\`bash`,
    `   python -m venv venv`,
    `   source venv/bin/activate  # On Windows: venv\\Scripts\\activate`,
    `   pip install -r requirements.txt`,
    `   \`\`\``,
    ``,
    `2. **Run server**:`,
    `   \`\`\`bash`,
    `   python main.py`,
    `   # or: uvicorn main:app --reload --port ${port}`,
    `   \`\`\``,
    ``,
    `3. **Interactive API Documentation**:`,
    `   - Swagger UI: http://localhost:${port}/docs`,
    `   - ReDoc: http://localhost:${port}/redoc`,
    ``,
    `4. **Run Unit Tests**:`,
    `   \`\`\`bash`,
    `   pytest`,
    `   \`\`\``,
    ``,
    `## Connected Routes & Endpoint Data Flow`,
    ``,
  ];

  if (nodeEndpoints.length === 0) {
    readmeLines.push(`- Health route: \`GET /health\``);
  } else {
    nodeEndpoints.forEach((ep) => {
      const trace = resolveEndpointTrace(
        node,
        ep,
        allNodes,
        allEdges,
        endpoints,
      );
      readmeLines.push(
        `### \`${(ep.type || "GET").toUpperCase()} ${ep.name || "/"}\``,
      );
      readmeLines.push(`- **Summary**: ${ep.summary || "Endpoint handler"}`);
      readmeLines.push(`- **Incoming Callers**:`);
      if (trace.incoming.length > 0) {
        trace.incoming.forEach((inc) => {
          readmeLines.push(
            `  - ${inc.nodeName} (${inc.nodeType}): ${inc.detail}`,
          );
        });
      } else {
        readmeLines.push(`  - Direct HTTP Clients`);
      }
      readmeLines.push(`- **Outgoing Destinations**:`);
      if (trace.outgoing.length > 0) {
        trace.outgoing.forEach((out) => {
          readmeLines.push(
            `  - ${out.nodeName} (${out.nodeType}): ${out.detail}`,
          );
        });
      } else {
        readmeLines.push(`  - HTTP Response`);
      }
      readmeLines.push(``);
    });
  }

  files.push({
    filename: "README.md",
    language: "markdown",
    content: readmeLines.join("\n"),
  });

  return files;
}
