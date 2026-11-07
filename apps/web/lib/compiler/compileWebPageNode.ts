import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledWebPageResult } from "@workspace/canvas/types";
import {
  compileNextjsV16WebClient,
  resolveLinkedEndpoint,
  resolvePageRefLink,
  getServicePort,
  resolveStoreActionBindings,
  LinkedEndpointInfo,
  LinkedPageRefInfo,
} from "./webClients/nextjs/v16";

export {
  resolveLinkedEndpoint,
  resolvePageRefLink,
  getServicePort,
  resolveStoreActionBindings,
};
export type { LinkedEndpointInfo, LinkedPageRefInfo };

/**
 * Compiles a single WebPage node into a project based on techStack and techVersion
 */
export function compileWebPageNode(
  webPageNode: BackendNode,
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  projectName: string = "Dezign2App Monorepo",
  testCases: SimulationTestCase[] = [],
  appSlug?: string,
  webAppNode?: BackendNode,
): CompiledWebPageResult {
  return compileWebPageNodes(
    [webPageNode],
    endpoints,
    events,
    allNodes.length > 0 ? allNodes : [webPageNode],
    allEdges,
    projectName,
    testCases,
    appSlug,
    webAppNode,
  );
}

/**
 * Compiles a collection of WebPage nodes into a project based on techStack and techVersion
 */
export function compileWebPageNodes(
  webPageNodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  projectName: string = "Dezign2App Monorepo",
  testCases: SimulationTestCase[] = [],
  appSlug?: string,
  webAppNode?: BackendNode,
): CompiledWebPageResult {
  return compileNextjsV16WebClient(
    webPageNodes,
    endpoints,
    events,
    allNodes,
    allEdges,
    projectName,
    testCases,
    appSlug,
    webAppNode,
  );
}
