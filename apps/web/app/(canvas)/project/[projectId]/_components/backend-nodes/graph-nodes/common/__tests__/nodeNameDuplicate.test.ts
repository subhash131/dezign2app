import { describe, it, expect } from "vitest";
import { checkNodeNameDuplicate } from "../NodeHeader";
import { BackendNode, BackendEdge } from "@/types/canvas";

const createMockNode = (
  id: string,
  type: BackendNode["type"],
  label: string,
): BackendNode =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: { label },
  }) as BackendNode;

const createMockEdge = (source: string, target: string): BackendEdge =>
  ({
    id: `edge-${source}-${target}`,
    source,
    target,
    type: "connection",
  }) as BackendEdge;

describe("checkNodeNameDuplicate", () => {
  it("returns isDuplicate: false for empty or whitespace labels", () => {
    const nodes: BackendNode[] = [createMockNode("srv-1", "service", "conversations")];
    expect(checkNodeNameDuplicate("srv-2", "", "service", nodes, [])).toEqual({
      isDuplicate: false,
    });
    expect(checkNodeNameDuplicate("srv-2", "   ", "service", nodes, [])).toEqual({
      isDuplicate: false,
    });
    expect(checkNodeNameDuplicate("srv-2", undefined, "service", nodes, [])).toEqual({
      isDuplicate: false,
    });
  });

  describe("Service & WebApp collision in apps/ workspace", () => {
    it("detects duplicate between two services", () => {
      const nodes: BackendNode[] = [createMockNode("srv-1", "service", "conversations")];
      const result = checkNodeNameDuplicate("srv-2", "Conversations", "service", nodes, []);
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe("Service");
    });

    it("detects duplicate between a WebApp and a Service (both compile to apps/<name>)", () => {
      const nodes: BackendNode[] = [createMockNode("srv-1", "service", "conversations")];
      const result = checkNodeNameDuplicate("app-1", "conversations", "webApp", nodes, []);
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe("Service");
    });

    it("detects duplicate between a Service and a WebApp", () => {
      const nodes: BackendNode[] = [createMockNode("app-1", "webApp", "conversations")];
      const result = checkNodeNameDuplicate("srv-1", "conversations", "service", nodes, []);
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe("Web App");
    });
  });

  describe("WebPage vs Service / Server", () => {
    it("allows a WebPage and a Service to have the exact same name without collision", () => {
      const nodes: BackendNode[] = [
        createMockNode("srv-1", "service", "conversations"),
        createMockNode("app-1", "webApp", "main-app"),
      ];
      const edges = [createMockEdge("app-1", "page-1")];
      const result = checkNodeNameDuplicate("page-1", "/conversations", "webPage", nodes, edges);
      expect(result.isDuplicate).toBe(false);
    });

    it("allows a WebPage with label 'conversations' even when service is named 'conversations'", () => {
      const nodes: BackendNode[] = [
        createMockNode("srv-1", "service", "conversations"),
        createMockNode("app-1", "webApp", "portal"),
      ];
      const edges = [createMockEdge("app-1", "page-1")];
      const result = checkNodeNameDuplicate("page-1", "conversations", "webPage", nodes, edges);
      expect(result.isDuplicate).toBe(false);
    });

    it("detects duplicate when two WebPages in the same WebApp have the same route", () => {
      const nodes: BackendNode[] = [
        createMockNode("app-1", "webApp", "portal"),
        createMockNode("page-1", "webPage", "/conversations"),
      ];
      const edges = [
        createMockEdge("app-1", "page-1"),
        createMockEdge("app-1", "page-2"),
      ];
      const result = checkNodeNameDuplicate("page-2", "/conversations", "webPage", nodes, edges);
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe("Web Page");
    });

    it("allows WebPages in DIFFERENT WebApps to have the same route", () => {
      const nodes: BackendNode[] = [
        createMockNode("app-1", "webApp", "admin-app"),
        createMockNode("app-2", "webApp", "customer-app"),
        createMockNode("page-1", "webPage", "/dashboard"),
      ];
      const edges = [
        createMockEdge("app-1", "page-1"),
        createMockEdge("app-2", "page-2"),
      ];
      const result = checkNodeNameDuplicate("page-2", "/dashboard", "webPage", nodes, edges);
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("Database Entities (Tables)", () => {
    it("allows a database table and a service to have the same name (e.g. conversations)", () => {
      const nodes: BackendNode[] = [createMockNode("srv-1", "service", "conversations")];
      const result = checkNodeNameDuplicate("table-1", "conversations", "entity", nodes, []);
      expect(result.isDuplicate).toBe(false);
    });

    it("detects duplicate when two database tables have the same name", () => {
      const nodes: BackendNode[] = [createMockNode("table-1", "entity", "conversations")];
      const result = checkNodeNameDuplicate("table-2", "conversations", "entity", nodes, []);
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe("Table");
    });
  });

  describe("Storage Buckets", () => {
    it("detects duplicate between storage buckets", () => {
      const nodes: BackendNode[] = [createMockNode("storage-1", "storage", "avatars")];
      const result = checkNodeNameDuplicate("storage-2", "avatars", "storage", nodes, []);
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe("Storage Bucket");
    });

    it("allows a storage bucket and a service to have the same name", () => {
      const nodes: BackendNode[] = [createMockNode("srv-1", "service", "media")];
      const result = checkNodeNameDuplicate("storage-1", "media", "storage", nodes, []);
      expect(result.isDuplicate).toBe(false);
    });
  });
});
