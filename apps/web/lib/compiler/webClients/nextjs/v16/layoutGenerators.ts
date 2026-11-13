import { PageInfo } from "./types";
import {
  CompiledFile,
  BackendNode,
  BackendEdge,
  WebAppZone,
  ServerGuardConfig,
  PageSection,
  UIEventItem,
  ConditionNode,
  Endpoint,
} from "@workspace/canvas/types";
import { labelToSlug, slugToComponentName } from "./slugUtils";
import { generateLayoutEventsDrawer } from "./page-generators";
import { generateEventComponent } from "./eventGenerators";
import { resolveLinkedEndpoint } from "./endpointResolver";

export function generateRootLayout(
  projectName: string,
  pagesNavLinks?: string,
  showNav: boolean = false,
  hasProviders: boolean = false,
  hasEventsDrawer: boolean = false,
): string {
  const navBar = showNav && pagesNavLinks && pagesNavLinks.trim().length > 0
    ? `\n        <nav className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-50 px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link href="/" className="font-bold text-foreground flex items-center gap-2 text-sm hover:opacity-90 transition-opacity">
              <span>${projectName}</span>
            </Link>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              ${pagesNavLinks}
            </div>
          </div>
        </nav>`
    : "";

  const providersImport = hasProviders ? `\nimport { AppProviders } from "./providers";` : "";
  const drawerImport = hasEventsDrawer ? `\nimport { LayoutEventsDrawer } from "./_components/LayoutEventsDrawer";` : "";
  const childrenJsx = hasProviders
    ? `<AppProviders>{children}</AppProviders>`
    : `{children}`;

  return `import type { Metadata } from "next";${showNav && pagesNavLinks ? `\nimport Link from "next/link";` : ""}${providersImport}${drawerImport}
import "@workspace/ui/globals.css";

export const metadata: Metadata = {
  title: "${projectName}",
  description: "${projectName} generated with Dezign2App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground min-h-screen antialiased flex flex-col font-sans">${navBar}
        <div className="flex-1">
          ${childrenJsx}
        </div>${hasEventsDrawer ? `\n        <LayoutEventsDrawer />` : ""}
      </body>
    </html>
  );
}
`;
}

/**
 * Resolves static sidebar item href by substituting dynamic path parameters
 * (e.g. /chat/[id] -> /chat/new) and appending configured query parameters (e.g. ?tab=chat).
 */
export function resolveSidebarItemHref(sItem: {
  link?: string;
  pathParams?: Array<{ name: string; value: string; mode?: string; storeVar?: string; sourceParamName?: string }>;
  queryParams?: Array<{ key: string; value: string; mode?: string; storeVar?: string; sourceParamName?: string }>;
}): string {
  let link = sItem.link || "#";
  if (link === "#") return link;

  // Substitute configured path parameters
  if (sItem.pathParams && sItem.pathParams.length > 0) {
    for (const p of sItem.pathParams) {
      if (p.name) {
        let replacement = p.value;
        if (!replacement) {
          if (p.mode === "store_var" && p.storeVar) {
            replacement = p.storeVar;
          } else if (p.mode === "route_param") {
            replacement = p.sourceParamName || p.name;
          } else if (p.mode === "query_param") {
            replacement = p.sourceParamName || p.name;
          } else {
            replacement = p.name;
          }
        }
        link = link.replace(new RegExp(`\\[${p.name}\\]`, "g"), encodeURIComponent(replacement));
      }
    }
  }

  // Any remaining unconfigured [param] becomes safe param name
  link = link.replace(/\[([^\]]+)\]/g, "$1");

  // Append query parameters
  if (sItem.queryParams && sItem.queryParams.length > 0) {
    const validParams = sItem.queryParams.filter((q) => q.key && q.key.trim().length > 0);
    if (validParams.length > 0) {
      const queryString = validParams
        .map((q) => {
          let val = q.value;
          if (!val) {
            if (q.mode === "store_var" && q.storeVar) val = q.storeVar;
            else if (q.mode === "route_param") val = q.sourceParamName || q.key;
            else if (q.mode === "query_param") val = q.sourceParamName || q.key;
            else val = "";
          }
          return `${encodeURIComponent(q.key)}=${encodeURIComponent(val)}`;
        })
        .join("&");
      link += (link.includes("?") ? "&" : "?") + queryString;
    }
  }

  return link;
}

export function generateSectionLayout(
  groupName: string,
  isAuthConnected: boolean = true,
  layoutDescription?: string,
  zone?: WebAppZone,
  layoutNode?: BackendNode,
  authNode?: BackendNode,
  hasEventsDrawer: boolean = false,
): string {
  const isPublic = groupName === "public";
  const componentName = slugToComponentName(groupName).replace(/Page$/, "") + "Layout";
  const descriptionDoc = layoutDescription
    ? `\n/**\n * Layout Specification:\n * ${layoutDescription.replace(/\n/g, "\n * ")}\n */`
    : "";

  const sections: PageSection[] = layoutNode?.data?.sections ?? [];
  const nonChildrenSections = sections.filter(
    (s: PageSection) => !s.name?.toLowerCase().includes("children"),
  );

  const sidebarSection = sections.find((s: PageSection) =>
    (s.componentBindings || []).some((cb) => cb.componentType === "sidebar"),
  );
  const sidebarComp = sidebarSection?.componentBindings?.find(
    (cb) => cb.componentType === "sidebar",
  );

  const topbarSection = sections.find((s: PageSection) =>
    (s.componentBindings || []).some(
      (cb) =>
        cb.componentType === "topbar" ||
        cb.name?.toLowerCase().includes("topbar") ||
        cb.label?.toLowerCase().includes("topbar"),
    ),
  );
  const topbarComp = topbarSection?.componentBindings?.find(
    (cb) =>
      cb.componentType === "topbar" ||
      cb.name?.toLowerCase().includes("topbar") ||
      cb.label?.toLowerCase().includes("topbar"),
  );

  const topbarSticky = topbarComp?.propMappings?.topbarSticky ?? true;
  const topbarTitle =
    topbarComp?.propMappings?.topbarTitle ||
    slugToComponentName(groupName).replace(/Page$/, "") ||
    "Dezign App";
  const showAuthButtons = topbarComp?.propMappings?.showAuthButtons ?? true;
  const signInText = topbarComp?.propMappings?.signInText || "Sign In";
  const signInLink = topbarComp?.propMappings?.signInLink || "/login";
  const registerText = topbarComp?.propMappings?.registerText || "Register";
  const registerLink = topbarComp?.propMappings?.registerLink || "/register";

  const topbarStaticItems =
    topbarComp?.propMappings?.topbarStaticItems &&
    topbarComp.propMappings.topbarStaticItems.length > 0
      ? topbarComp.propMappings.topbarStaticItems
      : topbarComp?.propMappings?.sidebarStaticItems &&
        topbarComp.propMappings.sidebarStaticItems.length > 0
      ? topbarComp.propMappings.sidebarStaticItems
      : [
          { id: "nav-1", name: "Home", link: "/" },
          { id: "nav-2", name: "Features", link: "/features" },
          { id: "nav-3", name: "Pricing", link: "/pricing" },
          { id: "nav-4", name: "About", link: "/about" },
        ];

  const topbarItemsJsx = topbarStaticItems
    .map((sItem) => {
      const resolvedHref = resolveSidebarItemHref(sItem);
      return `          <Link
            key="${sItem.id}"
            href="${resolvedHref}"
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ${sItem.name}
          </Link>`;
    })
    .join("\n");

  const authButtonsJsx = showAuthButtons
    ? `          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="text-xs h-8">
              <Link href="${signInLink}">${signInText}</Link>
            </Button>
            <Button size="sm" asChild className="text-xs h-8">
              <Link href="${registerLink}">${registerText}</Link>
            </Button>
          </div>`
    : "";

  const topbarImports = `import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { Layers } from "lucide-react";`;

  const sidebarCollapsible = sidebarComp?.propMappings?.sidebarCollapsible || "icon";
  const sidebarVariant = sidebarComp?.propMappings?.sidebarVariant || "sidebar";
  const sidebarTitle =
    sidebarComp?.propMappings?.sidebarTitle ||
    slugToComponentName(groupName).replace(/Page$/, "") ||
    "App Navigation";

  const staticItems =
    sidebarComp?.propMappings?.sidebarStaticItems &&
    sidebarComp.propMappings.sidebarStaticItems.length > 0
      ? sidebarComp.propMappings.sidebarStaticItems
      : [
          { id: "nav-1", name: "Dashboard", link: "/dashboard" },
          { id: "nav-2", name: "Settings", link: "/settings" },
        ];

  const navIconNames = ["LayoutDashboard", "BarChart2", "Folder", "Settings"];

  const sidebarGroups = sidebarComp?.propMappings?.sidebarGroups;
  const hasSidebarGroups = Boolean(sidebarGroups && sidebarGroups.length > 0);

  const hasSidebarActions =
    staticItems.some(
      (sItem) => sItem.itemType === "action" || Boolean(sItem.actionId || sItem.actionName),
    ) ||
    Boolean(
      sidebarGroups?.some((grp) =>
        grp.items?.some(
          (sItem) => sItem.itemType === "action" || Boolean(sItem.actionId || sItem.actionName),
        ),
      ),
    );

  const staticItemsJsx = staticItems
    .map((sItem, sIdx) => {
      const IconComp = navIconNames[sIdx % navIconNames.length];
      const isActionButton = sItem.itemType === "action" || Boolean(sItem.actionId || sItem.actionName);
      if (isActionButton) {
        return `                      <SidebarMenuItem key="${sItem.id}">
                        <SidebarActionButton actionName="${sItem.actionName || sItem.name}" actionId="${sItem.actionId || ""}" tooltip="${sItem.name}" className="transition-all duration-150 ease-in-out cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                          <${IconComp} className="size-3.5 shrink-0 mr-2 inline-block transition-transform duration-150 group-hover/menu-item:scale-105" />
                          <span>${sItem.name}</span>
                        </SidebarActionButton>
                      </SidebarMenuItem>`;
      }
      const resolvedHref = resolveSidebarItemHref(sItem);
      return `                      <SidebarMenuItem key="${sItem.id}">
                        <SidebarMenuButton asChild tooltip="${sItem.name}" className="transition-all duration-150 ease-in-out cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                          <Link href="${resolvedHref}" className="text-xs">
                            <${IconComp} className="size-3.5 shrink-0 mr-2 inline-block transition-transform duration-150 group-hover/menu-item:scale-105" />
                            <span>${sItem.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>`;
    })
    .join("\n");

  let sidebarGroupsContentJsx = "";
  if (hasSidebarGroups) {
    sidebarGroupsContentJsx = sidebarGroups!
      .map((grp, gIdx) => {
        const groupLabel = grp.label || `Section ${gIdx + 1}`;
        const grpItems =
          grp.items && grp.items.length > 0
            ? grp.items
            : [
                { id: `nav-${gIdx}-1`, name: `${groupLabel} Item 1`, link: "#" },
              ];

        const groupItemsJsx = grpItems
          .map((sItem, sIdx) => {
            const IconComp = navIconNames[(gIdx * 2 + sIdx) % navIconNames.length];
            const isActionButton = sItem.itemType === "action" || Boolean(sItem.actionId || sItem.actionName);
            if (isActionButton) {
              return `                      <SidebarMenuItem key="${sItem.id}">
                        <SidebarActionButton actionName="${sItem.actionName || sItem.name}" actionId="${sItem.actionId || ""}" tooltip="${sItem.name}" className="transition-all duration-150 ease-in-out cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                          <${IconComp} className="size-3.5 shrink-0 mr-2 inline-block transition-transform duration-150 group-hover/menu-item:scale-105" />
                          <span>${sItem.name}</span>
                        </SidebarActionButton>
                      </SidebarMenuItem>`;
            }
            const resolvedHref = resolveSidebarItemHref(sItem);
            return `                      <SidebarMenuItem key="${sItem.id}">
                        <SidebarMenuButton asChild tooltip="${sItem.name}" className="transition-all duration-150 ease-in-out cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                          <Link href="${resolvedHref}" className="text-xs">
                            <${IconComp} className="size-3.5 shrink-0 mr-2 inline-block transition-transform duration-150 group-hover/menu-item:scale-105" />
                            <span>${sItem.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>`;
          })
          .join("\n");

        return `            <SidebarGroup key="${grp.id || gIdx}">
              <SidebarGroupLabel className="text-[10px]">${groupLabel}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
${groupItemsJsx}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>`;
      })
      .join("\n");
  } else {
    sidebarGroupsContentJsx = `            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px]">Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
${staticItemsJsx}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>`;
  }

  const sidebarImports = `import Link from "next/link";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { PanelLeft, LayoutDashboard, BarChart2, Folder, Settings } from "lucide-react";`;

  let headerImports = "";
  if (sidebarComp && topbarComp) {
    headerImports = `${sidebarImports}\nimport { Button } from "@workspace/ui/components/button";\nimport { Layers } from "lucide-react";\n`;
  } else if (sidebarComp) {
    headerImports = `${sidebarImports}\n`;
  } else if (topbarComp) {
    headerImports = `${topbarImports}\n`;
  }

  if (hasSidebarActions) {
    headerImports = `${headerImports}import { SidebarActionButton } from "./_components/SidebarActionButton";\n`;
  }

  if (hasEventsDrawer) {
    headerImports = `${headerImports}import { LayoutEventsDrawer } from "./_components/LayoutEventsDrawer";\n`;
  }

  const sidebarTopBarJsx = topbarComp
    ? `          <header className="${topbarSticky ? "sticky top-0 z-50 " : ""}w-full border-b border-border bg-background/80 backdrop-blur px-6 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-sm tracking-tight text-foreground hover:opacity-90 transition-opacity">
              <Layers className="size-4 text-primary" />
              <span>${topbarTitle}</span>
            </Link>
            <nav className="flex items-center gap-6">
${topbarItemsJsx}
            </nav>
${authButtonsJsx}
          </header>\n`
    : "";

  const sectionsJsx = nonChildrenSections.length > 0
    ? nonChildrenSections
        .map((sec: PageSection) => {
          const actionButtons = (sec.actions || [])
            .map(
              (act: UIEventItem) =>
                `          <button type="button" className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity cursor-pointer">${act.name || "Action"}</button>`,
            )
            .join("\n");
          return `      <header className="border-b border-border bg-card/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">${sec.name}</span>
        ${actionButtons ? `<div className="flex items-center gap-2">\n${actionButtons}\n        </div>` : ""}
      </header>`;
        })
        .join("\n")
    : "";

  const layoutBodyJsx = sidebarComp
    ? `    <SidebarProvider className="min-h-screen">
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar collapsible="${sidebarCollapsible}" variant="${sidebarVariant}">
          <SidebarHeader className="border-b border-sidebar-border px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <PanelLeft className="size-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate group-data-[collapsible=icon]:hidden text-sidebar-foreground">
                ${sidebarTitle}
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
${sidebarGroupsContentJsx}
          </SidebarContent>
          <SidebarTrigger className="absolute -right-3.5 top-3.5 z-20 h-6 w-6 rounded-full border border-sidebar-border bg-background shadow-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center justify-center text-sidebar-foreground cursor-pointer transition-all duration-200 group-data-[side=right]:-left-3.5 group-data-[side=right]:right-auto hover:scale-105" />
          <SidebarRail />
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
${sidebarTopBarJsx}          <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-auto">
            {children}
          </main>${hasEventsDrawer ? `\n          <LayoutEventsDrawer />` : ""}
        </div>
      </div>
    </SidebarProvider>`
    : topbarComp
    ? `    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="${topbarSticky ? "sticky top-0 z-50 " : ""}w-full border-b border-border bg-background/80 backdrop-blur px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-sm tracking-tight text-foreground hover:opacity-90 transition-opacity">
            <Layers className="size-4 text-primary" />
            <span>${topbarTitle}</span>
          </Link>
          <nav className="flex items-center gap-6">
${topbarItemsJsx}
          </nav>
${authButtonsJsx}
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>${hasEventsDrawer ? `\n      <LayoutEventsDrawer />` : ""}
    </div>`
    : `    <div className="min-h-screen flex flex-col bg-background text-foreground">
${sectionsJsx ? `${sectionsJsx}\n` : ""}      <div className="flex-1">{children}</div>${hasEventsDrawer ? `\n      <LayoutEventsDrawer />` : ""}
    </div>`;

  if (isPublic || !isAuthConnected) {
    return `import React from "react";
${headerImports}${descriptionDoc}
export default function ${componentName}({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
${layoutBodyJsx}
  );
}
`;
  }

  const authRedirects = authNode?.data?.redirects;
  const defaultSignIn = authRedirects?.signInPageUrl || "/login";
  const defaultUnauthorized = authRedirects?.unauthorizedUrl || "/unauthorized";
  const defaultPricing = authRedirects?.pricingUrl || "/pricing";

  // Check conditions on zone to choose appropriate redirect category
  const condNode = zone?.rule?.conditions;
  let hasRoleCond = false;
  let hasPlanCond = false;
  const checkCond = (c?: ConditionNode) => {
    if (!c) return;
    if (c.kind === "leaf" && c.condition) {
      if (c.condition.type === "orgRole") hasRoleCond = true;
      if (c.condition.type === "plan" || c.condition.type === "subscriptionStatus") hasPlanCond = true;
    } else if (c.kind === "group" && Array.isArray(c.children)) {
      c.children.forEach(checkCond);
    }
  };
  checkCond(condNode);

  const failRedirect = hasRoleCond
    ? zone?.rule?.redirects?.["wrong-role"] ||
      zone?.rule?.redirects?.["no-access"] ||
      zone?.rule?.redirects?.["default"] ||
      defaultUnauthorized
    : hasPlanCond
    ? zone?.rule?.redirects?.["wrong-plan"] ||
      zone?.rule?.redirects?.["no-access"] ||
      zone?.rule?.redirects?.["default"] ||
      defaultPricing
    : zone?.rule?.redirects?.["no-auth"] ||
      zone?.rule?.redirects?.["default"] ||
      defaultSignIn;

  return `import React from "react";
${headerImports}${descriptionDoc}
/**
 * Next.js Protected Section Layout
 * Tier 2 Validation: Deep session verification via requireSession() helper
 */
export default async function ${componentName}({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const { requireSession } = await import("@/lib/auth/require-session");
    await requireSession("${failRedirect}");
  } catch (err) {
    if (
      Boolean(err) &&
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      String(err.digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    const { redirect } = await import("next/navigation");
    redirect("${failRedirect}");
  }

  return (
${layoutBodyJsx}
  );
}
`;
}

/**
 * Generates a server-side DB-check layout.tsx for a server-guard zone.
 * Runs in the Node.js runtime (not Edge) — can call DB functions directly.
 */
export function generateServerGuardLayout(
  groupName: string,
  guard: ServerGuardConfig,
  layoutDescription?: string,
  authNode?: BackendNode,
): string {
  const componentName = slugToComponentName(groupName).replace(/Page$/, "") + "Layout";
  const entityLabel = guard.entityLabel || "Entity";
  const failRedirect = guard.failRedirect || authNode?.data?.redirects?.unauthorizedUrl || "/unauthorized";
  const requireSession = guard.requireSession !== false;
  const headerName = guard.headerName || "x-api-key";

  const descriptionDoc = layoutDescription
    ? `\n/**\n * Layout Specification:\n * ${layoutDescription.replace(/\n/g, "\n * ")}\n */`
    : "";

  const sessionImport = requireSession ? `import { auth } from "@/lib/auth";\n` : "";

  const sessionBlock = requireSession
    ? `  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");\n`
    : "";

  let paramExpr: string;
  if (guard.param === "userId") {
    paramExpr = requireSession
      ? "session.user.id"
      : `"" /* ⚠ param=userId requires a session — enable requireSession or switch param */`;
  } else if (guard.param === "sessionToken") {
    paramExpr = requireSession
      ? "session.token"
      : `"" /* ⚠ param=sessionToken requires a session — enable requireSession or switch param */`;
  } else {
    paramExpr = `(await headers()).get("${headerName}") ?? ""`;
  }

  let guardBlock: string;
  if (guard.checkMode === "dbFunction") {
    const fnName = guard.dbFunctionName || guard.dbFunctionId || "checkAccess";
    guardBlock = `  // Server guard: ${fnName}() on ${entityLabel}
  const guardOk = await db.${entityLabel}.${fnName}(${paramExpr});
  if (!guardOk) redirect("${failRedirect}");\n`;
  } else {
    const fieldName = guard.entityField || "isActive";
    const expected = JSON.stringify(guard.entityFieldExpectedValue ?? "true");
    guardBlock = `  // Server guard: ${entityLabel}.${fieldName} === ${expected}
  const record = await db.${entityLabel}.findByUserId(${paramExpr});
  if (record?.${fieldName} !== ${expected}) redirect("${failRedirect}");\n`;
  }

  return `import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@workspace/db";
${sessionImport}${descriptionDoc}
/**
 * Next.js Server Guard Layout — ${groupName}
 * Runs a real DB check on every request (Node.js runtime, not Edge).
 * Generated by Dezign2App — do not edit manually.
 */
export default async function ${componentName}({
  children,
}: {
  children: React.ReactNode;
}) {
${sessionBlock}${guardBlock}
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="flex-1">{children}</div>
    </div>
  );
}
`;
}

/**
 * Generates section layout files for all route groups present in pagesInfo
 */
export function generateRouteGroupLayouts(
  pagesInfo: PageInfo[],
  isAuthConnected: boolean = true,
  webAppNode?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  authNode?: BackendNode,
  endpoints: (Endpoint & { nodeId: string })[] = [],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const zones: WebAppZone[] = Array.isArray(webAppNode?.data?.zones)
    ? webAppNode.data.zones
    : [];

  // Collect all unique route group folder paths across pages
  // e.g. "(private)", "(private)/(subscribed)", "(public)"
  const prefixMap = new Map<string, { folderPath: string; leafGroup: string }>();

  pagesInfo.forEach((p) => {
    if (p.routeGroupHierarchy && p.routeGroupHierarchy.length > 0) {
      for (let i = 1; i <= p.routeGroupHierarchy.length; i++) {
        const subHierarchy = p.routeGroupHierarchy.slice(0, i);
        const folderPath = subHierarchy.map((g) => `(${g})`).join("/");
        const leafGroup = subHierarchy[subHierarchy.length - 1] ?? "public";
        prefixMap.set(folderPath, { folderPath, leafGroup });
      }
    } else {
      const g = p.routeGroup || "public";
      prefixMap.set(`(${g})`, { folderPath: `(${g})`, leafGroup: g });
    }
  });

  if (prefixMap.size === 0) {
    prefixMap.set("(public)", { folderPath: "(public)", leafGroup: "public" });
  }

  prefixMap.forEach(({ folderPath, leafGroup }) => {
    const matchedZone = zones.find(
      (z) =>
        z.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === leafGroup ||
        (leafGroup === "public" && (z.id === "zone-public" || z.accessType === "public")) ||
        (leafGroup === "private" && (z.id === "zone-private" || z.accessType === "protected")),
    );

    // If zone explicitly has layout disabled, skip generating layout.tsx
    if (matchedZone && matchedZone.hasLayout === false) {
      return;
    }

    // Check for layout-level page info
    const layoutPageInfo = pagesInfo.find(
      (p) =>
        p.isLayout &&
        (p.routeGroup === leafGroup ||
          p.routeGroupPath === folderPath),
    );

    // Find any connected layout node for this zone or route group
    const connectedLayoutNode = allNodes.find((n) => {
      if (n.type !== "webPage") return false;
      const isLayout =
        Boolean(n.data?.isLayout) || n.data?.label?.trim().toLowerCase() === "layout";
      if (!isLayout) return false;
      if (layoutPageInfo && n.id === layoutPageInfo.nodeId) return true;
      if (n.data?.routeGroup === leafGroup) return true;
      if (n.data?.path && (n.data.path.includes(folderPath) || n.data.path.includes(leafGroup))) return true;
      if (matchedZone && n.data?.zoneId === matchedZone.id) return true;
      if (matchedZone && webAppNode) {
        return allEdges.some((e) => {
          return (
            (e.source === webAppNode?.id &&
              e.sourceHandle === matchedZone.handleId &&
              e.target === n.id) ||
            (e.target === webAppNode?.id &&
              e.targetHandle === matchedZone.handleId &&
              e.source === n.id)
          );
        });
      }
      return false;
    });

    const layoutRealtimeConns = layoutPageInfo?.realtimeConnections ?? [];
    const hasEventsDrawer = Array.isArray(layoutRealtimeConns) && layoutRealtimeConns.length > 0;

    if (hasEventsDrawer) {
      files.push({
        filename: `app/${folderPath}/_components/LayoutEventsDrawer.tsx`,
        language: "typescript",
        content: generateLayoutEventsDrawer(
          layoutRealtimeConns,
          Boolean(authNode),
          leafGroup,
        ),
      });
    }

    // If layout node has custom source code written in Studio or AI, use it directly
    if (connectedLayoutNode?.data?.pageSourceCode) {
      files.push({
        filename: `app/${folderPath}/layout.tsx`,
        language: "typescript",
        content: connectedLayoutNode.data.pageSourceCode,
      });
      return;
    }

    // Server-guard zones get a DB-check layout instead of the JWT requireSession() layout
    if (
      matchedZone?.protectionMode === "server-guard" &&
      matchedZone.serverGuard?.entityNodeId
    ) {
      files.push({
        filename: `app/${folderPath}/layout.tsx`,
        language: "typescript",
        content: generateServerGuardLayout(
          leafGroup,
          matchedZone.serverGuard,
          connectedLayoutNode?.data?.description || matchedZone.layoutDescription,
          authNode,
        ),
      });
      return; // don't fall through to generateSectionLayout
    }

    // Default: JWT-based middleware + requireSession() layout
    const layoutSections: PageSection[] = connectedLayoutNode?.data?.sections ?? [];
    const layoutSidebarSection = layoutSections.find((s: PageSection) =>
      (s.componentBindings || []).some((cb) => cb.componentType === "sidebar"),
    );
    const layoutSidebarComp = layoutSidebarSection?.componentBindings?.find(
      (cb) => cb.componentType === "sidebar",
    );
    const layoutStaticItems = layoutSidebarComp?.propMappings?.sidebarStaticItems || [];
    const layoutSidebarGroups = layoutSidebarComp?.propMappings?.sidebarGroups || [];

    // Compile every action configured in layout sections into standalone action files
    // and compile the exact configured pipeline steps (auth, API, storage, navigation, etc.)
    const layoutActions: { evt: UIEventItem; compName: string }[] = [];
    layoutSections.forEach((sec) => {
      (sec.actions || []).forEach((evt, evtIdx) => {
        const evtName = evt.name || "Action";
        const evtType = evt.event || "click";
        const compName = slugToComponentName(labelToSlug(evtName, evtIdx)).replace(/Page$/, "Action");
        layoutActions.push({ evt, compName });

        const link = connectedLayoutNode
          ? resolveLinkedEndpoint(connectedLayoutNode.id, evt.id, allNodes, allEdges, endpoints)
          : null;

        const actionCode = generateEventComponent(
          evtName,
          evtType,
          link?.fullUrl || evt.url || "",
          link?.method || evt.method || "POST",
          compName,
          evt.targetRoute,
          undefined,
          Boolean(authNode),
          undefined,
          undefined,
          undefined,
          evt,
          link?.endpoint,
          link?.serviceName,
        );

        files.push({
          filename: `app/${folderPath}/_components/${compName}.tsx`,
          language: "typescript",
          content: actionCode,
        });
      });
    });

    const isActionItem = (sItem: any) =>
      sItem.itemType === "action" ||
      Boolean(sItem.actionId || sItem.actionName) ||
      layoutActions.some((a) => a.evt.id === sItem.actionId || a.evt.name === sItem.actionName || a.evt.name === sItem.name);

    const hasSidebarActionBtns =
      layoutStaticItems.some(isActionItem) ||
      layoutSidebarGroups.some((grp: any) =>
        (grp.items || []).some(isActionItem),
      ) ||
      layoutActions.length > 0;

    if (hasSidebarActionBtns) {
      files.push({
        filename: `app/${folderPath}/_components/SidebarActionButton.tsx`,
        language: "typescript",
        content: generateSidebarActionButtonCode(layoutActions),
      });
    }

    files.push({
      filename: `app/${folderPath}/layout.tsx`,
      language: "typescript",
      content: generateSectionLayout(
        leafGroup,
        isAuthConnected,
        connectedLayoutNode?.data?.description || matchedZone?.layoutDescription,
        matchedZone,
        connectedLayoutNode,
        authNode,
        hasEventsDrawer,
      ),
    });
  });

  return files;
}

export function generateSidebarActionButtonCode(
  layoutActions: { evt: UIEventItem; compName: string }[] = [],
): string {
  const actionImports = layoutActions
    .map((a) => `import { handle${a.compName} } from "./${a.compName}";`)
    .join("\n");

  const handlerEntries = layoutActions
    .flatMap((a) => {
      const entries: string[] = [];
      const cleanName = (a.evt.name || "").trim().toLowerCase();
      if (cleanName) {
        entries.push(`  "${cleanName}": () => handle${a.compName}(),`);
      }
      if (a.evt.name) {
        entries.push(`  "${a.evt.name}": () => handle${a.compName}(),`);
      }
      if (a.evt.id) {
        entries.push(`  "${a.evt.id}": () => handle${a.compName}(),`);
      }
      entries.push(`  "${a.compName}": () => handle${a.compName}(),`);
      entries.push(`  "${a.compName.toLowerCase()}": () => handle${a.compName}(),`);
      return entries;
    })
    .join("\n");

  return `"use client";

import React, { useState } from "react";
import { SidebarMenuButton } from "@workspace/ui/components/sidebar";
${actionImports ? `${actionImports}\n` : ""}
export interface SidebarActionButtonProps {
  actionName?: string;
  actionId?: string;
  tooltip?: string;
  className?: string;
  children?: React.ReactNode;
}

const actionHandlers: Record<string, () => Promise<unknown>> = {
${handlerEntries}
};

export function SidebarActionButton({
  actionName = "action",
  actionId,
  tooltip,
  className,
  children,
}: SidebarActionButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const clean = actionName.trim().toLowerCase();
      const handler =
        (actionId && actionHandlers[actionId]) ||
        (actionName && actionHandlers[actionName]) ||
        (clean && actionHandlers[clean]);

      if (handler) {
        await handler();
        return;
      }

      window.dispatchEvent(
        new CustomEvent("dezign:action", {
          detail: { actionName, actionId },
        })
      );
    } catch (err) {
      console.error(\`Failed to execute action \${actionName}:\`, err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidebarMenuButton
      tooltip={tooltip || actionName}
      className={className}
      onClick={handleClick}
      disabled={isSubmitting}
    >
      {children}
    </SidebarMenuButton>
  );
}

export default SidebarActionButton;
`;
}
