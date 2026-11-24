import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  CompiledFile,
  CompiledWebPageResult,
  PageSection,
  UIEventItem,
  StoreActionBinding,
  FrontendActionStepDraft,
  GlobalStoreField,
  GlobalStoreAction,
  StoreActionType,
  StateVariableType,
  JsonValue,
} from "@workspace/canvas/types";
import { generateWebClientE2ETests } from "../../../generators/testGenerator";

import {
  LinkedEndpointInfo,
  LinkedPageRefInfo,
  LinkedRealtimeConnectionInfo,
  PageInfo,
} from "./types";
import { getServicePort, resolveLinkedEndpoint, resolvePageRefLink } from "./endpointResolver";
import { generateProjectConfigFiles } from "./configTemplates";
import { generateEnvFilesForNode } from "@/lib/compiler/generators/generateEnvFile";
import { generateRootLayout, generateRouteGroupLayouts } from "./layoutGenerators";
import { generateLayoutEventsDrawer } from "./page-generators";
import { generateProxy } from "./middlewareTemplate";
import { resolvePagesInfo } from "./pageResolver";
import {
  resolveConnectedAuthNode,
  generateAuthFilesAndDependencies,
  ensureDatabaseDependencies,
} from "./authFileGenerator";
import {
  generatePaymentsFilesAndDependencies,
} from "./paymentsFileGenerator";
import {
  generatePageAndComponentFiles,
  ensureTransformerDependencies,
} from "./pageFileGenerator";
import { generateZustandStores, toPascalCase } from "./storeGenerators";
import { generateBrowserStorageHelper } from "./browserStorageGenerator";
import { resolveAppProviders } from "./providerGenerators";
import { isServiceAssociatedWithWebApp } from "./serviceResolver";
import { generateNextjsRoutes } from "../../../services/nextjs/v16/routeGenerator";
import { CustomTypeItem, GlobalStoreDefinition, NodeDependencyItem } from "@workspace/canvas/types";
import {
  resolveStoreActionBindings,
  isValidStoreActionType,
  isArrayTargetField,
  isNumberTargetField,
  isBooleanTargetField,
} from "./storeActionResolver";

export type {
  LinkedEndpointInfo,
  LinkedPageRefInfo,
  LinkedRealtimeConnectionInfo,
  PageInfo,
};
export {
  getServicePort,
  resolveLinkedEndpoint,
  resolvePageRefLink,
  resolveStoreActionBindings,
};

/**
 * Compiles WebClient nodes into Next.js App Router (v16.4.6) project structure
 */
export function compileNextjsV16WebClient(
  webClientNodes: BackendNode[],
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
  const files: CompiledFile[] = [];

  // Enrich webClientNodes with storeActionBinding inferred from canvas edges between
  // StateStoreNode handles (populate, mutate, reset, store-action-*) and WebPageNode action handles
  const enrichedWebClientNodes = resolveStoreActionBindings(
    webClientNodes,
    allNodes,
    allEdges,
  );

  const enrichedNodeMap = new Map(enrichedWebClientNodes.map((n) => [n.id, n]));
  const enrichedAllNodes = allNodes.map((n) => {
    if (n.type === "webPage") {
      const match = enrichedNodeMap.get(n.id);
      if (match) return match;
      return resolveStoreActionBindings([n], allNodes, allEdges)[0] || n;
    }
    return n;
  });

  const effectiveAppSlug =
    appSlug ||
    webAppNode?.data?.appSlug ||
    (webAppNode?.data?.label
      ? webAppNode.data.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      : undefined) ||
    enrichedWebClientNodes[0]?.data.appSlug ||
    "web-app";

  // 0. Resolve the specific AuthNode connected to THIS WebApp (or its pages)
  const authNode = resolveConnectedAuthNode(
    webAppNode,
    enrichedWebClientNodes,
    enrichedAllNodes,
    allEdges,
  );

  // 1. Resolve Page Metadata and Routes
  const pagesInfo = resolvePagesInfo(
    enrichedWebClientNodes,
    enrichedAllNodes,
    allEdges,
    effectiveAppSlug,
    webAppNode,
    authNode,
    endpoints,
    events,
  );

  // 2. Generate Route Group Layouts
  files.push(
    ...generateRouteGroupLayouts(
      pagesInfo,
      Boolean(authNode),
      webAppNode,
      enrichedAllNodes,
      allEdges,
      authNode,
      endpoints,
    ),
  );

  // 2.5 Resolve State Store Nodes, Global Stores (Zustand) & App Providers (Context)
  const appGlobalStores: GlobalStoreDefinition[] = webAppNode?.data?.globalStores || [];
  const pageStores: GlobalStoreDefinition[] = enrichedWebClientNodes.flatMap((p) => p.data?.pageStores || []);

  // Gather state_store nodes associated with this webApp
  const webClientNodeIds = new Set(enrichedWebClientNodes.map((p) => p.id));
  const isStateStore = (n: BackendNode) => {
    const t: string = n.type;
    return t === "state_store" || t === "stateStore" || t === "StateStoreNode";
  };
  const allStateStoreNodes = (allNodes || []).filter(isStateStore);

  const allPageAndLayoutNodes = enrichedAllNodes.filter((p) => p.type === "webPage");
  const allActionsInApp: UIEventItem[] = allPageAndLayoutNodes.flatMap((p) => [
    ...(p.data?.sections || []).flatMap((s: PageSection) => s.actions || []),
    ...(p.data?.events || []),
  ]);

  const associatedStateStoreNodes = allStateStoreNodes.filter((n) => {
    // 1. Direct targetWebAppId matching
    if (n.data?.targetWebAppId && webAppNode?.id && n.data.targetWebAppId === webAppNode.id) {
      return true;
    }

    const belongsToOtherApp = Boolean(
      n.data?.targetWebAppId &&
      webAppNode?.id &&
      n.data.targetWebAppId !== webAppNode.id &&
      (allNodes || []).some(
        (otherApp) => otherApp.type === "webApp" && otherApp.id === n.data?.targetWebAppId,
      ),
    );

    // 2. Direct edge to webAppNode
    const hasWebAppEdge = (allEdges || []).some(
      (e) =>
        (e.source === webAppNode?.id && e.target === n.id) ||
        (e.target === webAppNode?.id && e.source === n.id)
    );
    if (hasWebAppEdge) return true;

    // 3. Edge to any page belonging to this webApp
    const hasPageEdge = (allEdges || []).some(
      (e) =>
        (webClientNodeIds.has(e.source) && e.target === n.id) ||
        (webClientNodeIds.has(e.target) && e.source === n.id)
    );
    if (hasPageEdge) return true;

    // 3.5 Action has storeActionBinding or actionSteps referencing this store
    const storeLabel = (n.data?.label || "").trim().toLowerCase();
    const storeName = (n.data?.storeName || "").trim().toLowerCase();
    const cleanLabel = storeLabel.replace(/store$/i, "");
    const cleanName = storeName.replace(/store$/i, "");

    const hasActionBinding = allActionsInApp.some((a: UIEventItem) => {
      const bindings: StoreActionBinding[] = [
        ...(a.storeActionBinding ? [a.storeActionBinding] : []),
        ...(a.storeActionBindings || []),
      ];
      if (
        bindings.some((b: StoreActionBinding) => {
          if (b.storeNodeId === n.id) return true;
          if (b.storeName) {
            const bClean = b.storeName.toLowerCase().replace(/store$/i, "");
            return (
              b.storeName.toLowerCase() === storeLabel ||
              b.storeName.toLowerCase() === storeName ||
              (cleanLabel && bClean === cleanLabel) ||
              (cleanName && bClean === cleanName)
            );
          }
          return false;
        })
      ) {
        return true;
      }

      return (a.actionSteps || []).some((s: FrontendActionStepDraft) => {
        if (s.type !== "state_mutation") return false;
        if (s.stateStoreNodeId === n.id) return true;
        const extraName = "stateStoreName" in s && typeof s.stateStoreName === "string" ? s.stateStoreName : "";
        const extraLabel = "stateStoreLabel" in s && typeof s.stateStoreLabel === "string" ? s.stateStoreLabel : "";
        const stepStore = (s.stateStoreNodeId || extraName || extraLabel).toLowerCase();
        if (
          stepStore &&
          (stepStore === storeLabel ||
            stepStore === storeName ||
            (cleanLabel && stepStore.replace(/store$/i, "") === cleanLabel) ||
            (cleanName && stepStore.replace(/store$/i, "") === cleanName))
        ) {
          return true;
        }
        if (s.stateKey || s.stateTargetFieldId) {
          return (n.data?.fields || []).some(
            (f: GlobalStoreField) => f.name === s.stateKey || f.id === s.stateTargetFieldId,
          );
        }
        return false;
      });
    });
    if (hasActionBinding) return true;

    // If explicitly bound to another webApp in the graph, do not leak via fallbacks
    if (belongsToOtherApp) return false;

    // 4. Fallback: If only 1 state store node in graph, include it
    if (allStateStoreNodes.length === 1) return true;

    // 5. Fallback: If only 1 webApp in graph, include unassigned stores
    const allWebApps = (allNodes || []).filter((node) => node.type === "webApp");
    if (allWebApps.length <= 1) return true;

    return false;
  });

  const localStorePaths: Record<string, string> = {};
  const graphStateStores: GlobalStoreDefinition[] = associatedStateStoreNodes.map((sn) => {
    const d = sn.data || {};
    const storeName = d.storeName || d.label || "App";
    const rawStorage = d.storage;
    const storage: "memory" | "localStorage" | "sessionStorage" =
      rawStorage === "localStorage" || rawStorage === "sessionStorage"
        ? rawStorage
        : "memory";
    const rawScope = d.scope;
    const scope: "global" | "local" = rawScope === "local" ? "local" : "global";

    // If local store, attempt to map to connected or target page
    let targetPage = enrichedWebClientNodes.find((p) => p.id === d.targetPageId);
    if (!targetPage) {
      const connectedPageEdge = (allEdges || []).find(
        (e) =>
          (webClientNodeIds.has(e.source) && e.target === sn.id) ||
          (webClientNodeIds.has(e.target) && e.source === sn.id)
      );
      if (connectedPageEdge) {
        const pageId = webClientNodeIds.has(connectedPageEdge.source)
          ? connectedPageEdge.source
          : connectedPageEdge.target;
        targetPage = enrichedWebClientNodes.find((p) => p.id === pageId);
      }
    }

    if (scope === "local" && targetPage) {
      const matchedPageInfo = pagesInfo.find((p) => p.nodeId === targetPage?.id);
      const rawPagePath = matchedPageInfo
        ? (matchedPageInfo.isRoot ? "" : matchedPageInfo.slug)
        : (targetPage.data?.label || targetPage.data?.path || "page");
      const pagePath = rawPagePath.replace(/^\//, "").trim();
      const baseName = toPascalCase(storeName);
      const storeCompName = baseName.endsWith("Store") ? baseName : `${baseName}Store`;
      localStorePaths[sn.id] = pagePath ? `app/${pagePath}/_stores/use${storeCompName}.ts` : `app/_stores/use${storeCompName}.ts`;
    }

    return {
      id: sn.id,
      name: storeName,
      description: d.description,
      fields: d.fields || [],
      actions: d.actions || [],
      storage,
      scope,
      targetPageId: targetPage?.id || d.targetPageId,
      disabledDefaultManipulators: d.disabledDefaultManipulators,
      deletedDefaultManipulators: d.deletedDefaultManipulators,
      customTypes: d.customTypes,
    };
  });

  // Extract custom types from types nodes across canvas, prioritizing user custom types over auto-derived package/entity types
  const userCustomTypes: CustomTypeItem[] = [];
  const autoDerivedCustomTypes: CustomTypeItem[] = [];
  (allNodes || []).forEach((n) => {
    if (n.type === "types" && Array.isArray(n.data?.types)) {
      const d = n.data;
      const isAutoDerived =
        n.id === "types-entity-schemas" ||
        d?.isEntitySchemas ||
        d?.label === "Entity Types" ||
        Boolean(d?.sourceEntityId) ||
        Boolean(d?.isServiceEndpointSchemas) ||
        Boolean(d?.isPackageNode || d?.packageName || (d?.packageSources && d.packageSources.length > 0 && !d?.isExtended));
      if (isAutoDerived) {
        autoDerivedCustomTypes.push(...n.data.types);
      } else {
        userCustomTypes.push(...n.data.types);
      }
    }
  });
  const canvasCustomTypes: CustomTypeItem[] = [...userCustomTypes, ...autoDerivedCustomTypes];

  const rawStores = [...appGlobalStores, ...pageStores, ...graphStateStores];
  const mergedStoresMap = new Map<string, GlobalStoreDefinition>();
  for (const st of rawStores) {
    const baseName = toPascalCase((st.name || "App").replace(/Store$/i, ""));
    const key = `${st.scope || "global"}:${st.targetPageId || ""}:${baseName}`;
    const existing = mergedStoresMap.get(key);
    if (!existing) {
      mergedStoresMap.set(key, { ...st, fields: [...(st.fields || [])], actions: [...(st.actions || [])] });
    } else {
      existing.fields = existing.fields || [];
      existing.actions = existing.actions || [];
      const currentFields = existing.fields;
      const currentActions = existing.actions;
      (st.fields || []).forEach((f) => {
        if (!currentFields.some((ef) => ef.name === f.name || ef.id === f.id)) {
          currentFields.push(f);
        }
      });
      (st.actions || []).forEach((act) => {
        if (!currentActions.some((ea) => ea.name === act.name || ea.id === act.id)) {
          currentActions.push(act);
        }
      });
    }
  }
  const allStores = Array.from(mergedStoresMap.values());

  // Scan all actions across the web app to ensure every store referenced in state_mutation steps is present
  allActionsInApp.forEach((a: UIEventItem) => {
    (a.actionSteps || []).forEach((s: FrontendActionStepDraft) => {
      if (s.type === "state_mutation") {
        const extraName = "stateStoreName" in s && typeof s.stateStoreName === "string" ? s.stateStoreName : "";
        const extraLabel = "stateStoreLabel" in s && typeof s.stateStoreLabel === "string" ? s.stateStoreLabel : "";
        const rawStoreName =
          extraName ||
          extraLabel ||
          (s.stateStoreNodeId && !s.stateStoreNodeId.startsWith("node-") && !s.stateStoreNodeId.startsWith("store-")
            ? s.stateStoreNodeId
            : undefined) ||
          "AppStore";
        const baseName = toPascalCase(rawStoreName.replace(/Store$/i, ""));
        const storeFullName = `${baseName}Store`;

        let targetStore = allStores.find((st) => {
          const stBase = toPascalCase((st.name || "App").replace(/Store$/i, ""));
          return stBase === baseName;
        });

        if (!targetStore) {
          const matchedNode =
            allStateStoreNodes.find((stNode) => {
              if (s.stateStoreNodeId && stNode.id === s.stateStoreNodeId) return true;
              const lbl = toPascalCase((stNode.data?.label || "").replace(/Store$/i, ""));
              const nm = toPascalCase((stNode.data?.storeName || "").replace(/Store$/i, ""));
              return lbl === baseName || nm === baseName;
            }) ||
            (allStateStoreNodes.length === 1 &&
            (!allStateStoreNodes[0]?.data?.targetWebAppId ||
              !webAppNode?.id ||
              allStateStoreNodes[0]?.data?.targetWebAppId === webAppNode.id)
              ? allStateStoreNodes[0]
              : undefined);

          if (matchedNode) {
            const d = matchedNode.data || {};
            targetStore = {
              id: matchedNode.id,
              name: d.storeName || d.label || storeFullName,
              description: d.description,
              fields: Array.isArray(d.fields) ? [...d.fields] : [],
              actions: Array.isArray(d.actions) ? [...d.actions] : [],
              storage:
                d.storage === "localStorage" || d.storage === "sessionStorage"
                  ? d.storage
                  : "memory",
              scope: "global",
            };
            allStores.push(targetStore);
          } else {
            targetStore = {
              id: `synth-store-${baseName.toLowerCase()}`,
              name: storeFullName,
              description: `${baseName} application state store`,
              fields: [],
              actions: [],
              storage: "memory",
              scope: "global",
            };
            allStores.push(targetStore);
          }
        }

        // Ensure mutated field exists on targetStore
        targetStore.fields = targetStore.fields || [];
        let fieldName = s.stateKey || "";
        if (!fieldName && s.stateTargetFieldId) {
          const matchedF = targetStore.fields.find((f: GlobalStoreField) => f.id === s.stateTargetFieldId);
          if (matchedF?.name) {
            fieldName = matchedF.name;
          }
        }
        if (!fieldName && s.name) {
          fieldName = s.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        }
        if (fieldName && !targetStore.fields.some((f: GlobalStoreField) => f.name === fieldName)) {
          const isArr = isArrayTargetField(undefined, fieldName, s.stateReducerName || s.stateActionName);
          const isNum = !isArr && isNumberTargetField(undefined, fieldName);
          const isBool = !isArr && !isNum && isBooleanTargetField(undefined, fieldName, s.stateActionName);
          let fieldType: StateVariableType = "string";
          let defaultValue: JsonValue | undefined = undefined;
          if (isArr) {
            fieldType = "array";
            defaultValue = [];
          } else if (isNum) {
            fieldType = "number";
            defaultValue = 0;
          } else if (isBool) {
            fieldType = "boolean";
            defaultValue = false;
          }
          targetStore.fields.push({
            id: `f-${fieldName}`,
            name: fieldName,
            type: fieldType,
            isArray: isArr,
            defaultValue,
          });
        }

        // Ensure reducer action exists on targetStore
        targetStore.actions = targetStore.actions || [];
        const rawActionType = (s.stateActionName || s.stateUpdateType || "set").trim().toLowerCase();
        const actionType: StoreActionType = isValidStoreActionType(rawActionType) ? rawActionType : "set";
        const cap = fieldName ? fieldName.charAt(0).toUpperCase() + fieldName.slice(1) : "";
        const defaultPrefix = actionType === "set" || actionType === "mutate" ? "set" : actionType;
        const actionName =
          s.stateActionName && s.stateActionName !== "set" && s.stateActionName !== "mutate"
            ? s.stateActionName
            : `${defaultPrefix}${cap}`;
        if (actionName && !targetStore.actions.some((act: GlobalStoreAction) => act.name === actionName)) {
          targetStore.actions.push({
            id: `act-${actionName}`,
            name: actionName,
            targetFieldId: fieldName ? `f-${fieldName}` : undefined,
            actionType,
          });
        }
      }
    });
  });
  if (allStores.length > 0) {
    allStores.forEach((s) => {
      if (!s.customTypes || s.customTypes.length === 0) {
        s.customTypes = canvasCustomTypes;
      }
    });
    files.push(...generateZustandStores(allStores, { localStorePaths, customTypes: canvasCustomTypes }));
  }

  // 2.6 Resolve Browser Storage Nodes (localStorage / sessionStorage)
  const associatedBrowserStorageNodes = (allNodes || []).filter((n) => {
    if (n.type !== "browser_storage") return false;
    const targetWebAppId = n.data?.targetWebAppId;
    if (targetWebAppId && webAppNode?.id && targetWebAppId === webAppNode.id) return true;
    const isDirectlyConnectedToPage = allEdges.some((e) => {
      const isSrc = e.source === n.id && webClientNodeIds.has(e.target);
      const isTgt = e.target === n.id && webClientNodeIds.has(e.source);
      return isSrc || isTgt;
    });
    if (isDirectlyConnectedToPage) return true;
    if (!targetWebAppId) return true;
    return false;
  });

  const hasBrowserStorageStepAnywhere = enrichedWebClientNodes.some((p) =>
    (p.data?.sections || []).some((s) =>
      (s.actions || []).some((a) =>
        (a.actionSteps || []).some((st) => st.type === "browser_storage")
      )
    )
  );

  if (associatedBrowserStorageNodes.length > 0 || hasBrowserStorageStepAnywhere) {
    files.push(generateBrowserStorageHelper(associatedBrowserStorageNodes));
  }

  // 3. Project Configuration Files
  const sectionAndActionLibs = enrichedWebClientNodes.flatMap((p) =>
    (p.data?.sections || []).flatMap((s) => [
      ...(s.libraries || []),
      ...(s.actions || []).flatMap((a) => a.libraries || []),
    ])
  );
  const extraDepsFromSectionsAndActions = sectionAndActionLibs.map((libName: string) => ({
    name: libName,
    version: "latest",
    isDev: false,
    source: "manual" as const,
  }));

  const storeDeps = allStores.length > 0
    ? [{ name: "zustand", version: "^5.0.0", isDev: false, source: "manual" as const }]
    : [];

  const resolvedProviders = resolveAppProviders([
    ...sectionAndActionLibs,
    ...(webAppNode?.data?.customDependencies || []).map((d: NodeDependencyItem) => d.name),
    ...enrichedWebClientNodes.flatMap((p) => (p.data?.customDependencies || []).map((d: NodeDependencyItem) => d.name)),
  ]);

  if (resolvedProviders.hasProviders && resolvedProviders.file) {
    files.push(resolvedProviders.file);
  }

  const providerDeps = resolvedProviders.requiredPackages.map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    isDev: false,
    source: "manual" as const,
  }));

  // Gather Service nodes with techStack: "nextjs" associated with this webApp
  const associatedNextjsServiceNodes = (allNodes || []).filter((n) =>
    isServiceAssociatedWithWebApp(n, webAppNode, allNodes, allEdges, enrichedWebClientNodes),
  );

  const allWebCustomDeps = [
    ...(webAppNode?.data?.customDependencies || []),
    ...enrichedWebClientNodes.flatMap((p) => p.data?.customDependencies || []),
    ...associatedNextjsServiceNodes.flatMap((s) => s.data?.customDependencies || []),
    ...extraDepsFromSectionsAndActions,
    ...storeDeps,
    ...providerDeps,
  ];
  const deduplicatedCustomDeps = allWebCustomDeps.filter(
    (dep, index, self) => index === self.findIndex((d) => d.name === dep.name)
  );

  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );
  const entityNodes = allNodes.filter(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      n.data?.dbType !== "redis",
  );
  const authNodes = allNodes.filter((n) => n.type === "auth");

  const hasDb =
    dbNodes.length > 0 || entityNodes.length > 0 || authNodes.length > 0;

  const isSingleDb = dbNodes.length <= 1;
  const dbPackageName = isSingleDb
    ? "@workspace/db"
    : `@workspace/db-${(dbNodes[0]?.data?.label || "db").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const hasTransformers =
    enrichedWebClientNodes.some((p) => {
      const rawSections = Array.isArray(p.data?.sections) ? p.data.sections : [];
      const rawEvents = Array.isArray(p.data?.events) ? p.data.events : [];
      const allActs: UIEventItem[] = [
        ...rawSections.flatMap((s: PageSection) => s.actions || []),
        ...rawEvents,
      ];
      return allActs.some((a: UIEventItem) =>
        (a.actionSteps || []).some(
          (s: FrontendActionStepDraft) =>
            Boolean(s.transformerRefNodeId) ||
            s.functionRef?.importPath === "@workspace/transformers" ||
            Boolean(s.functionRef?.importPath?.startsWith("@workspace/transformers")) ||
            (s.type === "transform" &&
              s.functionRef?.isGlobal !== false &&
              !s.functionRef?.importPath?.startsWith(".")),
        ),
      );
    }) ||
    allNodes.some(
      (n) =>
        ((n.type === "transformer" && n.data?.scope !== "local") || n.type === "transformer_ref") &&
        (enrichedWebClientNodes.some((w) => w.id === n.data?.targetWebPageId) ||
          allEdges.some(
            (e) =>
              enrichedWebClientNodes.some((w) => w.id === e.source || w.id === e.target) &&
              (e.source === n.id || e.target === n.id),
          )),
    ) ||
    deduplicatedCustomDeps.some((d) => d.name === "@workspace/transformers");

  files.push(
    ...generateProjectConfigFiles(
      effectiveAppSlug,
      deduplicatedCustomDeps,
      hasDb,
      dbPackageName,
      dbNodes[0],
      hasTransformers,
    ),
  );

  // Generate canvas-driven .env and .env.example with connected package nodes (Storage, DB, etc.)
  const targetAppNode: BackendNode = webAppNode || {
    id: enrichedWebClientNodes[0]?.id || "web-app",
    type: "webApp",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: effectiveAppSlug,
      appSlug: effectiveAppSlug,
      envVars: [],
    },
  };

  const { env: compiledEnv, envExample: compiledEnvExample } =
    generateEnvFilesForNode(
      targetAppNode,
      allNodes,
      allEdges,
      enrichedWebClientNodes,
    );

  const envFileIdx = files.findIndex((f) => f.filename === ".env");
  if (envFileIdx !== -1) {
    files[envFileIdx] = {
      filename: ".env",
      language: "dotenv",
      content: compiledEnv,
    };
  } else {
    files.push({
      filename: ".env",
      language: "dotenv",
      content: compiledEnv,
    });
  }

  const envExFileIdx = files.findIndex((f) => f.filename === ".env.example");
  if (envExFileIdx !== -1) {
    files[envExFileIdx] = {
      filename: ".env.example",
      language: "dotenv",
      content: compiledEnvExample,
    };
  } else {
    files.push({
      filename: ".env.example",
      language: "dotenv",
      content: compiledEnvExample,
    });
  }

  // 4. Auth Server, Client SDK, Authorization Helpers & Dependencies (only if authNode connected)
  generateAuthFilesAndDependencies({
    files,
    webClientNodes: enrichedWebClientNodes,
    pagesInfo,
    authNode,
    endpoints,
    events,
    allNodes,
    allEdges,
    testCases,
  });

  // 4.5 Payments (Creem) Client, Checkout & Webhooks (if payments node connected)
  generatePaymentsFilesAndDependencies({
    files,
    webAppNode,
    authNode,
    allNodes,
    allEdges,
    effectiveAppSlug,
  });

  // 5. Database Dependencies (if database nodes exist on canvas)
  ensureDatabaseDependencies(files, allNodes);

  // 6. Root Layout (app/layout.tsx) & Middleware Proxy (proxy.ts)
  const showNav = Boolean(webAppNode?.data?.showNav);

  const navLinksHtml = showNav
    ? pagesInfo
        .map((p) => `<Link href="${p.routePath}" className="hover:underline">${p.label}</Link>`)
        .join("\n              ")
    : "";

  const rootLayoutPageInfo = pagesInfo.find(
    (p) => p.isLayout && (p.isRoot || p.routePath === "app/layout.tsx"),
  );
  const rootLayoutNode = allNodes.find(
    (n) =>
      n.type === "webPage" &&
      (Boolean(n.data?.isLayout) || n.data?.label?.trim().toLowerCase() === "layout") &&
      (n.data?.isRoot || n.data?.path === "app/layout.tsx"),
  );
  const fallbackRootConns: LinkedRealtimeConnectionInfo[] = (
    rootLayoutNode?.data?.realtimeConnections || []
  ).map((c) => ({
    ...c,
    connectionId: c.id,
    sourceServiceNodeId: c.sourceServiceNodeId,
    sourceServiceName: c.sourceServiceLabel,
  }));
  const rootRealtimeConns: LinkedRealtimeConnectionInfo[] =
    rootLayoutPageInfo?.realtimeConnections || fallbackRootConns;
  const rawRootSections: PageSection[] = rootLayoutNode?.data?.sections ?? [];
  const rawRootEvents: UIEventItem[] = rootLayoutNode?.data?.events ?? [];
  const rootSections: PageSection[] =
    rawRootSections.length > 0
      ? rawRootSections
      : rawRootEvents.length > 0
      ? [{ id: "sec-default", name: "Default", actions: rawRootEvents }]
      : [];
  const rootActions: UIEventItem[] = [
    ...rootSections.flatMap((s) => s.actions || []),
    ...rawRootEvents.filter((e) => !rootSections.some((s) => (s.actions || []).some((act) => act.id === e.id))),
  ];
  const hasRootStoreActions =
    Array.isArray(rootLayoutNode?.data?.actions) &&
    rootLayoutNode.data.actions.length > 0;
  const hasRootEventsDrawer =
    rootRealtimeConns.length > 0 ||
    rootActions.length > 0 ||
    hasRootStoreActions;

  if (hasRootEventsDrawer) {
    files.push({
      filename: "app/_components/LayoutEventsDrawer.tsx",
      language: "typescript",
      content: generateLayoutEventsDrawer(
        rootRealtimeConns,
        Boolean(authNode),
        "Root",
      ),
    });
  }

  files.push({
    filename: "app/layout.tsx",
    language: "typescript",
    content: generateRootLayout(
      projectName,
      navLinksHtml,
      showNav,
      resolvedProviders.hasProviders,
      hasRootEventsDrawer,
    ),
  });

  files.push({
    filename: "proxy.ts",
    language: "typescript",
    content: generateProxy(pagesInfo, authNode?.data),
  });

  // 7. Pages, Action Event Components, Page Headers & Auth Components
  const { pageFiles, hasTransformers: pageHasTransformers } = generatePageAndComponentFiles({
    webClientNodes: enrichedWebClientNodes,
    pagesInfo,
    endpoints,
    allNodes: enrichedAllNodes,
    allEdges,
    authNode,
    files,
  });
  files.push(...pageFiles);

  if (
    hasTransformers ||
    pageHasTransformers ||
    pageFiles.some((f) => f.content.includes("@workspace/transformers"))
  ) {
    ensureTransformerDependencies(files, true);
  }

  // 8. Colocated Next.js Service Route Handlers
  associatedNextjsServiceNodes.forEach((svcNode) => {
    let svcEndpoints = endpoints.filter((ep) => ep.nodeId === svcNode.id);
    if (svcEndpoints.length === 0 && Array.isArray(svcNode.data?.endpoints)) {
      svcEndpoints = svcNode.data.endpoints.map((ep: Endpoint) => ({
        ...ep,
        nodeId: svcNode.id,
      }));
    }

    if (svcEndpoints.length > 0) {
      const svcRoutes = generateNextjsRoutes({
        serviceName: svcNode.data?.label || "api",
        nodeEndpoints: svcEndpoints,
        serviceNode: svcNode,
        allNodes,
        allEdges,
        hasDb,
      });
      files.push(...svcRoutes);
    }
  });

  // 9. Web page E2E Tests
  files.push(
    ...generateWebClientE2ETests(
      enrichedWebClientNodes,
      endpoints,
      events,
      allNodes,
      allEdges,
      testCases,
    ),
  );

  // 10. Final safeguard: ensure lib/stores/index.ts exists if any file imports from "@/lib/stores"
  const hasStoreImport = files.some((f) => f.content.includes('@/lib/stores'));
  const hasStoreIndexFile = files.some((f) => f.filename === "lib/stores/index.ts");
  if (hasStoreImport && !hasStoreIndexFile) {
    const derivedFields: GlobalStoreField[] = [];
    const derivedActions: GlobalStoreAction[] = [];

    allActionsInApp.forEach((a: UIEventItem) => {
      (a.actionSteps || []).forEach((s: FrontendActionStepDraft) => {
        if (s.type === "state_mutation") {
          const fieldName = s.stateKey || (s.name ? s.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() : "");
          if (fieldName && !derivedFields.some((f) => f.name === fieldName)) {
            const isArr = isArrayTargetField(undefined, fieldName, s.stateReducerName || s.stateActionName);
            const isNum = !isArr && isNumberTargetField(undefined, fieldName);
            const isBool = !isArr && !isNum && isBooleanTargetField(undefined, fieldName, s.stateActionName);
            const fieldType: StateVariableType = isArr ? "array" : isNum ? "number" : isBool ? "boolean" : "string";
            derivedFields.push({
              id: `f-${fieldName}`,
              name: fieldName,
              type: fieldType,
              isArray: isArr,
              defaultValue: isArr ? [] : isNum ? 0 : isBool ? false : undefined,
            });
            const cap = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
            const rawAct = s.stateActionName || s.stateUpdateType || "set";
            const actType = isValidStoreActionType(rawAct) ? rawAct : "set";
            const prefix = actType === "set" || actType === "mutate" ? "set" : actType;
            const actName =
              s.stateActionName && s.stateActionName !== "set" && s.stateActionName !== "mutate"
                ? s.stateActionName
                : `${prefix}${cap}`;
            derivedActions.push({
              id: `act-${actName}`,
              name: actName,
              targetFieldId: `f-${fieldName}`,
              actionType: actType,
            });
          }
        }
      });
    });

    if (derivedFields.length === 0) {
      derivedFields.push({
        id: "f-data",
        name: "data",
        type: "string",
        isArray: false,
        defaultValue: "",
      });
      derivedActions.push({
        id: "act-setData",
        name: "setData",
        targetFieldId: "f-data",
        actionType: "set",
      });
    }

    const fallbackStore: GlobalStoreDefinition = {
      id: "store-fallback-app",
      name: "AppStore",
      description: "Application state store",
      fields: derivedFields,
      actions: derivedActions,
      storage: "memory",
      scope: "global",
    };
    files.push(...generateZustandStores([fallbackStore], { customTypes: canvasCustomTypes }));
  }

  // Ensure package.json includes zustand dependency if stores are referenced
  const pkgJsonFile = files.find((f) => f.filename === "package.json");
  if (pkgJsonFile && (hasStoreImport || allStores.length > 0)) {
    try {
      const parsed = JSON.parse(pkgJsonFile.content);
      if (!parsed.dependencies?.zustand) {
        parsed.dependencies = parsed.dependencies || {};
        parsed.dependencies.zustand = "^5.0.0";
        pkgJsonFile.content = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // ignore json parse error
    }
  }

  const webPageName =
    enrichedWebClientNodes.length === 1
      ? enrichedWebClientNodes[0]?.data.label || "web-client"
      : "web-client";
  const webPageId =
    enrichedWebClientNodes.length === 1 && enrichedWebClientNodes[0]
      ? enrichedWebClientNodes[0].id
      : "web-client";

  return {
    webPageId,
    webPageName,
    files,
  };
}
