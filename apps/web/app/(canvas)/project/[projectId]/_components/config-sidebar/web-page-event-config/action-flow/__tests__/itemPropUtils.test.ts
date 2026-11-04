import { describe, it, expect } from "vitest";
import type { BackendNode, CustomTypeItem } from "@workspace/canvas/types";
import type { PageStateObject } from "@/types/canvas";
import {
  extractBaseTypeName,
  resolveItemPropsFromType,
  resolveItemPropsFromState,
} from "../itemPropUtils";

describe("itemPropUtils", () => {
  describe("extractBaseTypeName", () => {
    it("extracts base name from standard array brackets", () => {
      expect(extractBaseTypeName("ChatMessage[]")).toBe("ChatMessage");
      expect(extractBaseTypeName("User[][]")).toBe("User");
    });

    it("extracts base name from generic Array and List notation", () => {
      expect(extractBaseTypeName("Array<ChatMessage>")).toBe("ChatMessage");
      expect(extractBaseTypeName("List<TodoItem>")).toBe("TodoItem");
      expect(extractBaseTypeName("Array<Array<Order>>")).toBe("Order");
    });

    it("extracts table name from db prefixes", () => {
      expect(extractBaseTypeName("db:users:array")).toBe("users");
      expect(extractBaseTypeName("db:orders:single")).toBe("orders");
      expect(extractBaseTypeName("db:products")).toBe("products");
    });

    it("cleans null or undefined union types", () => {
      expect(extractBaseTypeName("ChatMessage[] | null")).toBe("ChatMessage");
      expect(extractBaseTypeName("undefined | Array<User>")).toBe("User");
    });

    it("handles plain type names", () => {
      expect(extractBaseTypeName("ChatMessage")).toBe("ChatMessage");
      expect(extractBaseTypeName("")).toBe("");
    });
  });

  describe("resolveItemPropsFromType", () => {
    it("resolves fields from canvas TypesNode", () => {
      const mockTypesNode: BackendNode = {
        id: "node-types-1",
        type: "types",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "App Types",
          types: [
            {
              id: "type-chat-msg",
              name: "ChatMessage",
              kind: "interface",
              fields: [
                { id: "f1", name: "id", type: "string", description: "Message ID" },
                { id: "f2", name: "role", type: "string" },
                { id: "f3", name: "content", type: "string" },
                { id: "f4", name: "createdAt", type: "string" },
              ],
            },
          ],
        },
      };

      const props = resolveItemPropsFromType("ChatMessage[]", [mockTypesNode]);
      expect(props.map((p) => p.value)).toEqual(["id", "role", "content", "createdAt"]);
      expect(props[0]?.description).toBe("Message ID");
    });

    it("resolves columns from Database / Entity nodes", () => {
      const mockEntityNode: BackendNode = {
        id: "entity-users",
        type: "entity",
        position: { x: 0, y: 0 },
        fractionalIndex: "a1",
        data: {
          label: "users",
          tableName: "users",
          columns: [
            { name: "id", type: "uuid", isPrimary: true },
            { name: "email", type: "varchar" },
            { name: "avatarUrl", type: "text" },
          ],
        },
      };

      const props = resolveItemPropsFromType("db:users:array", [mockEntityNode]);
      expect(props.map((p) => p.value)).toEqual(["id", "email", "avatarUrl"]);
    });

    it("falls back to standard known type ChatMessage if no TypesNode has it yet", () => {
      const props = resolveItemPropsFromType("ChatMessage[]", []);
      expect(props.map((p) => p.value)).toEqual(["id", "role", "content", "createdAt"]);
    });
  });

  describe("resolveItemPropsFromState", () => {
    it("resolves props when state object has ChatMessage[] type", () => {
      const stateObj: PageStateObject = {
        id: "st-messages",
        name: "messages",
        type: "ChatMessage[]",
      };

      const props = resolveItemPropsFromState(stateObj, []);
      expect(props.map((p) => p.value)).toContain("id");
      expect(props.map((p) => p.value)).toContain("content");
      expect(props.map((p) => p.value)).toContain("role");
      expect(props.map((p) => p.value)).toContain("createdAt");
    });

    it("resolves inline itemSchema from PageStateObject", () => {
      const stateObj: PageStateObject = {
        id: "st-custom",
        name: "customList",
        type: "array",
        itemSchema: [
          { name: "productId", type: "string" },
          { name: "quantity", type: "number" },
          { name: "price", type: "number" },
        ],
      };

      const props = resolveItemPropsFromState(stateObj, []);
      expect(props.map((p) => p.value)).toEqual(["productId", "quantity", "price"]);
    });

    it("provides fallback identifier fields when type is generic or unknown", () => {
      const stateObj: PageStateObject = {
        id: "st-unknown",
        name: "someUnknownList",
        type: "string[]",
      };

      const props = resolveItemPropsFromState(stateObj, []);
      expect(props.map((p) => p.value)).toEqual([
        "id",
        "_id",
        "uuid",
        "name",
        "title",
        "slug",
        "key",
      ]);
    });
  });
});

