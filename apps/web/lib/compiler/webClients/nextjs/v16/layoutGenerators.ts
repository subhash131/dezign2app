import { PageInfo } from "./types";
import { CompiledFile, BackendNode, WebAppZone } from "@workspace/canvas/types";
import { slugToComponentName } from "./slugUtils";

export function generateRootLayout(
  projectName: string,
  pagesNavLinks?: string,
  showNav: boolean = false,
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

  return `import type { Metadata } from "next";${showNav && pagesNavLinks ? `\nimport Link from "next/link";` : ""}
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
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
`;
}

export function generateSectionLayout(
  groupName: string,
  isAuthConnected: boolean = true,
  layoutDescription?: string,
): string {
  const isPublic = groupName === "public";
  const componentName = slugToComponentName(groupName) + "Layout";
  const descriptionDoc = layoutDescription
    ? `\n/**\n * Layout Specification:\n * ${layoutDescription.replace(/\n/g, "\n * ")}\n */`
    : "";

  if (isPublic || !isAuthConnected) {
    return `import React from "react";
${descriptionDoc}
export default function ${componentName}({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="flex-1">{children}</div>
    </div>
  );
}
`;
  }

  return `import React from "react";
${descriptionDoc}
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
    await requireSession("/login");
  } catch (err) {
    const isRedirect = err && typeof err === "object" && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
    if (isRedirect) {
      throw err;
    }
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }

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
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const routeGroups = new Set<string>();
  pagesInfo.forEach((p) => {
    if (p.routeGroup) routeGroups.add(p.routeGroup);
  });
  if (routeGroups.size === 0) routeGroups.add("public");

  const zones: WebAppZone[] = Array.isArray(webAppNode?.data?.zones)
    ? webAppNode.data.zones
    : [];

  routeGroups.forEach((groupName) => {
    const matchedZone = zones.find(
      (z) =>
        z.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === groupName ||
        (groupName === "public" && (z.id === "zone-public" || z.accessType === "public")) ||
        (groupName === "private" && (z.id === "zone-private" || z.accessType === "protected")),
    );

    // If zone explicitly has layout disabled, skip generating layout.tsx
    if (matchedZone && matchedZone.hasLayout === false) {
      return;
    }

    files.push({
      filename: `app/(${groupName})/layout.tsx`,
      language: "typescript",
      content: generateSectionLayout(
        groupName,
        isAuthConnected,
        matchedZone?.layoutDescription,
      ),
    });
  });

  return files;
}



