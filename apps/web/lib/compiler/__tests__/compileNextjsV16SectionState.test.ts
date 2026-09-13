import { describe, it, expect } from "vitest";
import { BackendNode } from "@/types/canvas";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";

describe("compileNextjsV16SectionState", () => {
  it("generates typed useState hooks in client section components when section.states are present", () => {
    const webPageNode: BackendNode = {
      id: "node-page-stateful",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/products",
        appSlug: "product-store",
        sections: [
          {
            id: "sec-filters",
            name: "Filter Section",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [],
            states: [
              {
                id: "st-search",
                name: "searchQuery",
                type: "string",
                defaultValue: "shoes",
              },
              {
                id: "st-page",
                name: "pageNumber",
                type: "number",
                defaultValue: 1,
              },
              {
                id: "st-in-stock",
                name: "inStockOnly",
                type: "boolean",
                defaultValue: true,
              },
              {
                id: "st-tags",
                name: "selectedTags",
                type: "array",
                defaultValue: ["running", "sport"],
              },
            ],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient([webPageNode]);
    const filterSectionFile = result.files.find((f) =>
      f.filename.includes("FilterSection.tsx"),
    );

    expect(filterSectionFile).toBeDefined();
    const code = filterSectionFile!.content;

    // Must be a client component
    expect(code).toContain('"use client";');
    // Must import useState from react
    expect(code).toMatch(/import React,\s*{\s*useState\s*}\s*from\s*"react";/);
    // Must declare useState for each defined state variable
    expect(code).toContain('const [searchQuery, setSearchQuery] = useState<string>("shoes");');
    expect(code).toContain("const [pageNumber, setPageNumber] = useState<number>(1);");
    expect(code).toContain("const [inStockOnly, setInStockOnly] = useState<boolean>(true);");
    expect(code).toContain('const [selectedTags, setSelectedTags] = useState<unknown[]>(["running","sport"]);');
  });

  it("automatically forces client component mode when section defines states even if renderMode is server", () => {
    const webPageNode: BackendNode = {
      id: "node-page-auto-client",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/dashboard",
        appSlug: "dash-app",
        sections: [
          {
            id: "sec-metric",
            name: "Metric Section",
            renderMode: "server", // declared server, but has local states
            loadStrategy: "eager",
            actions: [],
            states: [
              {
                id: "st-expanded",
                name: "isExpanded",
                type: "boolean",
                defaultValue: false,
              },
            ],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient([webPageNode]);
    const metricSectionFile = result.files.find((f) =>
      f.filename.includes("MetricSection.tsx"),
    );

    expect(metricSectionFile).toBeDefined();
    const code = metricSectionFile!.content;

    // Must promote to "use client" because useState is required
    expect(code).toContain('"use client";');
    expect(code).toContain("const [isExpanded, setIsExpanded] = useState<boolean>(false);");
  });

  it("imports and calls Zustand store hook when a section action has storeActionBinding", () => {
    const webPageNode: BackendNode = {
      id: "node-page-checkout",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/checkout",
        appSlug: "shop-app",
        sections: [
          {
            id: "sec-cart-summary",
            name: "Cart Summary",
            renderMode: "server",
            actions: [
              {
                id: "act-clear-cart",
                name: "Clear Cart",
                event: "click",
                storeActionBinding: {
                  storeName: "Cart",
                  actionName: "reset",
                  actionType: "custom",
                },
              },
            ],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient([webPageNode]);
    const cartSummaryFile = result.files.find((f) =>
      f.filename.includes("CartSummarySection.tsx"),
    );

    expect(cartSummaryFile).toBeDefined();
    const code = cartSummaryFile!.content;

    expect(code).toContain('"use client";');
    expect(code).toContain('import { useCartStore } from "@/lib/stores";');
    expect(code).toContain("const cartStore = useCartStore();");
  });
});

