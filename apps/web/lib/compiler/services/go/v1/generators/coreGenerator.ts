import { CompiledFile } from "@workspace/canvas/types";

interface CoreGeneratorOptions {
  serviceName: string;
  moduleName: string;
  port: string;
  cors: boolean;
  corsOrigins: string;
}

export function generateCoreFiles(options: CoreGeneratorOptions): CompiledFile[] {
  const { serviceName, moduleName, port, cors, corsOrigins } = options;

  let corsSnippet = "";
  if (cors) {
    if (corsOrigins === "*" || !corsOrigins) {
      corsSnippet = `\t// CORS middleware configuration
\tconfig := cors.DefaultConfig()
\tconfig.AllowAllOrigins = true
\tconfig.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"}
\tconfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
\tr.Use(cors.New(config))
`;
    } else {
      const originsArray = corsOrigins
        .split(",")
        .map((o) => `"${o.trim()}"`)
        .join(", ");
      corsSnippet = `\t// CORS middleware configuration
\tconfig := cors.DefaultConfig()
\tconfig.AllowOrigins = []string{${originsArray}}
\tconfig.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"}
\tconfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
\tconfig.AllowCredentials = true
\tr.Use(cors.New(config))
`;
    }
  }

  const mainGo = `package main

import (
\t"context"
\t"log"
\t"net/http"
\t"os"
\t"os/signal"
\t"syscall"
\t"time"

${cors ? '\t"github.com/gin-contrib/cors"\n' : ""}\t"github.com/gin-gonic/gin"
\t"${moduleName}/routes"
)

func main() {
\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "${port || "8080"}"
\t}

\tr := gin.Default()

${corsSnippet}
\t// Register all endpoint routes
\troutes.RegisterRoutes(r)

\tsrv := &http.Server{
\t\tAddr:    ":" + port,
\t\tHandler: r,
\t}

\t// Start server in background goroutine
\tgo func() {
\t\tlog.Printf("[${serviceName}] Server starting on port %s...", port)
\t\tif err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
\t\t\tlog.Fatalf("Server failed to start: %v", err)
\t\t}
\t}()

\t// Wait for interrupt signal for graceful shutdown
\tquit := make(chan os.Signal, 1)
\tsignal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
\t<-quit
\tlog.Println("[${serviceName}] Shutting down gracefully...")

\tctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
\tdefer cancel()

\tif err := srv.Shutdown(ctx); err != nil {
\t\tlog.Fatalf("Server forced to shutdown: %v", err)
\t}

\tlog.Println("[${serviceName}] Server exited cleanly")
}
`;

  const configGo = `package config

import (
\t"os"
)

// Config stores application configuration
type Config struct {
\tPort string
\tEnv  string
}

// LoadConfig loads environment configuration
func LoadConfig() *Config {
\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "${port || "8080"}"
\t}

\tenv := os.Getenv("NODE_ENV")
\tif env == "" {
\t\tenv = "development"
\t}

\treturn &Config{
\t\tPort: port,
\t\tEnv:  env,
\t}
}
`;

  return [
    {
      filename: "main.go",
      language: "go",
      content: mainGo,
    },
    {
      filename: "config/config.go",
      language: "go",
      content: configGo,
    },
  ];
}

