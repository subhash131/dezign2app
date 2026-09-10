"use client";

import { useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { compileMonorepo, CompiledMonorepoResult } from "@/lib/compiler";
import { ServiceEndpoint } from "../types";

export function useMonorepoEndpoints(projectName: string = "Dezign2App") {
  // Zustand Store selectors
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);
  const edges = useBackendCanvasStore((s) => s.edges);
  const testCases = useSimulationStore((s) => s.testCases);

  // Formatted project name
  const formattedProjectName = useMemo(() => {
    const raw = projectName.trim();
    return raw.toLowerCase().endsWith("monorepo") ? raw : `${raw} Monorepo`;
  }, [projectName]);

  // Compile Monorepo result on demand
  const monorepoResult: CompiledMonorepoResult = useMemo(() => {
    return compileMonorepo(nodes, endpoints, events, edges, testCases, formattedProjectName);
  }, [nodes, endpoints, events, edges, testCases, formattedProjectName]);

  const files = monorepoResult.files;

  // Extract active service endpoint URLs for direct browser navigation
  const serviceEndpoints: ServiceEndpoint[] = useMemo(() => {
    const list: ServiceEndpoint[] = [];
    const webClients = monorepoResult.webClients || [];
    const services = monorepoResult.services || [];

    // Web Clients
    webClients.forEach((w, idx) => {
      const port = idx === 0 ? "3000" : `${3000 + idx}`;
      list.push({
        name: w.name || "Web Application",
        port,
        url: `http://localhost:${port}`,
        type: "web",
      });
    });

    // Backend Microservices
    services.forEach((s) => {
      const srvEnvFile = files.find(
        (f) =>
          f.filename === `apps/${s.folderName}/.env.example` ||
          f.filename === `apps/${s.folderName}/.env`,
      );
      let port = "8080";
      if (srvEnvFile) {
        const match = srvEnvFile.content.match(/^PORT=(\d+)/m);
        if (match && match[1]) port = match[1];
      }
      list.push({
        name: s.name,
        port,
        url: `http://localhost:${port}`,
        healthUrl: `http://localhost:${port}/health`,
        docsUrl: `http://localhost:${port}/docs`,
        type: "service",
      });
    });

    // Infrastructure: DB / Redis / Kafka (only if actually configured in docker-compose)
    const composeFile = files.find(
      (f) => f.filename === "docker-compose.yml" || f.filename === "docker-compose.infra.yml",
    );
    const composeContent = composeFile?.content || "";

    if (
      composeContent.includes("image: postgres") ||
      composeContent.includes("container_name: postgres") ||
      nodes.some((n) => {
        if (n.type !== "database") return false;
        const engine = (n.data?.dbEngine || n.data?.provider || n.data?.dbType || "").toLowerCase();
        return engine.includes("postgres") || engine.includes("pg");
      })
    ) {
      list.push({
        name: "PostgreSQL",
        port: "5432",
        url: "postgresql://localhost:5432",
        type: "db",
      });
    }

    if (
      composeContent.includes("image: redis") ||
      composeContent.includes("container_name: redis") ||
      nodes.some((n) => (n.data?.label || "").toLowerCase().includes("redis"))
    ) {
      list.push({
        name: "Redis",
        port: "6379",
        url: "redis://localhost:6379",
        type: "redis",
      });
    }

    if (
      composeContent.includes("kafka") ||
      nodes.some((n) => (n.data?.label || "").toLowerCase().includes("kafka"))
    ) {
      list.push({
        name: "Kafka",
        port: "9092",
        url: "localhost:9092",
        type: "kafka",
      });
    }

    return list;
  }, [monorepoResult, files, nodes]);

  return {
    formattedProjectName,
    monorepoResult,
    files,
    serviceEndpoints,
  };
}
