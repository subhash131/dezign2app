// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  classifyNodes
// LAYER:   resolvers
// PURPOSE: Splits the raw flat nodes[] array into strongly-typed subsets so
//          every downstream compiler receives only what it needs.
// ═══════════════════════════════════════════════════════════════════════════

import { BackendNode, BackendEdge } from "@/types/canvas";
import { isServiceAssociatedWithAnyWebApp } from "../webClients/nextjs/v16/serviceResolver";

/**
 * All node-subsets produced from the raw canvas node array.
 * Downstream compilers should destructure what they need from this object
 * rather than re-running their own `.filter()` calls.
 */
export interface ClassifiedNodes {
  /** All "service" type nodes — Express / Next.js / FastAPI microservices. */
  serviceNodes: BackendNode[];
  /** All "langgraph" type nodes — Python LangGraph AI agents. */
  langGraphNodes: BackendNode[];
  /** All "entity" or "db_ref" nodes — database table definitions / references. */
  entityNodes: BackendNode[];
  /** All "webPage" nodes — individual Next.js page definitions. */
  webPageNodes: BackendNode[];
  /** All "webApp" nodes — full-stack Next.js web application containers. */
  webAppNodes: BackendNode[];
  /** All "payments" nodes — Creem / payment subscription and billing services. */
  paymentsNodes: BackendNode[];
  /** All "storage" nodes — AWS S3 / Cloudflare R2 / MinIO object storage. */
  storageNodes: BackendNode[];
  /**
   * Service nodes that compile into a standalone microservice app directory.
   *
   * Next.js API services that are associated with a WebApp node get compiled
   * directly into that WebApp package — they are excluded from this list so we
   * don't generate a redundant duplicate service folder for them.
   */
  standaloneServiceNodes: BackendNode[];
}

/**
 * Classifies the flat canvas `nodes[]` array into strongly-typed subsets.
 *
 * @param nodes   - All BackendNode objects from the canvas.
 * @param edges   - All BackendEdge objects (needed for the WebApp association check).
 * @returns       - A `ClassifiedNodes` object with one array per node category.
 *
 * @debugTag classify-step-0
 */
export function classifyNodes(
  nodes: BackendNode[],
  edges: BackendEdge[],
): ClassifiedNodes {
  // ── Primary type filters ────────────────────────────────────────────────
  const serviceNodes = nodes.filter((n) => n.type === "service");
  const langGraphNodes = nodes.filter((n) => n.type === "langgraph");
  const entityNodes = nodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );
  const webPageNodes = nodes.filter((n) => n.type === "webPage");
  const webAppNodes = nodes.filter((n) => n.type === "webApp");
  const paymentsNodes = nodes.filter((n) => n.type === "payments");
  const storageNodes = nodes.filter((n) => n.type === "storage");

  // ── Standalone service filter ───────────────────────────────────────────
  // A "service" node that is connected to a WebApp compiles INTO that WebApp
  // (its routes become Next.js API routes), so it must not also produce a
  // standalone service folder.
  const standaloneServiceNodes = serviceNodes.filter(
    (srvNode) =>
      !isServiceAssociatedWithAnyWebApp(srvNode, webAppNodes, nodes, edges),
  );

  return {
    serviceNodes,
    langGraphNodes,
    entityNodes,
    webPageNodes,
    webAppNodes,
    paymentsNodes,
    storageNodes,
    standaloneServiceNodes,
  };
}
