import { CompiledFile } from "@workspace/canvas/types";

export interface ResolvedProvidersResult {
  file: CompiledFile | null;
  hasProviders: boolean;
  requiredPackages: { name: string; version: string }[];
}

export function resolveAppProviders(
  libraries: string[] = [],
  forceProviders: boolean = false,
): ResolvedProvidersResult {
  const libSet = new Set(libraries.map((l) => l.trim().toLowerCase()));

  const hasReactQuery = libSet.has("@tanstack/react-query");
  const hasNextThemes = libSet.has("next-themes");
  const hasSonner = libSet.has("sonner");

  const hasProviders = forceProviders || hasReactQuery || hasNextThemes || hasSonner;

  if (!hasProviders) {
    return {
      file: null,
      hasProviders: false,
      requiredPackages: [],
    };
  }

  const imports: string[] = ['import React from "react";'];
  const hooks: string[] = [];
  const requiredPackages: { name: string; version: string }[] = [];

  if (hasReactQuery) {
    imports.push('import { QueryClient, QueryClientProvider } from "@tanstack/react-query";');
    hooks.push("useState");
    requiredPackages.push({ name: "@tanstack/react-query", version: "^5.28.0" });
  }

  if (hasNextThemes) {
    imports.push('import { ThemeProvider } from "next-themes";');
    requiredPackages.push({ name: "next-themes", version: "^0.3.0" });
  }

  if (hasSonner) {
    imports.push('import { Toaster } from "sonner";');
    requiredPackages.push({ name: "sonner", version: "^1.4.0" });
  }

  const reactImport = hooks.length > 0
    ? `import React, { ${hooks.join(", ")} } from "react";`
    : 'import React from "react";';

  // Replace default React import with hooked import if needed
  imports[0] = reactImport;

  // Internal state logic
  const stateLogic: string[] = [];
  if (hasReactQuery) {
    stateLogic.push("  const [queryClient] = useState(() => new QueryClient());");
  }

  // Nest children in wrappers
  let wrappedJsx = "{children}";

  if (hasSonner) {
    wrappedJsx = `      ${wrappedJsx}
      <Toaster richColors position="top-right" />`;
  }

  if (hasNextThemes) {
    wrappedJsx = `    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      ${wrappedJsx}
    </ThemeProvider>`;
  }

  if (hasReactQuery) {
    wrappedJsx = `    <QueryClientProvider client={queryClient}>
      ${wrappedJsx}
    </QueryClientProvider>`;
  }

  if (!hasReactQuery && !hasNextThemes && !hasSonner) {
    wrappedJsx = "    <>{children}</>";
  }

  const content = `"use client";

${imports.join("\n")}

export interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
${stateLogic.length > 0 ? `${stateLogic.join("\n")}\n\n` : ""}  return (
${wrappedJsx}
  );
}

export default AppProviders;
`;

  return {
    file: {
      filename: "app/providers.tsx",
      language: "typescript",
      content,
    },
    hasProviders: true,
    requiredPackages,
  };
}
