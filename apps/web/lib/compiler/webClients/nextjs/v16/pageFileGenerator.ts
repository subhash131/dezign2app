import { BackendNode, BackendEdge } from "@/types/canvas";
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
import { isAuthPage } from "../../../compileAuth";
import { typeStrToTsAndZod } from "../../../generators/schemaToTypeScript";

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

  webClientNodes.forEach((node, idx) => {
    const pageMeta = pagesInfo[idx]!;
    if (pageMeta.isRoot) {
      hasExplicitRoot = true;
    }

    const effectiveAuthNode =
      authNode ||
      (node.data?.authNodeId
        ? allNodes.find((n) => n.id === node.data.authNodeId && n.type === "auth")
        : undefined);

    const nodeHeaders: Record<string, string> = {};
    (node.data?.headers || []).forEach((h) => {
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
        nodeRequestBody = JSON.parse(node.data.requestBody.rawJson) as JSONValue;
      } catch {}
    } else if (node.data?.requestBody?.fields && node.data.requestBody.fields.length > 0) {
      const bodyObj: Record<string, JSONValue> = {};
      node.data.requestBody.fields.forEach((f) => {
        const fKey = f.name || f.key;
        if (fKey) {
          bodyObj[fKey] = (f.value ?? f.defaultValue ?? (f.type === "number" ? 0 : f.type === "boolean" ? true : "")) as JSONValue;
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
    if (pageLoadEvents.length > 0) {
      const statements: string[] = [];
      const usedSuffixes = new Set<string>();

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

        if (link) {
          const requireAuth = Boolean(effectiveAuthNode) && link.requireAuth !== false;
          const headersEntries = Object.entries(nodeHeaders)
            .map(([k, v]) => `"${k}": "${v}",`)
            .join("\n          ");

          statements.push(`const headers${suffix}: Record<string, string> = {
          "Content-Type": "application/json",
          ${headersEntries}
        };
        ${requireAuth ? `const token${suffix} = await getAuthBearerToken();
        if (token${suffix}) {
          headers${suffix}["Authorization"] = token${suffix};
        }` : ""}
        const res${suffix} = await fetch("${link.fullUrl}", {
          method: "${link.method || "GET"}",
          headers: headers${suffix},
          ${link.method === "POST" || link.method === "PUT" || link.method === "PATCH" ? `body: JSON.stringify(${nodeRequestBody !== undefined ? JSON.stringify(nodeRequestBody) : `{ eventName: "${evt.name || "pageLoad"}", eventType: "pageLoad" }`}),` : ""}
        });
        if (res${suffix}.ok) {
          results["${evtKey}"] = await res${suffix}.json();
        } else {
          results["${evtKey}"] = { error: "HTTP " + res${suffix}.status };
        }`);
        } else {
          statements.push(`results["${evtKey}"] = {
          message: "pageLoad event triggered on mount (no target endpoint connected in canvas)",
        };`);
        }
      });

      pageLoadFetchStatements = `setPageLoadLoading(true);
      setPageLoadError(null);
      try {
        const results: Record<string, JSONValue> = {};
        ${statements.join("\n")}
        setPageLoadData(${pageLoadEvents.length === 1} ? results["${pageLoadEvents[0]?.name || "pageLoad"}"] : results);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load page data";
        setPageLoadError(message);
      } finally {
        setPageLoadLoading(false);
      }`;
    }

    // Derive a typed PageLoadData interface from the first pageLoad endpoint's responseBody
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
          const parsed = JSON.parse(responseBody.rawJson) as Record<string, unknown>;
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

    const groupFolder = pageMeta.routeGroup ? `(${pageMeta.routeGroup})` : "(public)";
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
          requireAuth = Boolean(effectiveAuthNode) && (link ? link.requireAuth !== false : true);
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
        content: generateAuthFormComponent(pageMeta, effectiveAuthNode?.data),
      });
    }

    const pageCode = generatePageCode(
      pageMeta,
      pageLoadFetchStatements,
      sectionsMeta,
      effectiveAuthNode?.data,
      pageLoadDataType,
      pageLoadDataTypeDecl,
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

  return { pageFiles, hasExplicitRoot };
}
