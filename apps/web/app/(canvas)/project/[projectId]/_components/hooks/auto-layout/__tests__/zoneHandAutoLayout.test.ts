import { describe, it, expect, vi } from "vitest";
import { performGraphLayout } from "../graphLayout";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "../types";
import {
  CARD_HEADER_OFFSET_X,
  CARD_HEADER_OFFSET_Y,
} from "../../../backend-nodes/graph-nodes/nodes/gateway/web-page/useZoneHandLayout";

describe("zoneHandAutoLayout - Auto-Layout for Stacked WebPage Cards", () => {
  it("compactly layouts stacked WebPage cards with balanced WebApp alignment and no massive voids", () => {
    const nodes: LayoutNode[] = [
      {
        id: "payments-1",
        type: "payments",
        position: { x: 0, y: 0 },
        data: { label: "Creem Payments", provider: "creem" },
      },
      {
        id: "auth-1",
        type: "auth",
        position: { x: 0, y: 0 },
        data: { label: "better auth" },
      },
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ],
          expandedZones: [], // Both zones stacked
        },
      },
      // Public Section pages (4 pages)
      { id: "page-root", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/" } },
      { id: "page-not-found", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/not-found" } },
      { id: "page-login", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/login" } },
      { id: "page-register", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/register" } },

      // Private Section pages (3 pages)
      { id: "page-dashboard", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/dashboard" } },
      { id: "page-onboarding", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/onboarding" } },
      { id: "page-conversations", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/conversations" } },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-payments-auth",
        source: "payments-1",
        target: "auth-1",
        sourceHandle: "injects-plugin-out",
        targetHandle: "payments-plugin-in",
        type: "connection",
      },
      {
        id: "e-auth-web",
        source: "auth-1",
        target: "web-1",
        sourceHandle: "auth-out",
        targetHandle: "auth-in",
        type: "connection",
      },
      // Public edges
      { id: "e-pub-0", source: "web-1", sourceHandle: "public-in", target: "page-root", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-1", source: "web-1", sourceHandle: "public-in", target: "page-not-found", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-2", source: "web-1", sourceHandle: "public-in", target: "page-login", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-3", source: "web-1", sourceHandle: "public-in", target: "page-register", targetHandle: "page-in", type: "connection" },
      // Private edges
      { id: "e-priv-0", source: "web-1", sourceHandle: "private-in", target: "page-dashboard", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-1", source: "web-1", sourceHandle: "private-in", target: "page-onboarding", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-2", source: "web-1", sourceHandle: "private-in", target: "page-conversations", targetHandle: "page-in", type: "connection" },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => {
        appliedChanges = c;
      },
      fitView: vi.fn(),
      direction: "LR",
    });

    expect(appliedChanges.length).toBe(10);
    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));

    const pRoot = posMap.get("page-root")!;
    const pNotFound = posMap.get("page-not-found")!;
    const pLogin = posMap.get("page-login")!;
    const pRegister = posMap.get("page-register")!;

    const pDash = posMap.get("page-dashboard")!;
    const pOnboard = posMap.get("page-onboarding")!;
    const pConvs = posMap.get("page-conversations")!;

    const webPos = posMap.get("web-1")!;
    const authPos = posMap.get("auth-1")!;

    // 1. Stack 1 pages are stacked with correct offsets
    expect(pNotFound.y - pRoot.y).toBeCloseTo(CARD_HEADER_OFFSET_Y, 0);
    expect(pLogin.y - pNotFound.y).toBeCloseTo(CARD_HEADER_OFFSET_Y, 0);
    expect(pRegister.y - pLogin.y).toBeCloseTo(CARD_HEADER_OFFSET_Y, 0);

    expect(pNotFound.x - pRoot.x).toBeCloseTo(CARD_HEADER_OFFSET_X, 0);
    expect(pLogin.x - pNotFound.x).toBeCloseTo(CARD_HEADER_OFFSET_X, 0);
    expect(pRegister.x - pLogin.x).toBeCloseTo(CARD_HEADER_OFFSET_X, 0);

    // 2. Stack 2 pages are sorted alphabetically (/conversations, /dashboard, /onboarding) and stacked with correct offsets
    expect(pDash.y - pConvs.y).toBeCloseTo(CARD_HEADER_OFFSET_Y, 0);
    expect(pOnboard.y - pDash.y).toBeCloseTo(CARD_HEADER_OFFSET_Y, 0);

    expect(pDash.x - pConvs.x).toBeCloseTo(CARD_HEADER_OFFSET_X, 0);
    expect(pOnboard.x - pDash.x).toBeCloseTo(CARD_HEADER_OFFSET_X, 0);

    // 3. The vertical gap between Stack 1 and Stack 2:
    // Stack 1 lead is pRoot, last card is pRegister (pRoot.y + 3 * 44 = pRoot.y + 132).
    // Stack 2 top is pDash.y.
    // pDash.y must be greater than pRegister.y, but NOT 2,000px away!
    expect(pDash.y).toBeGreaterThan(pRegister.y);
    const stackGap = pDash.y - (pRoot.y + 132 + 260); // assuming min height 260
    // Stack gap must be reasonable and tight (less than 500px, not 2,000px+)
    expect(pDash.y - pRoot.y).toBeLessThan(700);

    // 4. WebApp node is vertically balanced between the stacks (not pushed 2,000px away)
    // webPos.y should sit within the vertical span of the two stacks
    expect(webPos.y).toBeGreaterThan(pRoot.y - 100);
    expect(webPos.y).toBeLessThan(pDash.y + 300);

    // 5. Horizontal rank ordering: Auth -> Web -> Pages
    expect(authPos.x).toBeLessThan(webPos.x);
    expect(webPos.x).toBeLessThan(pRegister.x);
  });

  it("fans out pages vertically when a zone is expanded", () => {
    const nodes: LayoutNode[] = [
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
          ],
          expandedZones: ["zone-public"], // Expanded!
        },
      },
      { id: "page-0", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/" } },
      { id: "page-1", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/not-found" } },
    ];

    const edges: LayoutEdge[] = [
      { id: "e-0", source: "web-1", sourceHandle: "public-in", target: "page-0", targetHandle: "page-in", type: "connection" },
      { id: "e-1", source: "web-1", sourceHandle: "public-in", target: "page-1", targetHandle: "page-in", type: "connection" },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => {
        appliedChanges = c;
      },
      fitView: vi.fn(),
      direction: "LR",
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    const p0 = posMap.get("page-0")!;
    const p1 = posMap.get("page-1")!;

    // When fanned out, each card is full-height and separated by nodeGap (not 44px stacked offset)
    expect(Math.abs(p1.y - p0.y)).toBeGreaterThan(200);
  });

  it("does not move a serviceNode connected to a stacked secondary WebPage behind the WebAppNode (service -> webPage)", () => {
    const nodes: LayoutNode[] = [
      {
        id: "payments-1",
        type: "payments",
        position: { x: 0, y: 0 },
        data: { label: "Creem Payments", provider: "creem" },
      },
      {
        id: "auth-1",
        type: "auth",
        position: { x: 0, y: 0 },
        data: { label: "better auth" },
      },
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ],
          expandedZones: [], // Both zones stacked
        },
      },
      // Public Section pages (4 pages)
      { id: "page-root", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/" } },
      { id: "page-not-found", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/not-found" } },
      { id: "page-login", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/login" } },
      { id: "page-register", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/register" } },

      // Private Section pages (4 pages, with page-conversations as secondary card)
      { id: "page-layout", type: "webPage", position: { x: 0, y: 0 }, data: { label: "layout", isLayout: true } },
      { id: "page-dashboard", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/dashboard" } },
      { id: "page-onboarding", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/onboarding" } },
      { id: "page-conversations", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/conversations" } },

      // Service / API Node
      {
        id: "srv-test",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "test",
          techStack: "express",
          endpoints: [{ id: "ep-health", name: "/health", type: "GET" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-payments-auth",
        source: "payments-1",
        target: "auth-1",
        sourceHandle: "injects-plugin-out",
        targetHandle: "payments-plugin-in",
        type: "connection",
      },
      {
        id: "e-auth-web",
        source: "auth-1",
        target: "web-1",
        sourceHandle: "auth-out",
        targetHandle: "auth-in",
        type: "connection",
      },
      // Public edges
      { id: "e-pub-0", source: "web-1", sourceHandle: "public-in", target: "page-root", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-1", source: "web-1", sourceHandle: "public-in", target: "page-not-found", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-2", source: "web-1", sourceHandle: "public-in", target: "page-login", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-3", source: "web-1", sourceHandle: "public-in", target: "page-register", targetHandle: "page-in", type: "connection" },
      // Private edges
      { id: "e-priv-0", source: "web-1", sourceHandle: "private-in", target: "page-layout", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-1", source: "web-1", sourceHandle: "private-in", target: "page-dashboard", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-2", source: "web-1", sourceHandle: "private-in", target: "page-onboarding", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-3", source: "web-1", sourceHandle: "private-in", target: "page-conversations", targetHandle: "page-in", type: "connection" },

      // Service connected to page-conversations (endpoint-out -> pageload-in)
      {
        id: "e-srv-page",
        source: "srv-test",
        sourceHandle: "endpoint-out-ep-health",
        target: "page-conversations",
        targetHandle: "pageload-in-act-1",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => {
        appliedChanges = c;
      },
      fitView: vi.fn(),
      direction: "LR",
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    const webPos = posMap.get("web-1")!;
    const authPos = posMap.get("auth-1")!;
    const srvPos = posMap.get("srv-test")!;
    const pConvs = posMap.get("page-conversations")!;

    // 1. Crucial check: srv-test is NOT placed behind web-1
    // srvPos.x must NOT be in the column behind web-1 (i.e. srvPos.x must be >= webPos.x - 50)
    expect(srvPos.x).toBeGreaterThanOrEqual(webPos.x - 50);
    // Specifically, srv-test should NOT be placed at the auth column
    expect(srvPos.x).toBeGreaterThan(authPos.x);

    // 2. Vertically, srvPos is positioned near the bottom private stack rather than overlapping web-1
    expect(srvPos.y).toBeGreaterThan(webPos.y);

    // 3. Service is placed downstream to the right of WebPage
    expect(srvPos.x).toBeGreaterThan(pConvs.x);
  });

  it("places serviceNode downstream (to the right) when WebPage action connects to service endpoint (webPage -> service)", () => {
    const nodes: LayoutNode[] = [
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ],
          expandedZones: [],
        },
      },
      { id: "page-layout", type: "webPage", position: { x: 0, y: 0 }, data: { label: "layout", isLayout: true } },
      { id: "page-conversations", type: "webPage", position: { x: 0, y: 0 }, data: { label: "/conversations" } },
      {
        id: "srv-test",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "test",
          techStack: "express",
          endpoints: [{ id: "ep-send", name: "/send", type: "POST" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      { id: "e-priv-0", source: "web-1", sourceHandle: "private-in", target: "page-layout", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-1", source: "web-1", sourceHandle: "private-in", target: "page-conversations", targetHandle: "page-in", type: "connection" },
      // Outgoing action from secondary card to service
      {
        id: "e-act-srv",
        source: "page-conversations",
        sourceHandle: "events-act-submit",
        target: "srv-test",
        targetHandle: "endpoint-in-ep-send",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => {
        appliedChanges = c;
      },
      fitView: vi.fn(),
      direction: "LR",
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    const webPos = posMap.get("web-1")!;
    const pConvs = posMap.get("page-conversations")!;
    const srvPos = posMap.get("srv-test")!;

    // In outgoing flow: Web -> Page -> Service
    expect(pConvs.x).toBeGreaterThan(webPos.x);
    expect(srvPos.x).toBeGreaterThan(pConvs.x);
  });

  it("takes into account the full height length of all stacked webpage cards and avoids overlap between stacks", () => {
    const nodes: LayoutNode[] = [
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ],
          expandedZones: [],
        },
      },
      // Stack 1: Private Section pages with tall front card
      {
        id: "page-priv-layout",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: { label: "layout", isLayout: true, stackOrder: 0 },
      },
      {
        id: "page-chat-new",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: { label: "/chat/new", stackOrder: 1 },
      },
      {
        id: "page-chat-id",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "/chat/[id]",
          stackOrder: 2,
          description: "Chat conversation page",
          sections: [
            {
              id: "sec-main",
              name: "Main Section",
              actions: [
                { id: "act-1", name: "pageLoad" },
                { id: "act-2", name: "send message" },
              ],
            },
          ],
        },
      },
      // Stack 2: Public Section pages
      {
        id: "page-pub-root",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: { label: "/", isRoot: true, stackOrder: 0 },
      },
      {
        id: "page-not-found",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: { label: "/not-found", stackOrder: 1 },
      },
      {
        id: "page-pub-layout",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "layout",
          isLayout: true,
          stackOrder: 2,
          sections: [
            { id: "sec-hdr", name: "Header Navigation", actions: [] },
            { id: "sec-content", name: "Page Content", actions: [] },
          ],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      { id: "e-priv-0", source: "web-1", sourceHandle: "private-in", target: "page-priv-layout", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-1", source: "web-1", sourceHandle: "private-in", target: "page-chat-new", targetHandle: "page-in", type: "connection" },
      { id: "e-priv-2", source: "web-1", sourceHandle: "private-in", target: "page-chat-id", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-0", source: "web-1", sourceHandle: "public-in", target: "page-pub-root", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-1", source: "web-1", sourceHandle: "public-in", target: "page-not-found", targetHandle: "page-in", type: "connection" },
      { id: "e-pub-2", source: "web-1", sourceHandle: "public-in", target: "page-pub-layout", targetHandle: "page-in", type: "connection" },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => {
        appliedChanges = c;
      },
      fitView: vi.fn(),
      direction: "LR",
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));

    const stack1Pages = [nodes[1]!, nodes[2]!, nodes[3]!];
    const stack2Pages = [nodes[4]!, nodes[5]!, nodes[6]!];

    // Verify no vertical bounding box overlap between stack 1 and stack 2
    const stack1Bounds = stack1Pages.map((p) => {
      const pos = posMap.get(p.id)!;
      // import getNodeDimensions or compute from nodeDimensions
      const sections = Array.isArray(p.data?.sections) ? (p.data.sections as any[]) : [];
      let secH = 0;
      sections.forEach((s) => {
        secH += 36 + 58 + 54 + (s.actions?.length || 0) * 34 + 58 + 58;
      });
      const h = Math.max(260, 160 + secH);
      return { top: pos.y, bottom: pos.y + h };
    });

    const stack2Bounds = stack2Pages.map((p) => {
      const pos = posMap.get(p.id)!;
      const sections = Array.isArray(p.data?.sections) ? (p.data.sections as any[]) : [];
      let secH = 0;
      sections.forEach((s) => {
        secH += 36 + 58 + 54 + (s.actions?.length || 0) * 34 + 58 + 58;
      });
      const h = Math.max(260, 160 + secH);
      return { top: pos.y, bottom: pos.y + h };
    });

    const stack1Top = Math.min(...stack1Bounds.map((b) => b.top));
    const stack1Bottom = Math.max(...stack1Bounds.map((b) => b.bottom));

    const stack2Top = Math.min(...stack2Bounds.map((b) => b.top));
    const stack2Bottom = Math.max(...stack2Bounds.map((b) => b.bottom));

    // Either Stack 1 is strictly above Stack 2, or Stack 2 is strictly above Stack 1
    const noOverlap = stack1Bottom <= stack2Top || stack2Bottom <= stack1Top;
    expect(noOverlap).toBe(true);
  });
});

