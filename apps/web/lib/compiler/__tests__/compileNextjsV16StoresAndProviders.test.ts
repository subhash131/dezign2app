import { describe, it, expect } from "vitest";
import { BackendNode } from "@/types/canvas";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";

describe("compileNextjsV16StoresAndProviders", () => {
  it("generates type-safe Zustand store files when globalStores are defined on WebAppNode", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-stores",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "StoreApp",
        appSlug: "store-app",
        globalStores: [
          {
            id: "store-cart",
            name: "cart",
            description: "Global shopping cart state",
            fields: [
              {
                id: "f-items",
                name: "items",
                type: "array",
                defaultValue: [],
              },
              {
                id: "f-total",
                name: "total",
                type: "number",
                defaultValue: 0,
              },
              {
                id: "f-currency",
                name: "currency",
                type: "string",
                defaultValue: "USD",
              },
            ],
            actions: [
              {
                id: "act-add-item",
                name: "addItem",
                targetFieldId: "f-items",
                actionType: "append",
              },
              {
                id: "act-set-curr",
                name: "updateCurrency",
                targetFieldId: "f-currency",
                actionType: "set",
              },
            ],
          },
        ],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-shop",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/shop",
        appSlug: "store-app",
        sections: [],
      },
    };

    const result = compileNextjsV16WebClient([webPageNode], [], [], [webAppNode, webPageNode], [], "StoreApp", [], "store-app", webAppNode);

    // Should generate lib/stores/useCartStore.ts
    const cartStoreFile = result.files.find((f) => f.filename === "lib/stores/useCartStore.ts");
    expect(cartStoreFile).toBeDefined();
    const code = cartStoreFile!.content;

    expect(code).toContain('"use client";');
    expect(code).toContain('import { create } from "zustand";');
    expect(code).toContain("export interface CartStoreState {");
    expect(code).toContain("items: unknown[];");
    expect(code).toContain("total: number;");
    expect(code).toContain("currency: string;");
    expect(code).toContain("setItems: (value: unknown[]) => void;");
    expect(code).toContain("setTotal: (value: number) => void;");
    expect(code).toContain("setCurrency: (value: string) => void;");
    expect(code).toContain("addItem: (item: unknown) => void;");
    expect(code).toContain("updateCurrency: (value: string) => void;");
    expect(code).toContain("reset: () => void;");
    expect(code).toContain("export const useCartStore = create<CartStoreState>");

    // Should generate lib/stores/index.ts
    const storeIndexFile = result.files.find((f) => f.filename === "lib/stores/index.ts");
    expect(storeIndexFile).toBeDefined();
    expect(storeIndexFile!.content).toContain('export * from "./useCartStore";');

    // Should include zustand in package.json
    const pkgJsonFile = result.files.find((f) => f.filename === "package.json");
    expect(pkgJsonFile).toBeDefined();
    expect(pkgJsonFile!.content).toContain('"zustand":');
  });

  it("generates app/providers.tsx and wraps RootLayout when provider-requiring packages are present", () => {
    const webPageNode: BackendNode = {
      id: "node-page-providers",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/feed",
        appSlug: "feed-app",
        sections: [
          {
            id: "sec-feed",
            name: "Feed Section",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [],
            libraries: ["@tanstack/react-query", "next-themes", "sonner"],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient([webPageNode]);

    // Should generate app/providers.tsx
    const providersFile = result.files.find((f) => f.filename === "app/providers.tsx");
    expect(providersFile).toBeDefined();
    const provCode = providersFile!.content;

    expect(provCode).toContain('"use client";');
    expect(provCode).toContain('import { QueryClient, QueryClientProvider } from "@tanstack/react-query";');
    expect(provCode).toContain('import { ThemeProvider } from "next-themes";');
    expect(provCode).toContain('import { Toaster } from "sonner";');
    expect(provCode).toContain("<QueryClientProvider client={queryClient}>");
    expect(provCode).toContain("<ThemeProvider attribute=\"class\" defaultTheme=\"system\" enableSystem>");
    expect(provCode).toContain("<Toaster richColors position=\"top-right\" />");

    // RootLayout (app/layout.tsx) should import and wrap children in AppProviders
    const layoutFile = result.files.find((f) => f.filename === "app/layout.tsx");
    expect(layoutFile).toBeDefined();
    const layoutCode = layoutFile!.content;

    expect(layoutCode).toContain('import { AppProviders } from "./providers";');
    expect(layoutCode).toContain("<AppProviders>{children}</AppProviders>");
  });
});
