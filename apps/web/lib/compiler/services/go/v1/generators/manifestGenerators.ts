import { CompiledFile } from "@workspace/canvas/types";

interface ManifestOptions {
  serviceName: string;
  moduleName: string;
  port: string;
  endpoints: { method: string; path: string }[];
}

export function generateManifestFiles(options: ManifestOptions): CompiledFile[] {
  const { serviceName, moduleName, port, endpoints } = options;

  const goModContent = `module ${moduleName}

go 1.23

require (
\tgithub.com/gin-contrib/cors v1.7.2
\tgithub.com/gin-gonic/gin v1.10.0
)
`;

  // Cross-platform GOCACHE fallback resolver (prevents Turborepo environment stripping on Windows)
  const goCacheResolver = "const cp=require('child_process'),p=require('path'),os=require('os');const cache=process.env.GOCACHE||(process.env.LOCALAPPDATA?p.join(process.env.LOCALAPPDATA,'go-build'):p.join(os.homedir(),'.cache','go-build'));const env={...process.env,GOCACHE:cache};";

  const packageJsonContent = JSON.stringify(
    {
      name: `@workspace/${moduleName}`,
      version: "0.0.1",
      private: true,
      scripts: {
        postinstall: `node -e "try{${goCacheResolver}cp.execSync('go mod tidy',{stdio:'inherit',env})}catch(e){}"`,
        dev: `node -e "${goCacheResolver}try{cp.execSync('air',{stdio:'inherit',env})}catch(e){cp.execSync('go run .',{stdio:'inherit',env})}"`,
        build: `node -e "${goCacheResolver}cp.execSync('go mod tidy && go build -o bin/server .',{stdio:'inherit',env})"`,
        start: "./bin/server",
        test: "go test -v ./...",
      },
      dependencies: {},
    },
    null,
    2,
  );

  const airTomlContent = `root = "."
tmp_dir = "tmp"

[build]
  bin = "./tmp/main"
  cmd = "go build -o ./tmp/main ."
  delay = 1000
  exclude_dir = ["assets", "tmp", "vendor", "bin"]
  include_ext = ["go", "tpl", "tmpl", "html"]
  exclude_regex = ["_test.go"]
  stop_on_error = true

[color]
  main = "magenta"
  watcher = "cyan"
  build = "yellow"
  runner = "green"
`;

  let endpointTable = "| Method | Path |\n| :--- | :--- |\n";
  endpoints.forEach((ep) => {
    endpointTable += `| \`${ep.method}\` | \`${ep.path}\` |\n`;
  });

  const readmeContent = `# ${serviceName} (Go / Gin)

A high-performance Go microservice compiled by Dezign2App.

## Endpoints

${endpointTable}

## Local Development

### Requirements
- [Go 1.23+](https://go.dev/dl/)
- Optional: [Air](https://github.com/air-verse/air) for live reloading (\`go install github.com/air-verse/air@latest\`)

### Run Locally
\`\`\`bash
# Build binary (automatically resolves dependencies and creates go.sum)
go mod tidy
go build -o bin/server .

# Run server
go run .

# Or run with live reload
air
\`\`\`

The server will listen on port **${port || "8080"}**.
`;

  return [
    {
      filename: "go.mod",
      language: "go",
      content: goModContent,
    },
    {
      filename: "package.json",
      language: "json",
      content: packageJsonContent,
    },
    {
      filename: ".air.toml",
      language: "toml",
      content: airTomlContent,
    },
    {
      filename: "README.md",
      language: "markdown",
      content: readmeContent,
    },
  ];
}
