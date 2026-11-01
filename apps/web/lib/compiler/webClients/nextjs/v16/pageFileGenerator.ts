import { BackendNode, BackendEdge, Parameter } from "@/types/canvas";
import { Endpoint, UIEventItem, PageSection, CompiledFile, JSONValue } from "@workspace/canvas/types";
import { PageInfo } from "./types";
import { resolveLinkedEndpoint, resolvePageRefLink } from "./endpointResolver";
import { labelToSlug, slugToComponentName } from "./slugUtils";
import {
  generateEventComponent,
  generateSectionComponent,
  generatePageCode,
  generateAuthFormComponent,
  EventComponentMeta,
  SectionMeta,
} from "./componentTemplates";
import { resolveBaseUrlInfo, type StorageUploadConfig } from "./event-generators";
import { isAuthPage, isAuthLoginPage, isAuthRegisterPage } from "../../../compileAuth";
import { typeStrToTsAndZod } from "../../../generators/schemaToTypeScript";
import { generateApiClientFile } from "./apiClientTemplate";
import { deriveRouteFileName, toPascalCase } from "../../../utils";

export interface GeneratePageAndComponentFilesParams {
  webClientNodes: BackendNode[];
  pagesInfo: PageInfo[];
  endpoints?: (Endpoint & { nodeId: string })[];
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  authNode?: BackendNode;
}

export interface PageAndComponentFilesResult {
  pageFiles: CompiledFile[];
  hasExplicitRoot: boolean;
}

/**
 * Generates page load fetch statements, event components, headers, auth components, and page files
 */
export function generatePageAndComponentFiles({
  webClientNodes,
  pagesInfo,
  endpoints = [],
  allNodes = [],
  allEdges = [],
  authNode,
}: GeneratePageAndComponentFilesParams): PageAndComponentFilesResult {
  const pageFiles: CompiledFile[] = [];
  let hasExplicitRoot = false;

  const hasStepAuthAnywhere = webClientNodes.some((node) => {
    const rawSections = Array.isArray(node.data?.sections) ? node.data.sections : [];
    return rawSections.some((sec) => {
      if (!sec || typeof sec !== "object" || !("actions" in sec) || !Array.isArray(sec.actions)) {
        return false;
      }
      return sec.actions.some((act) => {
        if (!act || typeof act !== "object" || !("actionSteps" in act) || !Array.isArray(act.actionSteps)) {
          return false;
        }
        return act.actionSteps.some((s) => {
          if (!s || typeof s !== "object" || !("type" in s) || s.type !== "api_call") {
            return false;
          }
          const bindings = Array.isArray(s.requestBindings) ? s.requestBindings : [];
          return bindings.some((b) => {
            if (!b || typeof b !== "object") return false;
            const targetField = typeof b.targetField === "string" ? b.targetField.toLowerCase() : "";
            const slot = typeof b.slot === "string" ? b.slot : "";
            const sourceKind = b.source && typeof b.source === "object" && "kind" in b.source ? b.source.kind : "";
            return (
              (slot === "header" || !slot) &&
              (sourceKind === "auth_token" ||
                targetField === "authorization" ||
                targetField === "auth-bearer-header")
            );
          });
        });
      });
    });
  });

  const hasGlobalAuth = Boolean(
    hasStepAuthAnywhere ||
      authNode ||
      pagesInfo.some((p) => p.accessType !== "public") ||
      webClientNodes.some(
        (n) =>
          (n.data?.authNodeId && allNodes.some((an) => an.id === n.data.authNodeId && an.type === "auth")) ||
          n.data?.requireAuth === true ||
          (n.data?.useZoneDefault === false && n.data?.protectionOverride?.accessType === "protected"),
      ),
  );
  pageFiles.push(generateApiClientFile(hasGlobalAuth));

  webClientNodes.forEach((node, idx) => {
    const pageMeta = pagesInfo[idx]!;
    // Layout nodes are compiled as layout.tsx via generateRouteGroupLayouts, not as route pages
    if (pageMeta.isLayout) {
      return;
    }

    if (pageMeta.isRoot) {
      hasExplicitRoot = true;
    }

    const effectiveAuthNode =
      authNode ||
      (node.data?.authNodeId
        ? allNodes.find((n) => n.id === node.data.authNodeId && n.type === "auth")
        : undefined);

    const isPageProtected =
      pageMeta.accessType !== "public" ||
      node.data?.requireAuth === true ||
      Boolean(
        node.data?.useZoneDefault === false &&
          node.data?.protectionOverride?.accessType === "protected",
      );

    const nodeHeaders: Record<string, string> = {};
    (node.data?.headers || [])
      .filter(
        (h: Parameter) =>
          h.name?.toLowerCase() !== "authorization" &&
          h.id !== "auth-bearer-header" &&
          !h.id?.startsWith("auth-"),
      )
      .forEach((h: Parameter) => {
        const hKey = h.key || h.name;
        const hVal = h.value || h.defaultValue || "";
        if (hKey) {
          nodeHeaders[hKey] = hVal;
        }
      });

    const nodeQueryParams: Record<string, string> = {};
    (node.data?.queryParams || []).forEach((p) => {
      const pKey = p.key || p.name;
      const pVal = p.value || p.defaultValue || "";
      if (pKey) {
        nodeQueryParams[pKey] = pVal;
      }
    });

    let nodeRequestBody: JSONValue | undefined = undefined;
    if (node.data?.requestBody?.rawJson) {
      try {
        const parsed: JSONValue = JSON.parse(node.data.requestBody.rawJson);
        nodeRequestBody = parsed;
      } catch {}
    } else if (node.data?.requestBody?.fields && node.data.requestBody.fields.length > 0) {
      const bodyObj: Record<string, JSONValue> = {};
      node.data.requestBody.fields.forEach((f) => {
        const fKey = f.name || f.key;
        if (fKey) {
          const val: JSONValue = f.value ?? f.defaultValue ?? (f.type === "number" ? 0 : f.type === "boolean" ? true : "");
          bodyObj[fKey] = val;
        }
      });
      nodeRequestBody = bodyObj;
    }

    const rawSections: PageSection[] = node.data?.sections || [];
    const normalizedSections: PageSection[] =
      rawSections.length > 0
        ? rawSections
        : node.data?.events && node.data.events.length > 0
        ? [
            {
              id: "sec-default",
              name: "Main Section",
              renderMode: "server",
              loadStrategy: "eager",
              actions: node.data.events,
            },
          ]
        : [];

    const allActions: UIEventItem[] = normalizedSections.flatMap((s) => s.actions || []);
    const pageLoadEvents = allActions.filter(
      (e) => e.event === "pageLoad" || e.name === "pageLoad",
    );

    let pageLoadFetchStatements = "";
    // Derive a typed PageLoadData interface from the first pageLoad endpoint
    let pageLoadDataType = "JSONValue";
    let pageLoadDataTypeDecl = "";
    if (pageLoadEvents.length > 0) {
      const firstPageLoadLink = resolveLinkedEndpoint(
        node.id,
        pageLoadEvents[0]!.id,
        allNodes,
        allEdges,
        endpoints,
      );
      const effectiveServiceName =
        firstPageLoadLink?.serviceName || firstPageLoadLink?.targetNodeName;
      if (firstPageLoadLink?.endpoint && effectiveServiceName) {
        const routeFileName = deriveRouteFileName(
          firstPageLoadLink.endpoint,
          0,
          effectiveServiceName,
        );
        const pascalName = `${toPascalCase(effectiveServiceName)}${toPascalCase(routeFileName)}`;
        pageLoadDataType = `${pascalName}Response | null`;
        pageLoadDataTypeDecl = `import type { ${pascalName}Response } from "@workspace/types";`;
      } else {
        const responseBody = firstPageLoadLink?.endpoint?.responseBody;
        const fields = responseBody?.fields?.filter((f) => f.name && f.name.trim());

        if (fields && fields.length > 0) {
          // Build a typed interface from the configured response fields
          const fieldLines = fields
            .map((f) => {
              const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(f.name.trim())
                ? f.name.trim()
                : JSON.stringify(f.name.trim());
              const enumValues = f.enumValues;
              const { ts } = typeStrToTsAndZod(f.type || "string", enumValues);
              const opt = f.required ? "" : "?";
              return `  ${key}${opt}: ${ts};`;
            })
            .join("\n");
          const typeName =
            pageLoadEvents.length === 1
              ? "PageLoadData"
              : `${pageLoadEvents[0]!.name || "PageLoad"}Data`;
          pageLoadDataType = `${typeName} | null`;
          pageLoadDataTypeDecl = `interface ${typeName} {\n${fieldLines}\n}`;
        } else if (responseBody?.rawJson) {
          // Attempt to infer types from raw JSON example
          try {
            const parsed: JSONValue = JSON.parse(responseBody.rawJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const fieldLines = Object.entries(parsed)
                .map(([k, v]) => {
                  const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
                  const ts =
                    v === null ? "null" :
                    typeof v === "number" ? "number" :
                    typeof v === "boolean" ? "boolean" :
                    Array.isArray(v) ? "JSONValue[]" :
                    typeof v === "object" ? "Record<string, JSONValue>" :
                    "string";
                  return `  ${key}?: ${ts};`;
                })
                .join("\n");
              pageLoadDataType = "PageLoadData | null";
              pageLoadDataTypeDecl = `interface PageLoadData {\n${fieldLines}\n}`;
            }
          } catch {
            // rawJson not parseable — keep JSONValue fallback
          }
        }
      }

      const statements: string[] = [];
      const usedSuffixes = new Set<string>();
      const evtSuffixMap = new Map<string, string>();

      pageLoadEvents.forEach((evt) => {
        const link = resolveLinkedEndpoint(
          node.id,
          evt.id,
          allNodes,
          allEdges,
          endpoints,
        );
        const evtKey = evt.name || "pageLoad";

        // Derive meaningful variable suffix from TargetServiceName + EndpointName (e.g. UserServiceGetData)
        let suffix = "";
        if (pageLoadEvents.length > 1) {
          const servicePart = link?.targetNodeName
            ? link.targetNodeName
                .replace(/[^a-zA-Z0-9]+/g, " ")
                .trim()
                .split(/\s+/)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join("")
            : "";

          const endpointPart = (link?.endpointName || (evt.name && evt.name !== "pageLoad" ? evt.name : "") || "Data")
            .replace(/[^a-zA-Z0-9]+/g, " ")
            .trim()
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join("");

          let cleanName = `${servicePart}${endpointPart}` || "Data";
          if (/^[0-9]/.test(cleanName)) {
            cleanName = `data${cleanName}`;
          }

          suffix = `_${cleanName}`;
          let collisionCount = 2;
          while (usedSuffixes.has(suffix)) {
            suffix = `_${cleanName}_${collisionCount}`;
            collisionCount++;
          }
          usedSuffixes.add(suffix);
        }
        evtSuffixMap.set(evt.id, suffix);

        if (link) {
          const requireAuth = (Boolean(effectiveAuthNode) || isPageProtected) && link.requireAuth !== false;
          const headersEntries = Object.entries(nodeHeaders)
            .map(([k, v]) => `"${k}": "${v}",`)
            .join("\n          ");
          const linkUrlInfo = resolveBaseUrlInfo(link.fullUrl, link.serviceName || link.targetNodeName);
          const fetchUrlExpr = linkUrlInfo.hasBaseUrl ? linkUrlInfo.urlExpression : `"${link.fullUrl}"`;

          statements.push(`const headers${suffix}: Record<string, string> = {
          "Content-Type": "application/json",
          ${headersEntries}
        };
        ${requireAuth ? `const token${suffix} = await getAuthBearerToken();
        if (token${suffix}) {
          headers${suffix}["Authorization"] = token${suffix};
        }` : ""}
        ${linkUrlInfo.hasBaseUrl ? `${linkUrlInfo.baseUrlDeclaration}\n        ` : ""}const res${suffix} = await fetch(${fetchUrlExpr}, {
          method: "${link.method || "GET"}",
          headers: headers${suffix},
          ${link.method === "POST" || link.method === "PUT" || link.method === "PATCH" ? `body: JSON.stringify(${nodeRequestBody !== undefined ? JSON.stringify(nodeRequestBody) : `{ eventName: "${evt.name || "pageLoad"}", eventType: "pageLoad" }`}),` : ""}
        });
        if (!res${suffix}.ok) {
          throw new Error("HTTP " + res${suffix}.status + ": " + (res${suffix}.statusText || "Failed to load page data"));
        }
        ${firstPageLoadLink?.endpoint && effectiveServiceName && pageLoadEvents.length === 1
          ? `const data: ${pageLoadDataType.replace(/\s*\|\s*null$/, "")} = await res${suffix}.json();`
          : `results["${evtKey}"] = await res${suffix}.json();`}`);
        } else {
          statements.push(`results["${evtKey}"] = {
          message: "pageLoad event triggered on mount (no target endpoint connected in canvas)",
        };`);
        }
      });

      const isSingleLoadWithEndpoint = Boolean(firstPageLoadLink?.endpoint && effectiveServiceName && pageLoadEvents.length === 1);

      const storePopulationLines = pageLoadEvents
        .flatMap((e) => {
          const bindings = e.storeActionBindings && e.storeActionBindings.length > 0
            ? e.storeActionBindings
            : e.storeActionBinding
            ? [e.storeActionBinding]
            : [];
          return bindings.map((binding) => ({ e, binding }));
        })
        .filter(({ binding }) => Boolean(binding.storeName))
        .map(({ e, binding }) => {
          const clean = binding.storeName!.replace(/Store$/i, "");
          const hookName = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
          const actionMethod = binding.actionName || "populate";
          const resKey = e.name || "pageLoad";

          let dispatchArg = isSingleLoadWithEndpoint ? "data" : `results["${resKey}"]`;
          if (binding.updateSource === "static" && binding.customValue) {
            dispatchArg = binding.customValue;
          } else if (binding.valuePath && binding.valuePath.trim()) {
            const accessor = binding.valuePath.trim()
              .split(".")
              .map((p, i) => (i === 0 ? p : `?.${p}`))
              .join("");
            dispatchArg = isSingleLoadWithEndpoint ? `data?.${accessor}` : `results["${resKey}"]?.${accessor}`;
          }

          if (actionMethod === "populate") {
            if (binding.parameterMappings && Object.keys(binding.parameterMappings).length > 0) {
              const mappedEntries = Object.entries(binding.parameterMappings)
                .filter(([_, path]) => path && path.trim())
                .map(([fieldName, path]) => {
                  const accessor = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
                  const val = isSingleLoadWithEndpoint ? `data?.${accessor}` : `results["${resKey}"]?.${accessor}`;
                  return `${fieldName}: ${val}`;
                });
              if (mappedEntries.length > 0) {
                return `${hookName}.getState().populate({ ${mappedEntries.join(", ")} });`;
              }
            }
            if (binding.targetFieldName) {
              const fieldVal = (!binding.valuePath && (binding.updateSource === "response" || !binding.updateSource))
                ? `("data" in (${dispatchArg} || {}) ? ${dispatchArg}.data : ${dispatchArg})`
                : dispatchArg;
              return `${hookName}.getState().populate({ ${binding.targetFieldName}: ${fieldVal} });`;
            }
          }

          if (binding.actionType === "custom" && binding.parameterMappings && Object.keys(binding.parameterMappings).length > 0) {
            const paramArgs = Object.values(binding.parameterMappings).map((path) => {
              if (!path || !path.trim()) return "undefined";
              const accessor = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
              return isSingleLoadWithEndpoint ? `data?.${accessor}` : `results["${resKey}"]?.${accessor}`;
            });
            return `${hookName}.getState().${actionMethod}(${paramArgs.join(", ")});`;
          }

          if (actionMethod.startsWith("set") && binding.targetFieldName && !binding.valuePath && (binding.updateSource === "response" || !binding.updateSource)) {
            const fieldVal = `("data" in (${dispatchArg} || {}) ? ${dispatchArg}.data : ${dispatchArg})`;
            return `${hookName}.getState().${actionMethod}(${fieldVal});`;
          }

          return `${hookName}.getState().${actionMethod}(${dispatchArg});`;
        })
        .join("\n          ");

      const pageLoadDataExpr = pageLoadEvents.length === 1
        ? `results["${pageLoadEvents[0]?.name || "pageLoad"}"]`
        : `results`;

      if (isSingleLoadWithEndpoint) {
        pageLoadFetchStatements = `${statements.join("\n        ")}
        if (isMounted) {
          setPageLoadData(data);
          ${storePopulationLines ? `${storePopulationLines}\n          ` : ""}setTriggerLogs((prev) => [
            {
              id: Math.random().toString(36).substring(2, 9),
              eventName: "${pageLoadEvents[0]?.name || "pageLoad"}",
              eventType: "pageLoad",
              timestamp: new Date().toLocaleTimeString(),
              url: ${firstPageLoadLink ? (resolveBaseUrlInfo(firstPageLoadLink.fullUrl, firstPageLoadLink.serviceName || firstPageLoadLink.targetNodeName).hasBaseUrl ? resolveBaseUrlInfo(firstPageLoadLink.fullUrl, firstPageLoadLink.serviceName || firstPageLoadLink.targetNodeName).urlExpression : `"${firstPageLoadLink.fullUrl}"`) : `"N/A"`},
              method: "${firstPageLoadLink?.method || "GET"}",
              status: res.status,
              data: data,
            },
            ...prev,
          ]);
        }`;
      } else {
        const logEntries = pageLoadEvents
          .map((evt) => {
            const link = resolveLinkedEndpoint(
              node.id,
              evt.id,
              allNodes,
              allEdges,
              endpoints,
            );
            const evtKey = evt.name || "pageLoad";
            const suffix = evtSuffixMap.get(evt.id) || "";
            return `{
              id: Math.random().toString(36).substring(2, 9),
              eventName: "${evt.name || "pageLoad"}",
              eventType: "pageLoad",
              timestamp: new Date().toLocaleTimeString(),
              url: ${link ? (resolveBaseUrlInfo(link.fullUrl, link.serviceName || link.targetNodeName).hasBaseUrl ? resolveBaseUrlInfo(link.fullUrl, link.serviceName || link.targetNodeName).urlExpression : `"${link.fullUrl}"`) : `"N/A"`},
              method: "${link?.method || "LOAD"}",
              ${link ? `status: res${suffix}.status,` : ""}
              data: results["${evtKey}"],
            }`;
          })
          .join(",\n            ");

        pageLoadFetchStatements = `const results: Record<string, JSONValue> = {};
        ${statements.join("\n        ")}
        if (isMounted) {
          setPageLoadData(${pageLoadDataExpr} ?? null);
          ${storePopulationLines ? `${storePopulationLines}\n          ` : ""}setTriggerLogs((prev) => [
            ${logEntries},
            ...prev,
          ]);
        }`;
      }
    }

    const unmountActions = allActions.filter((a) => a.event === "unmount");
    const unmountCleanupsList: string[] = [];
    unmountActions.forEach((act) => {
      const bindings = act.storeActionBindings && act.storeActionBindings.length > 0
        ? act.storeActionBindings
        : act.storeActionBinding
        ? [act.storeActionBinding]
        : [];
      bindings.forEach((b) => {
        if (b?.storeName) {
          const clean = b.storeName.replace(/Store$/i, "");
          const hookName = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
          const method = b.actionName || (b.actionType === "reset" ? "reset" : "reset");
          unmountCleanupsList.push(`${hookName}.getState().${method}();`);
        }
      });
    });

    const pageStoreNames = new Set<string>();
    pageLoadEvents.forEach((evt) => {
      (evt.storeActionBindings || (evt.storeActionBinding ? [evt.storeActionBinding] : [])).forEach((b) => {
        if (b?.storeName) pageStoreNames.add(b.storeName);
      });
    });
    unmountActions.forEach((evt) => {
      (evt.storeActionBindings || (evt.storeActionBinding ? [evt.storeActionBinding] : [])).forEach((b) => {
        if (b?.storeName) pageStoreNames.add(b.storeName);
      });
    });
    (pageMeta.realtimeConnections || []).forEach((c) => {
      (c.storeActionBindings || (c.storeActionBinding ? [c.storeActionBinding] : [])).forEach((b) => {
        if (b?.storeName) pageStoreNames.add(b.storeName);
      });
    });

    const pageStoreImports = Array.from(pageStoreNames)
      .map((sName) => {
        const clean = sName.replace(/Store$/i, "");
        const hookName = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
        return `import { ${hookName} } from "@/lib/stores";`;
      })
      .join("\n");

    const groupFolder = pageMeta.routeGroupPath || (pageMeta.routeGroup ? `(${pageMeta.routeGroup})` : "(public)");
    const baseComponentsDir = pageMeta.isRoot
      ? `app/${groupFolder}/_components`
      : `app/${groupFolder}/${pageMeta.slug}/_components`;

    const sectionsMeta: SectionMeta[] = [];

    normalizedSections.forEach((sec, secIdx) => {
      const secName = sec.name || `Section ${secIdx + 1}`;
      const secFolder = labelToSlug(secName, secIdx);
      const baseComp = slugToComponentName(secFolder).replace(/Page$/, "");
      const secCompName = baseComp.endsWith("Section") ? baseComp : `${baseComp}Section`;
      const sectionDir = `${baseComponentsDir}/${secFolder}`;

      const secActionMetas: EventComponentMeta[] = [];
      const nonPageLoadActions = (sec.actions || []).filter(
        (e) => e.event !== "pageLoad" && e.name !== "pageLoad",
      );

      nonPageLoadActions.forEach((evt, evtIdx) => {
        const evtName = evt.name || `Action ${evtIdx + 1}`;
        const evtType = evt.event || "click";
        const compName = slugToComponentName(labelToSlug(evtName, evtIdx)).replace(/Page$/, "Action");

        let url = "";
        let method = "POST";
        let targetRoute: string | undefined = undefined;
        let targetPageLabel: string | undefined = undefined;
        let requireAuth = Boolean(effectiveAuthNode);
        let link: ReturnType<typeof resolveLinkedEndpoint> = null;

        if (evtType === "navigateToPage") {
          const pageRefLink = resolvePageRefLink(
            node.id,
            evt.id,
            allNodes,
            allEdges,
            evt.targetPageId,
            evt.targetRoute,
          );
          targetRoute = pageRefLink.targetRoute;
          targetPageLabel = pageRefLink.targetNodeName;
        } else {
          link = resolveLinkedEndpoint(
            node.id,
            evt.id,
            allNodes,
            allEdges,
            endpoints,
          );
          url = link ? link.fullUrl : "";
          method = link ? link.method : "POST";
          const hasStepAuth = (evt.actionSteps || []).some(
            (s) =>
              s.type === "api_call" &&
              (s.requestBindings || []).some(
                (b) =>
                  (b.slot === "header" || !b.slot) &&
                  (b.source?.kind === "auth_token" ||
                    b.targetField?.toLowerCase() === "authorization" ||
                    b.targetField?.toLowerCase() === "auth-bearer-header"),
              ),
          );
          requireAuth =
            hasStepAuth ||
            ((Boolean(effectiveAuthNode) || isPageProtected) &&
              (link ? link.requireAuth !== false : true));
        }

        // Detect storage node connected to this WebPage action via edges or bindings
        const STORAGE_NODE_TYPES = new Set([
          "storage_operation_ref",
          "storage_ref",
          "storage_bucket_ref",
          "bucket_ref",
          "StorageBucketRefNode",
          "StorageOperationRefNode",
          "storage",
        ]);

        const parseSizeMb = (val: unknown): number => {
          if (typeof val === "number" && !isNaN(val)) return val;
          if (typeof val === "string") {
            const num = parseFloat(val);
            if (!isNaN(num)) {
              if (val.toUpperCase().includes("KB")) return Math.max(1, Math.round(num / 1024));
              if (val.toUpperCase().includes("GB")) return Math.round(num * 1024);
              return Math.round(num);
            }
          }
          return 10;
        };

        const extractBucketConfig = (
          storageNode: BackendNode,
          preferredBucketId?: string,
        ): StorageUploadConfig => {
          const rawBuckets = (storageNode.data?.buckets as Array<{
            id?: string;
            name?: string;
            maxFileSizeMb?: number;
            maxFileSize?: string | number;
            acceptedMimeTypes?: string[] | string;
            allowedExtensions?: string;
          }> | undefined) || [];

          const matchedBucket =
            (preferredBucketId
              ? rawBuckets.find(
                  (b) => b.id === preferredBucketId || b.name === preferredBucketId,
                )
              : undefined) ||
            rawBuckets[0];

          const rawSize =
            matchedBucket?.maxFileSizeMb ??
            matchedBucket?.maxFileSize ??
            (storageNode.data as any)?.maxFileSizeMb ??
            (storageNode.data as any)?.maxFileSize ??
            (storageNode.data as any)?.uploadMaxFileSizeMb ??
            10;
          const maxSizeMb = parseSizeMb(rawSize);

          const rawMimes =
            matchedBucket?.acceptedMimeTypes ??
            matchedBucket?.allowedExtensions ??
            (storageNode.data as any)?.acceptedMimeTypes ??
            (storageNode.data as any)?.uploadAcceptedMimeTypes ??
            [];

          const acceptedMimeTypes = Array.isArray(rawMimes)
            ? rawMimes.join(",")
            : typeof rawMimes === "string" && rawMimes.trim()
            ? rawMimes
            : "image/jpeg,image/png,image/webp,image/gif";

          return {
            maxSizeMb,
            acceptedMimeTypes,
            showPreview:
              acceptedMimeTypes.includes("image/") ||
              acceptedMimeTypes.includes("png") ||
              acceptedMimeTypes.includes("jpg") ||
              acceptedMimeTypes.includes("webp"),
          };
        };

        let storageConfig: StorageUploadConfig | undefined = undefined;

        // 1. Direct edge connecting this action to a storage node
        const evtHandle = evt.id;
        const storageEdge = allEdges.find(
          (e) =>
            (e.source === node.id || e.target === node.id) &&
            (e.sourceHandle?.includes(evtHandle) || e.targetHandle?.includes(evtHandle)) &&
            allNodes.some(
              (n) =>
                STORAGE_NODE_TYPES.has(n.type as string) &&
                (n.id === e.source || n.id === e.target) &&
                n.id !== node.id,
            ),
        );
        if (storageEdge) {
          const storageNodeId =
            storageEdge.source !== node.id ? storageEdge.source : storageEdge.target;
          const storageNode = allNodes.find((n) => n.id === storageNodeId);
          if (storageNode) {
            const underlyingStorageId =
              storageNode.type === "storage"
                ? storageNode.id
                : storageNode.data?.storageNodeId;
            const underlyingNode =
              (underlyingStorageId
                ? allNodes.find((n) => n.id === underlyingStorageId)
                : undefined) || storageNode;
            const preferredBucket =
              storageNode.data?.bucketId || storageNode.data?.bucketName;
            storageConfig = extractBucketConfig(underlyingNode, preferredBucket);
          }
        }

        // 2. Action storageOperationBinding (e.g. from canvas connection)
        const storageBinding = (evt as any)?.storageOperationBinding;
        if (!storageConfig && storageBinding) {
          const sNodeId = storageBinding.storageNodeId || storageBinding.refNodeId;
          const sNode = allNodes.find((n) => n.id === sNodeId);
          if (sNode) {
            const underlyingStorageId =
              sNode.type === "storage" ? sNode.id : sNode.data?.storageNodeId;
            const underlyingNode =
              (underlyingStorageId
                ? allNodes.find((n) => n.id === underlyingStorageId)
                : undefined) || sNode;
            storageConfig = extractBucketConfig(underlyingNode, storageBinding.bucketId);
          }
        }

        // 3. Connected service endpoint has a storage step or edge to a storage node
        if (!storageConfig && link?.endpoint && link.targetNodeId) {
          const hasStorageStep = (link.endpoint.pipelineSteps || []).some(
            (s: { type?: string; functionRef?: { name?: string; importPath?: string } }) =>
              s.type === "storage_operation" ||
              s.type === "storage" ||
              s.functionRef?.importPath?.includes("/storage") ||
              s.functionRef?.name?.toLowerCase().includes("upload"),
          );
          if (hasStorageStep) {
            const serviceStorageEdge = allEdges.find(
              (e) =>
                (e.source === link.targetNodeId || e.target === link.targetNodeId) &&
                allNodes.some(
                  (n) =>
                    STORAGE_NODE_TYPES.has(n.type as string) &&
                    (n.id === e.source || n.id === e.target) &&
                    n.id !== link.targetNodeId,
                ),
            );
            if (serviceStorageEdge) {
              const sId =
                serviceStorageEdge.source === link.targetNodeId
                  ? serviceStorageEdge.target
                  : serviceStorageEdge.source;
              const sNode = allNodes.find((n) => n.id === sId);
              if (sNode) {
                const underlyingStorageId =
                  sNode.type === "storage" ? sNode.id : sNode.data?.storageNodeId;
                const underlyingNode =
                  (underlyingStorageId
                    ? allNodes.find((n) => n.id === underlyingStorageId)
                    : undefined) || sNode;
                const preferredBucket = sNode.data?.bucketId || sNode.data?.bucketName;
                storageConfig = extractBucketConfig(underlyingNode, preferredBucket);
              }
            }
          }
        }

        // 4. Fallback from event-level or endpoint-level upload flags
        if (!storageConfig) {
          const evtAny = evt as {
            eventType?: string;
            actionType?: string;
            storageNodeId?: string;
            uploadBucketId?: string;
            storageOperationBinding?: { bucketId?: string };
            uploadMaxFileSizeMb?: number;
            uploadAcceptedMimeTypes?: string;
          };
          const epAny = link?.endpoint as {
            connectedStorageNodeId?: string;
            uploadMaxFileSizeMb?: number;
            uploadAcceptedMimeTypes?: string;
          } | undefined;
          const isUploadEvent =
            evtType === "fileUpload" ||
            evt.event === "fileUpload" ||
            evtAny?.eventType === "fileUpload" ||
            evtAny?.actionType === "upload" ||
            Boolean(evtAny?.storageNodeId) ||
            Boolean(evtAny?.uploadBucketId) ||
            Boolean(evtAny?.storageOperationBinding);
          if (isUploadEvent || epAny?.connectedStorageNodeId) {
            const bucketId =
              evtAny?.uploadBucketId ||
              evtAny?.storageOperationBinding?.bucketId;
            const sNodeId =
              evtAny?.storageNodeId ||
              epAny?.connectedStorageNodeId;
            const sNode = sNodeId ? allNodes.find((n) => n.id === sNodeId) : undefined;
            if (sNode) {
              storageConfig = extractBucketConfig(sNode, bucketId);
            } else if (isUploadEvent) {
              storageConfig = {
                maxSizeMb:
                  node.data?.uploadMaxFileSizeMb ??
                  evtAny?.uploadMaxFileSizeMb ??
                  epAny?.uploadMaxFileSizeMb ??
                  10,
                acceptedMimeTypes:
                  (Array.isArray(node.data?.uploadAcceptedMimeTypes)
                    ? node.data?.uploadAcceptedMimeTypes.join(",")
                    : undefined) ??
                  evtAny?.uploadAcceptedMimeTypes ??
                  epAny?.uploadAcceptedMimeTypes ??
                  "image/jpeg,image/png,image/webp,image/gif",
                showPreview: true,
              };
            }
          }
        }

        const actionMeta: EventComponentMeta = {
          componentName: compName,
          eventName: evtName,
          eventType: evtType,
          url,
          method,
          targetRoute,
          targetPageLabel,
          requireAuth,
          customHeaders: Object.keys(nodeHeaders).length > 0 ? nodeHeaders : undefined,
          queryParams: Object.keys(nodeQueryParams).length > 0 ? nodeQueryParams : undefined,
          requestBody: nodeRequestBody,
          eventItem: evt,
          endpoint: link?.endpoint,
          serviceName: link?.serviceName || link?.targetNodeName,
        };
        secActionMetas.push(actionMeta);

        // Action component file INSIDE section folder under _components
        const componentFilePath = `${sectionDir}/${compName}.tsx`;
        pageFiles.push({
          filename: componentFilePath,
          language: "typescript",
          content: generateEventComponent(
            evtName,
            evtType,
            url,
            method,
            compName,
            targetRoute,
            targetPageLabel,
            requireAuth,
            Object.keys(nodeHeaders).length > 0 ? nodeHeaders : undefined,
            Object.keys(nodeQueryParams).length > 0 ? nodeQueryParams : undefined,
            nodeRequestBody,
            evt,
            link?.endpoint,
            link?.serviceName || link?.targetNodeName,
            storageConfig,
          ),
        });
      });


      // Section component file INSIDE section folder under _components
      const sectionFilePath = `${sectionDir}/${secCompName}.tsx`;
      pageFiles.push({
        filename: sectionFilePath,
        language: "typescript",
        content: generateSectionComponent(sec, secCompName, secActionMetas),
      });

      // Section index file re-exporting the section component
      pageFiles.push({
        filename: `${sectionDir}/index.ts`,
        language: "typescript",
        content: `export * from "./${secCompName}";\nexport { default } from "./${secCompName}";\n`,
      });

      sectionsMeta.push({
        id: sec.id,
        name: secName,
        folderName: secFolder,
        componentName: secCompName,
        renderMode: sec.renderMode,
        actions: secActionMetas,
        hasSidebar: (sec.componentBindings || []).some(
          (cb) => cb.componentType === "sidebar",
        ),
      });
    });

    const isAuth = isAuthPage(pageMeta, effectiveAuthNode?.data);
    if (isAuth) {
      const baseName = pageMeta.componentName.replace(/Page$/, "");
      const formCompName = baseName.endsWith("Form") ? baseName : `${baseName}Form`;
      const formFilePath = pageMeta.isRoot
        ? `app/${groupFolder}/_components/${formCompName}.tsx`
        : `app/${groupFolder}/${pageMeta.slug}/_components/${formCompName}.tsx`;

      pageFiles.push({
        filename: formFilePath,
        language: "typescript",
        content: generateAuthFormComponent(pageMeta, effectiveAuthNode?.data, pagesInfo),
      });
    }

    const pageCode = generatePageCode(
      pageMeta,
      pageLoadFetchStatements,
      sectionsMeta,
      effectiveAuthNode?.data,
      pageLoadDataType,
      pageLoadDataTypeDecl,
      unmountCleanupsList.join("\n      "),
      pageStoreImports,
    );

    const targetFilePath = pageMeta.isRoot
      ? `app/${groupFolder}/page.tsx`
      : `app/${groupFolder}/${pageMeta.slug}/page.tsx`;

    // If the node has AI-edited page source code, use it directly.
    // This prevents compiler re-runs from overwriting UI edits made via
    // the page visual editor. The AI-edited content is stored in Convex
    // and syncs to all collaborators automatically.
    const finalPageContent = node.data?.pageSourceCode
      ? String(node.data.pageSourceCode)
      : pageCode;

    pageFiles.push({
      filename: targetFilePath,
      language: "typescript",
      content: finalPageContent,
    });

    if (pageMeta.slug === "not-found") {
      pageFiles.push({
        filename: "app/not-found.tsx",
        language: "typescript",
        content: `export { default } from "./${groupFolder}/${pageMeta.slug}/page";\n`,
      });

      pageFiles.push({
        filename: "app/[...not_found]/page.tsx",
        language: "typescript",
        content: `import { notFound } from "next/navigation";\n\nexport default function NotFoundCatchAll() {\n  notFound();\n}\n`,
      });
    }
  });

  // If an AuthNode is connected, ensure default sign-in and sign-up pages exist if not explicitly on canvas
  if (authNode) {
    const hasSignIn = pagesInfo.some((p) => isAuthLoginPage(p, authNode.data));
    const hasSignUp = pagesInfo.some((p) => isAuthRegisterPage(p, authNode.data));

    const redirects = authNode.data?.redirects || {};
    const rawSignInNode = redirects.signInPageNodeId
      ? pagesInfo.find((p) => p.nodeId === redirects.signInPageNodeId)
      : undefined;
    const rawSignUpNode = redirects.signUpPageNodeId
      ? pagesInfo.find((p) => p.nodeId === redirects.signUpPageNodeId)
      : undefined;

    const rawSignIn = (rawSignInNode ? rawSignInNode.routePath : (redirects.signInPageUrl || "/login")).replace(/^\/+/, "");
    const rawSignUp = (rawSignUpNode ? rawSignUpNode.routePath : (redirects.signUpPageUrl || "/register")).replace(/^\/+/, "");

    if (!hasSignIn) {
      const signInSlug = rawSignIn || "login";
      const signInCompName = slugToComponentName(signInSlug);
      const baseName = signInCompName.replace(/Page$/, "");
      const formCompName = baseName.endsWith("Form") ? baseName : `${baseName}Form`;
      const pageMeta: PageInfo = {
        nodeId: `synthetic-${signInSlug}`,
        label: `/${signInSlug}`,
        slug: signInSlug,
        routePath: `/${signInSlug}`,
        componentName: signInCompName,
        isRoot: false,
        isAuthPage: true,
      };

      pageFiles.push({
        filename: `app/(public)/${signInSlug}/_components/${formCompName}.tsx`,
        language: "typescript",
        content: generateAuthFormComponent(pageMeta, authNode.data, pagesInfo),
      });

      pageFiles.push({
        filename: `app/(public)/${signInSlug}/page.tsx`,
        language: "typescript",
        content: generatePageCode(pageMeta, "", [], authNode.data),
      });
    }

    if (!hasSignUp) {
      const signUpSlug = rawSignUp || "register";
      const signUpCompName = slugToComponentName(signUpSlug);
      const baseName = signUpCompName.replace(/Page$/, "");
      const formCompName = baseName.endsWith("Form") ? baseName : `${baseName}Form`;
      const pageMeta: PageInfo = {
        nodeId: `synthetic-${signUpSlug}`,
        label: `/${signUpSlug}`,
        slug: signUpSlug,
        routePath: `/${signUpSlug}`,
        componentName: signUpCompName,
        isRoot: false,
        isAuthPage: true,
      };

      pageFiles.push({
        filename: `app/(public)/${signUpSlug}/_components/${formCompName}.tsx`,
        language: "typescript",
        content: generateAuthFormComponent(pageMeta, authNode.data, pagesInfo),
      });

      pageFiles.push({
        filename: `app/(public)/${signUpSlug}/page.tsx`,
        language: "typescript",
        content: generatePageCode(pageMeta, "", [], authNode.data),
      });
    }
  }

  return { pageFiles, hasExplicitRoot };
}
